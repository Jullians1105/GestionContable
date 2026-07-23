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

// Recordatorio personalizado (fecha/hora elegida al crear/editar la tarea, independiente
// del vencimiento). Se envía UNA notificación individual a cada persona asignada — no una
// notificación grupal — así cada quien la marca leída por separado.
async function sendCustomReminders(io) {
  try {
    const result = await db.query(`
      SELECT t.id, t.title,
        (SELECT json_agg(json_build_object('userId', ta.user_id, 'name', u.name))
         FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = t.id) AS assignees
      FROM tasks t
      WHERE t.custom_reminder_at IS NOT NULL
        AND t.custom_reminder_sent_at IS NULL
        AND t.custom_reminder_at <= NOW()
        AND t.status != 'completed'
        AND (t.is_recurring = false OR t.template_id IS NOT NULL)
    `);

    if (result.rows.length === 0) return;

    for (const task of result.rows) {
      const assignees = task.assignees || [];
      const msg = `Recordatorio: "${task.title}"`;

      await Promise.all(assignees.map(async (a) => {
        const notifId = uuidv4();
        await db.query(
          `INSERT INTO notifications (id, user_id, type, message, task_id) VALUES ($1, $2, 'task_reminder', $3, $4)`,
          [notifId, a.userId, msg, task.id]
        );
        io?.to(`user:${a.userId}`).emit('notification:received', {
          id: notifId,
          type: 'task_reminder',
          message: msg,
          taskId: task.id,
          read: false,
          createdAt: new Date().toISOString(),
        });
        sendPushToUser(a.userId, {
          title: 'Recordatorio de tarea',
          body: msg,
          url: '/tasks',
          tag: notifId,
        });
      }));

      await db.query('UPDATE tasks SET custom_reminder_sent_at = NOW() WHERE id = $1', [task.id]);

      logger.info({ taskId: task.id, assignees: assignees.length }, 'Recordatorio personalizado enviado');
    }
  } catch (err) {
    logger.error({ err }, 'Error enviando recordatorios personalizados');
  }
}

function initReminderCron(io) {
  // Cada 30 minutos
  cron.schedule('*/30 * * * *', () => {
    sendDueReminders(io);
  });
  logger.info('Cron de recordatorios de vencimiento inicializado (cada 30 min)');

  // Cada 5 minutos — el recordatorio personalizado es a una hora puntual elegida por el
  // usuario, así que necesita más precisión que el de vencimiento.
  cron.schedule('*/5 * * * *', () => {
    sendCustomReminders(io);
  });
  logger.info('Cron de recordatorios personalizados inicializado (cada 5 min)');
}

module.exports = { initReminderCron, sendDueReminders, sendCustomReminders };
