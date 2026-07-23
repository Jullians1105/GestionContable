const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const { sendPushToUser } = require('./pushService');

async function sendDueReminders(io) {
  try {
    // Tareas que vencen pronto y aún no han recibido recordatorio:
    // - Sin due_time: vencen hoy o mañana
    // - Con due_time: vencen en las próximas 2 horas
    const result = await db.query(`
      SELECT t.id, t.title, t.assigned_to, t.due_date, t.due_time,
             u.name AS assigned_name
      FROM tasks t
      JOIN users u ON u.id = t.assigned_to
      WHERE t.status NOT IN ('completed')
        AND t.assigned_to IS NOT NULL
        AND t.reminder_sent_at IS NULL
        AND t.is_recurring = false
        AND t.template_id IS NULL
        AND t.due_date IS NOT NULL
        AND (
          (t.due_time IS NULL     AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '1 day')
          OR
          (t.due_time IS NOT NULL AND (t.due_date::timestamp + t.due_time::interval) BETWEEN NOW() AND NOW() + INTERVAL '2 hours')
        )
    `);

    if (result.rows.length === 0) return;

    for (const task of result.rows) {
      const dueStr = task.due_time
        ? `${task.due_date.toISOString().slice(0, 10)} a las ${String(task.due_time).slice(0, 5)}`
        : task.due_date.toISOString().slice(0, 10);

      const msg = `Tu tarea "${task.title}" vence el ${dueStr}`;
      const notifId = uuidv4();

      await db.query(
        `INSERT INTO notifications (id, user_id, type, message, task_id)
         VALUES ($1, $2, 'task_overdue', $3, $4)`,
        [notifId, task.assigned_to, msg, task.id]
      );

      io?.to(`user:${task.assigned_to}`).emit('notification:received', {
        id: notifId,
        type: 'task_overdue',
        message: msg,
        taskId: task.id,
        read: false,
        createdAt: new Date().toISOString(),
      });

      sendPushToUser(task.assigned_to, {
        title: 'Recordatorio de tarea',
        body: msg,
        url: '/tasks',
        tag: notifId,
      });

      // Marcar como enviado para no repetir
      await db.query(
        'UPDATE tasks SET reminder_sent_at = NOW() WHERE id = $1',
        [task.id]
      );

      logger.info({ taskId: task.id, assignedTo: task.assigned_to }, 'Recordatorio de vencimiento enviado');
    }
  } catch (err) {
    logger.error({ err }, 'Error enviando recordatorios de vencimiento');
  }
}

// Recordatorio personalizado (fecha/hora elegida al crear/editar un pendiente personal,
// espacio 100% privado — ver personal_tasks). Notificación individual al dueño del pendiente.
async function sendPersonalTaskReminders(io) {
  try {
    const result = await db.query(`
      SELECT pt.id, pt.title, pt.user_id
      FROM personal_tasks pt
      WHERE pt.reminder_at IS NOT NULL
        AND pt.reminder_sent_at IS NULL
        AND pt.reminder_at <= NOW()
        AND pt.completed = false
    `);

    if (result.rows.length === 0) return;

    for (const task of result.rows) {
      const notifId = uuidv4();
      const msg = `Recordatorio: "${task.title}"`;
      const extraData = JSON.stringify({ personalTaskId: task.id });

      await db.query(
        `INSERT INTO notifications (id, user_id, type, message, extra_data) VALUES ($1, $2, 'personal_task_reminder', $3, $4)`,
        [notifId, task.user_id, msg, extraData]
      );
      io?.to(`user:${task.user_id}`).emit('notification:received', {
        id: notifId,
        type: 'personal_task_reminder',
        message: msg,
        extra: { personalTaskId: task.id },
        read: false,
        createdAt: new Date().toISOString(),
      });
      sendPushToUser(task.user_id, {
        title: 'Recordatorio personal',
        body: msg,
        url: '/pendientes',
        tag: notifId,
      });

      await db.query('UPDATE personal_tasks SET reminder_sent_at = NOW() WHERE id = $1', [task.id]);

      logger.info({ personalTaskId: task.id, userId: task.user_id }, 'Recordatorio personal enviado');
    }
  } catch (err) {
    logger.error({ err }, 'Error enviando recordatorios personales');
  }
}

function initReminderCron(io) {
  // Cada 30 minutos
  cron.schedule('*/30 * * * *', () => {
    sendDueReminders(io);
  });
  logger.info('Cron de recordatorios de vencimiento inicializado (cada 30 min)');

  // Cada 5 minutos — el recordatorio personal es a una hora puntual elegida por el
  // usuario, así que necesita más precisión que el de vencimiento.
  cron.schedule('*/5 * * * *', () => {
    sendPersonalTaskReminders(io);
  });
  logger.info('Cron de recordatorios personales inicializado (cada 5 min)');
}

module.exports = { initReminderCron, sendDueReminders, sendPersonalTaskReminders };
