const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const auditLog = require('../utils/auditLog');
const { sendPushToUser } = require('../services/pushService');

const emitTaskEvent = (io, event, data, groupId) => {
  if (!io) return;
  io.emit(event, data);
  if (groupId) io.to(`group:${groupId}`).emit(event, data);
};

// ── Estado individual por asignado (task_assignees) ────────────────────────

// Sincroniza las filas de task_assignees con la lista de asignados actual:
// agrega los nuevos (status por defecto 'pending'), quita a quien ya no está,
// preserva el status de quien sigue asignado.
const syncAssignees = async (taskId, assignedToArr) => {
  if (assignedToArr.length === 0) {
    await db.query('DELETE FROM task_assignees WHERE task_id = $1', [taskId]);
    return;
  }
  await db.query(
    'DELETE FROM task_assignees WHERE task_id = $1 AND user_id != ALL($2::uuid[])',
    [taskId, assignedToArr]
  );
  await Promise.all(assignedToArr.map(uid =>
    db.query(
      `INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)
       ON CONFLICT (task_id, user_id) DO NOTHING`,
      [taskId, uid]
    )
  ));
};

// El status global de la tarea se puede seguir forzando desde PUT /:id (dropdown
// existente): en ese caso se aplica al status de TODOS los asignados por igual,
// preservando el comportamiento binario que ya conocía el resto de la app.
const setAllAssigneesStatus = async (taskId, status) => {
  await db.query(
    `UPDATE task_assignees
     SET status = $2::varchar, completed_at = CASE WHEN $2::varchar = 'completed' THEN NOW() ELSE NULL END
     WHERE task_id = $1`,
    [taskId, status]
  );
};

// Recalcula tasks.status a partir del status individual de cada asignado:
// completed solo si TODOS completaron, in_progress si alguno avanzó, pending si nadie.
// Si la tarea no tiene asignados trackeados (task_assignees vacío), no toca nada.
const recalculateTaskStatus = async (taskId) => {
  const { rows } = await db.query('SELECT status FROM task_assignees WHERE task_id = $1', [taskId]);
  if (rows.length === 0) return null;
  let status;
  if (rows.every(r => r.status === 'completed')) status = 'completed';
  else if (rows.some(r => r.status === 'in_progress' || r.status === 'completed')) status = 'in_progress';
  else status = 'pending';
  await db.query('UPDATE tasks SET status = $2, updated_at = NOW() WHERE id = $1', [taskId, status]);
  return status;
};

// Notificaciones a líderes/admin + sincronización con Fondo Emprender al completar una tarea.
// Compartido entre updateTask (status explícito vía PUT) y updateMyAssigneeStatus (recalculado).
const notifyTaskCompleted = async (req, id, taskTitle) => {
  const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
  const actorName = actor.rows[0]?.name ?? 'Alguien';
  const extraData = JSON.stringify({ completedById: req.user.userId, completedByName: actorName });
  const leaders = await db.query(`SELECT id FROM users WHERE role IN ('admin','leader') AND id != $1`, [req.user.userId]);
  await Promise.all(leaders.rows.map(l => {
    const notifId = uuidv4();
    const notifMsg = `"${taskTitle}" fue completada`;
    return db.query(`INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, 'task_completed', $3, $4, $5)`,
      [notifId, l.id, notifMsg, id, extraData])
    .then(() => {
      req.io?.to(`user:${l.id}`).emit('notification:received', {
        id: notifId, type: 'task_completed', message: notifMsg, taskId: id,
        extra: { completedById: req.user.userId, completedByName: actorName }, read: false, createdAt: new Date().toISOString(),
      });
      sendPushToUser(l.id, { title: 'Tarea completada', body: notifMsg, url: '/tasks', tag: notifId });
    });
  }));

  // Sincronizar con Fondo Emprender si la tarea tiene un vínculo activo
  try {
    const linkResult = await db.query('SELECT * FROM task_fondo_links WHERE task_id = $1', [id]);
    if (linkResult.rows.length > 0) {
      const link = linkResult.rows[0];
      if (link.link_type === 'macroproceso') {
        const syncNow = new Date();
        const syncAnio = syncNow.getFullYear();
        const syncMes  = syncNow.getMonth() + 1;
        await db.query(
          `INSERT INTO fondo_detalle_macroprocesos (id, empresa_id, macroproceso_id, anio, mes, estado)
           VALUES ($1, $2, $3, $4, $5, 'done')
           ON CONFLICT (empresa_id, macroproceso_id, anio, mes) DO UPDATE SET estado = 'done'`,
          [uuidv4(), link.empresa_id, link.macro_id, syncAnio, syncMes]
        );
        req.io?.emit('empresa:updated', { empresaId: link.empresa_id, tipo: 'detalle' });
      } else if (link.link_type === 'checklist') {
        await db.query(
          `INSERT INTO fondo_checklist_meses (id, empresa_id, anio, mes)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (empresa_id, anio, mes) DO NOTHING`,
          [uuidv4(), link.empresa_id, link.anio, link.mes]
        );
        const mesRow = await db.query(
          'SELECT id FROM fondo_checklist_meses WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
          [link.empresa_id, link.anio, link.mes]
        );
        const mesId = mesRow.rows[0].id;
        await db.query(
          `INSERT INTO fondo_checklist_items (id, mes_id, proceso_id, estado)
           VALUES ($1, $2, $3, 'done')
           ON CONFLICT (mes_id, proceso_id) DO UPDATE SET estado = 'done'`,
          [uuidv4(), mesId, link.proceso_id]
        );
        req.io?.emit('empresa:updated', { empresaId: link.empresa_id, anio: link.anio, mes: link.mes, tipo: 'checklist' });
      }
    }
  } catch (fondoErr) {
    // No bloquear la respuesta si la sincronización con fondo falla
    logger.warn({ taskId: id, err: fondoErr.message }, 'Fondo sync failed on task completion');
  }
};

const getTasks = async (req, res, next) => {
  try {
    const { status, priority, assignedTo, groupId, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let i = 1;
    let where = 'WHERE 1=1';

    if (status) { where += ` AND t.status = $${i++}`; params.push(status); }
    if (priority) { where += ` AND t.priority = $${i++}`; params.push(priority); }
    if (assignedTo) { where += ` AND t.assigned_to = $${i++}`; params.push(assignedTo); }
    if (groupId) { where += ` AND t.group_id = $${i++}`; params.push(groupId); }
    if (search) {
      where += ` AND to_tsvector('spanish', t.title || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('spanish', $${i++})`;
      params.push(search);
    }
    // Excluir templates del listado principal — solo instancias y tareas normales
    where += ` AND (t.is_recurring = false OR t.template_id IS NOT NULL)`;

    const tasksQuery = `
      SELECT t.*,
        u.name AS assigned_to_name,
        creator.name AS created_by_name,
        g.name AS group_name,
        (SELECT json_agg(json_build_object(
           'id', s.id, 'title', s.title, 'completed', s.completed,
           'completed_by', s.completed_by, 'completed_by_name', su.name, 'completed_at', s.completed_at,
           'created_at', s.created_at
         ) ORDER BY s.created_at)
         FROM task_subtasks s LEFT JOIN users su ON su.id = s.completed_by WHERE s.task_id = t.id) AS subtasks,
        (SELECT json_agg(c ORDER BY c.created_at) FROM task_comments c WHERE c.task_id = t.id) AS comments,
        (SELECT json_agg(tg.id) FROM task_tag_assignment ta JOIN task_tags tg ON tg.id = ta.tag_id WHERE ta.task_id = t.id) AS tag_ids,
        (SELECT EXISTS(SELECT 1 FROM task_fondo_links fl WHERE fl.task_id = t.id)) AS has_fondo_link,
        (SELECT json_agg(json_build_object('userId', ta2.user_id, 'name', au.name, 'status', ta2.status, 'completedAt', ta2.completed_at) ORDER BY au.name)
         FROM task_assignees ta2 JOIN users au ON au.id = ta2.user_id WHERE ta2.task_id = t.id) AS assignees,
        (SELECT json_build_object('id', dr.id, 'reason', dr.reason, 'requestedBy', dr.requested_by, 'requestedByName', rbu.name, 'createdAt', dr.created_at)
         FROM task_delete_requests dr JOIN users rbu ON rbu.id = dr.requested_by
         WHERE dr.task_id = t.id AND dr.status = 'pending' LIMIT 1) AS pending_delete_request
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users creator ON creator.id = t.user_id
      LEFT JOIN groups g ON g.id = t.group_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(limit, offset);

    const countQuery = `SELECT COUNT(*) FROM tasks t ${where}`;
    const [tasksResult, countResult] = await Promise.all([
      db.query(tasksQuery, params),
      db.query(countQuery, params.slice(0, -2)),
    ]);

    res.json({
      tasks: tasksResult.rows.map(normalizeTask),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
};

const FULL_TASK_QUERY = `
  SELECT t.*,
    u.name AS assigned_to_name,
    creator.name AS created_by_name,
    g.name AS group_name,
    (SELECT json_agg(json_build_object(
       'id', s.id, 'title', s.title, 'completed', s.completed,
       'completed_by', s.completed_by, 'completed_by_name', su.name, 'completed_at', s.completed_at,
       'created_at', s.created_at
     ) ORDER BY s.created_at)
     FROM task_subtasks s LEFT JOIN users su ON su.id = s.completed_by WHERE s.task_id = t.id) AS subtasks,
    (SELECT json_agg(c ORDER BY c.created_at) FROM task_comments c WHERE c.task_id = t.id) AS comments,
    (SELECT json_agg(tg.id) FROM task_tag_assignment ta JOIN task_tags tg ON tg.id = ta.tag_id WHERE ta.task_id = t.id) AS tag_ids,
    (SELECT EXISTS(SELECT 1 FROM task_fondo_links fl WHERE fl.task_id = t.id)) AS has_fondo_link,
    (SELECT json_agg(json_build_object('userId', ta2.user_id, 'name', au.name, 'status', ta2.status, 'completedAt', ta2.completed_at) ORDER BY au.name)
     FROM task_assignees ta2 JOIN users au ON au.id = ta2.user_id WHERE ta2.task_id = t.id) AS assignees,
    (SELECT json_build_object('id', dr.id, 'reason', dr.reason, 'requestedBy', dr.requested_by, 'requestedByName', rbu.name, 'createdAt', dr.created_at)
     FROM task_delete_requests dr JOIN users rbu ON rbu.id = dr.requested_by
     WHERE dr.task_id = t.id AND dr.status = 'pending' LIMIT 1) AS pending_delete_request
  FROM tasks t
  LEFT JOIN users u ON u.id = t.assigned_to
  LEFT JOIN users creator ON creator.id = t.user_id
  LEFT JOIN groups g ON g.id = t.group_id
  WHERE t.id = $1
`;

const fetchFullTask = async (id) => {
  const result = await db.query(FULL_TASK_QUERY, [id]);
  return result.rows[0] ? normalizeTask(result.rows[0]) : null;
};

const getTask = async (req, res, next) => {
  try {
    const task = await fetchFullTask(req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) {
    next(err);
  }
};

const normalizeAssignedTo = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return [val];
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, priority = 'medium', assignedTo: assignedToRaw, dueDate, dueTime, groupId, tagIds = [], isRecurring = false, recurrence = null } = req.body;
    const assignedToArr = normalizeAssignedTo(assignedToRaw);
    const assignedTo = assignedToArr[0] ?? null;
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO tasks (id, user_id, group_id, title, description, status, priority, assigned_to, due_date, due_time, is_recurring, recurrence)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [id, req.user.userId, groupId || null, title, description || null, priority, assignedTo, dueDate || null, dueTime || null, isRecurring, recurrence ? JSON.stringify(recurrence) : null]
    );
    const task = result.rows[0];

    if (tagIds.length > 0) {
      await Promise.all(tagIds.map(tagId =>
        db.query('INSERT INTO task_tag_assignment (task_id, tag_id) VALUES ($1, $2)', [id, tagId])
      ));
    }

    await syncAssignees(id, assignedToArr);

    await auditLog(req.user.userId, 'CREATE', 'tasks', id, { title, priority, assignedTo: assignedToArr });

    const notifTargets = assignedToArr.filter(uid => uid !== req.user.userId);
    if (notifTargets.length > 0) {
      const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
      const actorName = actor.rows[0]?.name ?? 'Alguien';
      const extraData = JSON.stringify({ actorId: req.user.userId, actorName });
      const notifMsg = `${actorName} te asignó la tarea "${title}"`;
      await Promise.all(notifTargets.map(uid => {
        const notifId = uuidv4();
        return db.query(
          `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, 'task_assigned', $3, $4, $5)`,
          [notifId, uid, notifMsg, id, extraData]
        ).then(() => {
          req.io?.to(`user:${uid}`).emit('notification:received', {
            id: notifId, type: 'task_assigned', message: notifMsg, taskId: id,
            extra: { actorId: req.user.userId, actorName }, read: false, createdAt: new Date().toISOString(),
          });
          sendPushToUser(uid, { title: 'Tarea asignada', body: notifMsg, url: '/tasks', tag: notifId });
        });
      }));
    }

    const assignees = assignedToArr.length > 0
      ? (await db.query(
          `SELECT ta.user_id AS "userId", u.name, ta.status, ta.completed_at AS "completedAt"
           FROM task_assignees ta JOIN users u ON u.id = ta.user_id
           WHERE ta.task_id = $1 ORDER BY u.name`,
          [id]
        )).rows
      : [];
    const full = { ...normalizeTask(task), subtasks: [], comments: [], tagIds, assignees };
    emitTaskEvent(req.io, 'task:created', full, groupId);
    logger.info({ taskId: id, userId: req.user.userId }, 'Task created');
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const current = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });

    const old = current.rows[0];
    const { title, description, status, priority, assignedTo: assignedToRaw, dueDate, dueTime, groupId, tagIds } = req.body;
    const assignedToArr = assignedToRaw !== undefined ? normalizeAssignedTo(assignedToRaw) : null;
    const assignedTo = assignedToArr !== null ? (assignedToArr[0] ?? null) : undefined;

    // Resetear reminder si cambia la fecha, la hora o el asignado
    const dueDateChanged = dueDate !== undefined && dueDate !== (old.due_date?.toISOString().slice(0, 10) ?? null);
    const dueTimeChanged = dueTime !== undefined && (dueTime || null) !== old.due_time;
    const assignedChanged = assignedToArr !== null && (assignedToArr[0] ?? null) !== old.assigned_to;
    const resetReminder = dueDateChanged || dueTimeChanged || assignedChanged;

    const result = await db.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = $5,
        due_date = $6,
        due_time = $7,
        group_id = $8,
        reminder_sent_at = CASE WHEN $10 THEN NULL ELSE reminder_sent_at END,
        updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title, description, status, priority, assignedTo ?? old.assigned_to, dueDate ?? old.due_date, dueTime !== undefined ? (dueTime || null) : old.due_time, groupId ?? old.group_id, id, resetReminder]
    );
    const task = result.rows[0];

    if (tagIds !== undefined) {
      await db.query('DELETE FROM task_tag_assignment WHERE task_id = $1', [id]);
      await Promise.all(tagIds.map(tagId =>
        db.query('INSERT INTO task_tag_assignment (task_id, tag_id) VALUES ($1, $2)', [id, tagId])
      ));
    }

    if (assignedToArr !== null) {
      await syncAssignees(id, assignedToArr);
    }
    // Un status explícito (dropdown/Kanban) se aplica a todos los asignados por igual;
    // si solo cambiaron los asignados, el status agregado se recalcula desde sus filas.
    if (status) {
      await setAllAssigneesStatus(id, status);
    } else if (assignedToArr !== null) {
      await recalculateTaskStatus(id);
    }

    const changes = {};
    if (title && title !== old.title) changes.title = { from: old.title, to: title };
    if (status && status !== old.status) changes.status = { from: old.status, to: status };
    if (priority && priority !== old.priority) changes.priority = { from: old.priority, to: priority };
    if (assignedToArr !== null && assignedTo !== old.assigned_to) {
      changes.assignedTo = { from: old.assigned_to, to: assignedTo };
      const notifTargets = assignedToArr.filter(uid => uid !== req.user.userId);
      if (notifTargets.length > 0) {
        const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
        const actorName = actor.rows[0]?.name ?? 'Alguien';
        const extraData = JSON.stringify({ actorId: req.user.userId, actorName });
        const notifMsg = `${actorName} te asignó la tarea "${task.title}"`;
        await Promise.all(notifTargets.map(uid => {
          const notifId = uuidv4();
          return db.query(
            `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, 'task_assigned', $3, $4, $5)`,
            [notifId, uid, notifMsg, id, extraData]
          ).then(() => {
            req.io?.to(`user:${uid}`).emit('notification:received', {
              id: notifId, type: 'task_assigned', message: notifMsg, taskId: id,
              extra: { actorId: req.user.userId, actorName }, read: false, createdAt: new Date().toISOString(),
            });
            sendPushToUser(uid, { title: 'Tarea asignada', body: notifMsg, url: '/tasks', tag: notifId });
          });
        }));
      }
    }

    if (status === 'completed' && old.status !== 'completed') {
      await notifyTaskCompleted(req, id, task.title);
    }

    await auditLog(req.user.userId, 'UPDATE', 'tasks', id, changes);

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

// Cada asignado marca SU propio estado sobre la tarea; tasks.status se recalcula
// como agregado (completed solo si todos completaron).
const updateMyAssigneeStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const current = await db.query(
      'SELECT ta.status, t.status AS task_status, t.title FROM task_assignees ta JOIN tasks t ON t.id = ta.task_id WHERE ta.task_id = $1 AND ta.user_id = $2',
      [id, req.user.userId]
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'No estás asignado a esta tarea' });
    const { status: oldStatus, task_status: oldTaskStatus, title: taskTitle } = current.rows[0];

    await db.query(
      `UPDATE task_assignees
       SET status = $3::varchar, completed_at = CASE WHEN $3::varchar = 'completed' THEN NOW() ELSE NULL END
       WHERE task_id = $1 AND user_id = $2`,
      [id, req.user.userId, status]
    );

    const newTaskStatus = await recalculateTaskStatus(id);

    await auditLog(req.user.userId, 'UPDATE', 'tasks', id, {
      assigneeStatus: { userId: req.user.userId, from: oldStatus, to: status },
    });

    if (newTaskStatus === 'completed' && oldTaskStatus !== 'completed') {
      await notifyTaskCompleted(req, id, taskTitle);
    }

    const full = await fetchFullTask(id);
    if (!full) return res.status(404).json({ error: 'Tarea no encontrada' });
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = result.rows[0];

    if (req.user.role !== 'admin') {
      if (!task.group_id) {
        return res.status(403).json({ error: 'Solo un administrador puede eliminar tareas sin grupo' });
      }
      const leaderCheck = await db.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_leader = true',
        [task.group_id, req.user.userId]
      );
      if (leaderCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Solo el líder de este grupo puede eliminar esta tarea' });
      }
    }

    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'tasks', id, {});

    req.io?.emit('task:deleted', { id });
    logger.info({ taskId: id, userId: req.user.userId }, 'Task deleted');
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
};

// ── Solicitudes de eliminación (task_delete_requests) ──────────────────────
// Quien no tiene permiso de borrado directo (member) pide eliminar una tarea
// con un motivo; el pedido notifica a todos los admins + líder(es) del grupo
// de la tarea (o solo admins si no tiene grupo), que la aprueban o rechazan.

const createDeleteRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Debes indicar un motivo' });

    const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = taskResult.rows[0];

    const existing = await db.query(
      `SELECT id FROM task_delete_requests WHERE task_id = $1 AND status = 'pending'`,
      [id]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'Ya hay una solicitud de eliminación pendiente para esta tarea' });
    }

    const requestId = uuidv4();
    const trimmedReason = reason.trim();
    await db.query(
      `INSERT INTO task_delete_requests (id, task_id, requested_by, reason) VALUES ($1, $2, $3, $4)`,
      [requestId, id, req.user.userId, trimmedReason]
    );

    // Destinatarios: todos los admins + líder(es) del grupo de la tarea (si tiene grupo)
    const targetsResult = await db.query(
      `SELECT id FROM users WHERE role = 'admin'
       UNION
       SELECT gm.user_id FROM group_members gm WHERE gm.group_id = $1 AND gm.is_leader = true`,
      [task.group_id]
    );
    const targets = targetsResult.rows.map(r => r.id).filter(uid => uid !== req.user.userId);

    const requester = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
    const requesterName = requester.rows[0]?.name ?? 'Alguien';
    const message = `${requesterName} solicitó eliminar la tarea "${task.title}"`;
    const extra = { requestId, reason: trimmedReason, requesterName, status: 'pending' };
    const extraData = JSON.stringify(extra);

    await Promise.all(targets.map(uid => {
      const notifId = uuidv4();
      return db.query(
        `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, 'delete_request', $3, $4, $5)`,
        [notifId, uid, message, id, extraData]
      ).then(() => {
        req.io?.to(`user:${uid}`).emit('notification:received', {
          id: notifId, type: 'delete_request', taskId: id, message, extra,
          read: false, createdAt: new Date().toISOString(),
        });
        sendPushToUser(uid, { title: 'Solicitud de eliminación', body: message, url: '/notifications', tag: notifId });
      });
    }));

    logger.info({ taskId: id, requestId, userId: req.user.userId }, 'Delete request created');
    res.status(201).json({ id: requestId, taskId: id, status: 'pending', reason: trimmedReason });
  } catch (err) {
    next(err);
  }
};

const respondDeleteRequest = async (req, res, next) => {
  try {
    const { id, requestId } = req.params;
    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Acción inválida' });
    }

    const taskResult = await db.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!taskResult.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    const task = taskResult.rows[0];

    // Mismo criterio de autorización que deleteTask: admin siempre, si no, líder del grupo
    if (req.user.role !== 'admin') {
      if (!task.group_id) {
        return res.status(403).json({ error: 'Solo un administrador puede resolver esta solicitud' });
      }
      const leaderCheck = await db.query(
        'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2 AND is_leader = true',
        [task.group_id, req.user.userId]
      );
      if (leaderCheck.rows.length === 0) {
        return res.status(403).json({ error: 'Solo el líder de este grupo puede resolver esta solicitud' });
      }
    }

    const reqResult = await db.query(
      `SELECT * FROM task_delete_requests WHERE id = $1 AND task_id = $2 AND status = 'pending'`,
      [requestId, id]
    );
    if (!reqResult.rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada o ya resuelta' });
    const deleteRequest = reqResult.rows[0];

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await db.query(
      `UPDATE task_delete_requests SET status = $1, resolved_by = $2, resolved_at = NOW() WHERE id = $3`,
      [newStatus, req.user.userId, requestId]
    );

    if (action === 'approve') {
      await db.query('DELETE FROM tasks WHERE id = $1', [id]);
      await auditLog(req.user.userId, 'DELETE', 'tasks', id, { viaDeleteRequest: requestId });
      req.io?.emit('task:deleted', { id });
    }

    const resolver = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
    const resolverName = resolver.rows[0]?.name ?? 'Alguien';
    const message = action === 'approve'
      ? `${resolverName} aprobó tu solicitud para eliminar "${task.title}"`
      : `${resolverName} rechazó tu solicitud para eliminar "${task.title}"`;
    const notifType = action === 'approve' ? 'delete_request_approved' : 'delete_request_rejected';
    const notifTaskId = action === 'approve' ? null : id;
    const extra = { resolverName };
    const notifId = uuidv4();

    await db.query(
      `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, $3, $4, $5, $6)`,
      [notifId, deleteRequest.requested_by, notifType, message, notifTaskId, JSON.stringify(extra)]
    );
    req.io?.to(`user:${deleteRequest.requested_by}`).emit('notification:received', {
      id: notifId, type: notifType, taskId: notifTaskId, message, extra,
      read: false, createdAt: new Date().toISOString(),
    });
    sendPushToUser(deleteRequest.requested_by, { title: 'Solicitud de eliminación', body: message, url: '/notifications', tag: notifId });

    logger.info({ taskId: id, requestId, action, userId: req.user.userId }, 'Delete request resolved');
    res.json({ success: true, action, taskId: id });
  } catch (err) {
    next(err);
  }
};

const getTaskHistory = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT al.*, u.name AS user_name
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.table_name = 'tasks' AND al.record_id = $1
       ORDER BY al.created_at DESC`,
      [req.params.id]
    );
    res.json({ history: result.rows });
  } catch (err) {
    next(err);
  }
};

const searchTasks = async (req, res, next) => {
  try {
    const { q, limit = 20 } = req.query;
    if (!q) return res.status(400).json({ error: 'Parámetro q requerido' });

    const start = Date.now();
    const result = await db.query(
      `SELECT t.id, t.title, t.status, t.priority, t.due_date,
        ts_rank(to_tsvector('spanish', t.title || ' ' || COALESCE(t.description, '')), plainto_tsquery('spanish', $1)) AS rank
       FROM tasks t
       WHERE to_tsvector('spanish', t.title || ' ' || COALESCE(t.description, '')) @@ plainto_tsquery('spanish', $1)
       ORDER BY rank DESC
       LIMIT $2`,
      [q, limit]
    );
    res.json({ tasks: result.rows, total: result.rows.length, elapsed_ms: Date.now() - start });
  } catch (err) {
    next(err);
  }
};

function normalizeTask(t) {
  return {
    id: t.id,
    title: t.title,
    description: t.description || '',
    status: t.status,
    priority: t.priority,
    assignedTo: t.assigned_to || null,
    assignedToName: t.assigned_to_name || null,
    assignees: t.assignees || [],
    pendingDeleteRequest: t.pending_delete_request
      ? {
          id: t.pending_delete_request.id,
          reason: t.pending_delete_request.reason,
          requestedBy: t.pending_delete_request.requestedBy,
          requestedByName: t.pending_delete_request.requestedByName,
          createdAt: t.pending_delete_request.createdAt,
        }
      : null,
    dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
    dueTime: t.due_time || null,
    groupId: t.group_id || null,
    groupName: t.group_name || null,
    subtasks: (t.subtasks || []).map(s => ({
      id: s.id,
      title: s.title,
      completed: s.completed,
      completedBy: s.completed_by || null,
      completedByName: s.completed_by_name || null,
      completedAt: s.completed_at || null,
      createdAt: s.created_at,
    })),
    comments: (t.comments || []).map(c => ({
      id: c.id,
      authorId: c.user_id,
      text: c.text,
      mentions: [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    })),
    tagIds: t.tag_ids || [],
    hasFondoLink: t.has_fondo_link ?? false,
    isRecurring: t.is_recurring ?? false,
    recurrence: t.recurrence ?? null,
    templateId: t.template_id ?? null,
    createdBy: t.user_id || null,
    createdByName: t.created_by_name || null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

// ── Subtareas ────────────────────────────────────────────────────────────────

const addSubtask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

    const subtaskId = uuidv4();
    await db.query(
      'INSERT INTO task_subtasks (id, task_id, title) VALUES ($1, $2, $3)',
      [subtaskId, id, title.trim()]
    );

    const full = await fetchFullTask(id);
    if (!full) return res.status(404).json({ error: 'Tarea no encontrada' });
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

const updateSubtask = async (req, res, next) => {
  try {
    const { id, subtaskId } = req.params;
    const { title, completed } = req.body;

    const fields = [];
    const params = [];
    let i = 1;
    if (title !== undefined) { fields.push(`title = $${i++}`); params.push(title.trim()); }
    if (completed !== undefined) {
      fields.push(`completed = $${i++}`); params.push(completed);
      fields.push(`completed_by = $${i++}`); params.push(completed ? req.user.userId : null);
      fields.push(`completed_at = ${completed ? 'NOW()' : 'NULL'}`);
    }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    fields.push(`updated_at = NOW()`);
    params.push(subtaskId, id);
    const result = await db.query(
      `UPDATE task_subtasks SET ${fields.join(', ')} WHERE id = $${i++} AND task_id = $${i++}`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Subtarea no encontrada' });

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

const deleteSubtask = async (req, res, next) => {
  try {
    const { id, subtaskId } = req.params;
    const result = await db.query(
      'DELETE FROM task_subtasks WHERE id = $1 AND task_id = $2',
      [subtaskId, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Subtarea no encontrada' });

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

// ── Comentarios ──────────────────────────────────────────────────────────────

const addComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El texto es obligatorio' });

    const taskRow = await db.query('SELECT title, assigned_to FROM tasks WHERE id = $1', [id]);
    if (!taskRow.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    const { title: taskTitle, assigned_to: assignedTo } = taskRow.rows[0];

    const commentId = uuidv4();
    await db.query(
      'INSERT INTO task_comments (id, task_id, user_id, text) VALUES ($1, $2, $3, $4)',
      [commentId, id, req.user.userId, text.trim()]
    );

    // Notificaciones con el texto del comentario (P4)
    const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
    const actorName = actor.rows[0]?.name ?? 'Alguien';
    const snippet = text.trim().length > 80 ? text.trim().slice(0, 77) + '…' : text.trim();
    const message = `${actorName} comentó en "${taskTitle}": "${snippet}"`;

    const leaders = await db.query(
      `SELECT id FROM users WHERE role IN ('admin','leader') AND id != $1`,
      [req.user.userId]
    );
    const notifTargets = new Set(leaders.rows.map(l => l.id));
    if (assignedTo && assignedTo !== req.user.userId) notifTargets.add(assignedTo);

    const extraData = JSON.stringify({ commentId });
    await Promise.all([...notifTargets].map(userId =>
      db.query(
        `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data) VALUES ($1, $2, 'comment_added', $3, $4, $5)`,
        [uuidv4(), userId, message, id, extraData]
      ).then(() => {
        const notifId = uuidv4();
        req.io?.to(`user:${userId}`).emit('notification:received', {
          id: notifId, type: 'comment_added', taskId: id, message, extra: { commentId },
        });
        sendPushToUser(userId, { title: 'Nuevo comentario', body: message, url: '/tasks', tag: notifId });
      })
    ));

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.status(201).json(full);
  } catch (err) {
    next(err);
  }
};

const updateComment = async (req, res, next) => {
  try {
    const { id, commentId } = req.params;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'El texto es obligatorio' });

    const result = await db.query(
      'UPDATE task_comments SET text = $1, updated_at = NOW() WHERE id = $2 AND task_id = $3 AND user_id = $4',
      [text.trim(), commentId, id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Comentario no encontrado o sin permiso' });

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const { id, commentId } = req.params;
    const result = await db.query(
      'DELETE FROM task_comments WHERE id = $1 AND task_id = $2 AND user_id = $3',
      [commentId, id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Comentario no encontrado o sin permiso' });

    const full = await fetchFullTask(id);
    emitTaskEvent(req.io, 'task:updated', full, full.groupId);
    res.json(full);
  } catch (err) {
    next(err);
  }
};

const getTemplates = async (req, res, next) => {
  try {
    const result = await db.query(`
      SELECT t.*,
        u.name AS assigned_to_name,
        creator.name AS created_by_name,
        g.name AS group_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
      LEFT JOIN users creator ON creator.id = t.user_id
      LEFT JOIN groups g ON g.id = t.group_id
      WHERE t.is_recurring = true AND t.template_id IS NULL
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows.map(t => ({
      ...normalizeTask({ ...t, subtasks: null, comments: null, tag_ids: null, has_fondo_link: false }),
      subtasks: [],
      comments: [],
      tagIds: [],
    })));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks,
  getTemplates, updateMyAssigneeStatus,
  createDeleteRequest, respondDeleteRequest,
  addSubtask, updateSubtask, deleteSubtask,
  addComment, updateComment, deleteComment,
};
