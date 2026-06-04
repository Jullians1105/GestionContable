const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');

const auditLog = async (userId, action, tableName, recordId, changes = {}) => {
  try {
    await db.query(
      'INSERT INTO audit_log (id, user_id, action, table_name, record_id, changes) VALUES ($1, $2, $3, $4, $5, $6)',
      [uuidv4(), userId, action, tableName, recordId, JSON.stringify(changes)]
    );
  } catch (err) {
    logger.error({ err }, 'Audit log failed');
  }
};

const emitTaskEvent = (io, event, data, groupId) => {
  if (!io) return;
  io.emit(event, data);
  if (groupId) io.to(`group:${groupId}`).emit(event, data);
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

    const tasksQuery = `
      SELECT t.*,
        u.name AS assigned_to_name,
        g.name AS group_name,
        (SELECT json_agg(s ORDER BY s.created_at) FROM task_subtasks s WHERE s.task_id = t.id) AS subtasks,
        (SELECT json_agg(c ORDER BY c.created_at) FROM task_comments c WHERE c.task_id = t.id) AS comments,
        (SELECT json_agg(tg.id) FROM task_tag_assignment ta JOIN task_tags tg ON tg.id = ta.tag_id WHERE ta.task_id = t.id) AS tag_ids
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assigned_to
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

const getTask = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT t.*,
        u.name AS assigned_to_name,
        g.name AS group_name,
        (SELECT json_agg(s ORDER BY s.created_at) FROM task_subtasks s WHERE s.task_id = t.id) AS subtasks,
        (SELECT json_agg(c ORDER BY c.created_at) FROM task_comments c WHERE c.task_id = t.id) AS comments,
        (SELECT json_agg(tg.id) FROM task_tag_assignment ta JOIN task_tags tg ON tg.id = ta.tag_id WHERE ta.task_id = t.id) AS tag_ids
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assigned_to
       LEFT JOIN groups g ON g.id = t.group_id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(normalizeTask(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, priority = 'medium', assignedTo, dueDate, groupId, tagIds = [] } = req.body;
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO tasks (id, user_id, group_id, title, description, status, priority, assigned_to, due_date)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)
       RETURNING *`,
      [id, req.user.userId, groupId || null, title, description || null, priority, assignedTo || null, dueDate || null]
    );
    const task = result.rows[0];

    if (tagIds.length > 0) {
      await Promise.all(tagIds.map(tagId =>
        db.query('INSERT INTO task_tag_assignment (task_id, tag_id) VALUES ($1, $2)', [id, tagId])
      ));
    }

    await auditLog(req.user.userId, 'CREATE', 'tasks', id, { title, priority, assignedTo });

    if (assignedTo && assignedTo !== req.user.userId) {
      const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
      await db.query(
        `INSERT INTO notifications (id, user_id, type, message, task_id) VALUES ($1, $2, 'task_assigned', $3, $4)`,
        [uuidv4(), assignedTo, `${actor.rows[0]?.name ?? 'Alguien'} te asignó la tarea "${title}"`, id]
      );
      req.io?.to(`user:${assignedTo}`).emit('notification:received', { type: 'task_assigned', taskId: id });
    }

    const full = { ...normalizeTask(task), subtasks: [], comments: [], tagIds };
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
    const { title, description, status, priority, assignedTo, dueDate, groupId, tagIds } = req.body;

    const result = await db.query(
      `UPDATE tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status),
        priority = COALESCE($4, priority),
        assigned_to = $5,
        due_date = $6,
        group_id = $7,
        updated_at = NOW()
       WHERE id = $8 RETURNING *`,
      [title, description, status, priority, assignedTo ?? old.assigned_to, dueDate ?? old.due_date, groupId ?? old.group_id, id]
    );
    const task = result.rows[0];

    if (tagIds !== undefined) {
      await db.query('DELETE FROM task_tag_assignment WHERE task_id = $1', [id]);
      await Promise.all(tagIds.map(tagId =>
        db.query('INSERT INTO task_tag_assignment (task_id, tag_id) VALUES ($1, $2)', [id, tagId])
      ));
    }

    const changes = {};
    if (title && title !== old.title) changes.title = { from: old.title, to: title };
    if (status && status !== old.status) changes.status = { from: old.status, to: status };
    if (priority && priority !== old.priority) changes.priority = { from: old.priority, to: priority };
    if (assignedTo !== undefined && assignedTo !== old.assigned_to) {
      changes.assignedTo = { from: old.assigned_to, to: assignedTo };
      if (assignedTo && assignedTo !== req.user.userId) {
        const actor = await db.query('SELECT name FROM users WHERE id = $1', [req.user.userId]);
        await db.query(
          `INSERT INTO notifications (id, user_id, type, message, task_id) VALUES ($1, $2, 'task_assigned', $3, $4)`,
          [uuidv4(), assignedTo, `${actor.rows[0]?.name ?? 'Alguien'} te asignó la tarea "${task.title}"`, id]
        );
        req.io?.to(`user:${assignedTo}`).emit('notification:received', { type: 'task_assigned', taskId: id });
      }
    }

    if (status === 'completed' && old.status !== 'completed') {
      const leaders = await db.query(`SELECT id FROM users WHERE role IN ('admin','leader') AND id != $1`, [req.user.userId]);
      await Promise.all(leaders.rows.map(l =>
        db.query(`INSERT INTO notifications (id, user_id, type, message, task_id) VALUES ($1, $2, 'task_completed', $3, $4)`,
          [uuidv4(), l.id, `"${task.title}" fue completada`, id])
      ));
    }

    await auditLog(req.user.userId, 'UPDATE', 'tasks', id, changes);

    const full = normalizeTask(task);
    emitTaskEvent(req.io, 'task:updated', full, task.group_id);
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

    await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'tasks', id, {});

    req.io?.emit('task:deleted', { id });
    logger.info({ taskId: id, userId: req.user.userId }, 'Task deleted');
    res.json({ success: true, id });
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
    dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
    groupId: t.group_id || null,
    groupName: t.group_name || null,
    subtasks: t.subtasks || [],
    comments: t.comments || [],
    tagIds: t.tag_ids || [],
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

module.exports = { getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks };
