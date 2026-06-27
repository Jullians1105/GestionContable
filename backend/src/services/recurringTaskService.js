const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const { sendPushToUser } = require('./pushService');

function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function generateMonthlyInstances(io) {
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth() + 1;

  try {
    const templatesResult = await db.query(
      `SELECT * FROM tasks WHERE is_recurring = true AND template_id IS NULL AND status != 'completed'`
    );
    const templates = templatesResult.rows;

    if (templates.length === 0) {
      logger.info('Recurrentes: no hay templates activos');
      return;
    }

    const leadersResult = await db.query(
      `SELECT id FROM users WHERE role IN ('admin', 'leader')`
    );
    const leaders = leadersResult.rows.map(r => r.id);

    let created = 0;
    for (const template of templates) {
      const recurrence = template.recurrence || {};
      const approxDay = recurrence.approx_day ?? 1;

      // Verificar rango de vigencia si está definido (fechas YYYY-MM-DD)
      const maxDay = lastDayOfMonth(anio, mes);
      const instanceDate = `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(recurrence.approx_day ?? 1, maxDay)).padStart(2, '0')}`;
      if (recurrence.start_date && instanceDate < recurrence.start_date) {
        logger.info({ templateId: template.id, instanceDate, start_date: recurrence.start_date }, 'Template aún no activo');
        continue;
      }
      if (recurrence.end_date && instanceDate > recurrence.end_date) {
        logger.info({ templateId: template.id, instanceDate, end_date: recurrence.end_date }, 'Template vencido, saltando');
        continue;
      }

      // Deduplicación: no generar si ya existe instancia del mismo template este mes
      const exists = await db.query(
        `SELECT 1 FROM tasks
         WHERE template_id = $1
           AND EXTRACT(YEAR FROM created_at)  = $2
           AND EXTRACT(MONTH FROM created_at) = $3
         LIMIT 1`,
        [template.id, anio, mes]
      );
      if (exists.rows.length > 0) continue;

      const dueDay = Math.min(approxDay, maxDay);
      const dueDate = `${anio}-${String(mes).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

      const instanceId = uuidv4();
      const instanceResult = await db.query(
        `INSERT INTO tasks (id, user_id, group_id, title, description, status, priority, assigned_to, due_date, is_recurring, template_id)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, false, $9)
         RETURNING *`,
        [
          instanceId,
          template.user_id,
          template.group_id,
          template.title,
          template.description,
          template.priority,
          template.assigned_to,
          dueDate,
          template.id,
        ]
      );

      const instance = instanceResult.rows[0];

      // Emitir tarea creada por socket
      if (io) {
        io.emit('task:created', {
          id: instance.id,
          title: instance.title,
          description: instance.description || '',
          status: instance.status,
          priority: instance.priority,
          assignedTo: instance.assigned_to || null,
          dueDate: instance.due_date ? instance.due_date.toISOString().slice(0, 10) : null,
          groupId: instance.group_id || null,
          isRecurring: false,
          templateId: instance.template_id,
          recurrence: null,
          subtasks: [],
          comments: [],
          tagIds: [],
          hasFondoLink: false,
        });
      }

      // Notificación a líderes
      const msg = `Tarea recurrente "${template.title}" generada para ${String(mes).padStart(2, '0')}/${anio} (~día ${approxDay}). Confirma la fecha exacta.`;
      for (const leaderId of leaders) {
        const notifId = uuidv4();
        await db.query(
          `INSERT INTO notifications (id, user_id, type, message, task_id, extra_data)
           VALUES ($1, $2, 'task_reminder_pending', $3, $4, $5)`,
          [notifId, leaderId, msg, instanceId, JSON.stringify({ templateId: template.id, approxDay })]
        );
        if (io) {
          io.to(`user:${leaderId}`).emit('notification:received', {
            id: notifId,
            type: 'task_reminder_pending',
            message: msg,
            taskId: instanceId,
            read: false,
            createdAt: new Date().toISOString(),
          });
        }
        sendPushToUser(leaderId, { title: 'Tarea recurrente pendiente', body: msg, url: '/tasks/recurrentes', tag: notifId });
      }

      created++;
      logger.info({ templateId: template.id, instanceId, dueDate }, 'Instancia recurrente generada');
    }

    logger.info({ created, anio, mes }, 'Generación de tareas recurrentes completada');
  } catch (err) {
    logger.error({ err }, 'Error generando instancias recurrentes');
  }
}

function initRecurringCron(io) {
  // Días 1, 2 y 3 del mes a las 7 AM — resistencia a servidor caído
  cron.schedule('0 7 1-3 * *', () => {
    logger.info('Cron recurrentes: iniciando generación mensual');
    generateMonthlyInstances(io);
  });
  logger.info('Cron de tareas recurrentes inicializado (días 1-3 del mes, 7:00 AM)');
}

module.exports = { initRecurringCron, generateMonthlyInstances };
