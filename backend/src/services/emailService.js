const logger = require('../utils/logger');
const env = require('../config/env');

// Envío de emails vía SendGrid. Requiere SENDGRID_API_KEY en .env
async function sendEmail({ to, subject, text, html }) {
  if (!env.SENDGRID_API_KEY) {
    logger.debug({ to, subject }, 'Email skipped (SENDGRID_API_KEY not set)');
    return;
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: env.FROM_EMAIL },
        subject,
        content: [
          { type: 'text/plain', value: text || subject },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
    });
    if (!res.ok) throw new Error(`SendGrid error: ${res.status}`);
    logger.info({ to, subject }, 'Email sent');
  } catch (err) {
    logger.error({ err, to, subject }, 'Email failed');
  }
}

const emailService = {
  taskAssigned: (to, assignerName, taskTitle, taskId) =>
    sendEmail({
      to,
      subject: `Nueva tarea asignada: ${taskTitle}`,
      text: `${assignerName} te asignó la tarea "${taskTitle}". Revísala en Gestor de Tareas.`,
      html: `<p>${assignerName} te asignó la tarea <strong>"${taskTitle}"</strong>.</p><p>Revísala en Gestor de Tareas.</p>`,
    }),

  taskCompleted: (to, completedBy, taskTitle) =>
    sendEmail({
      to,
      subject: `Tarea completada: ${taskTitle}`,
      text: `${completedBy} completó la tarea "${taskTitle}".`,
    }),

  commentAdded: (to, commenterName, taskTitle) =>
    sendEmail({
      to,
      subject: `Nuevo comentario en: ${taskTitle}`,
      text: `${commenterName} comentó en la tarea "${taskTitle}".`,
    }),

  taskOverdue: (to, taskTitle) =>
    sendEmail({
      to,
      subject: `Tarea vencida: ${taskTitle}`,
      text: `La tarea "${taskTitle}" está vencida. Por favor actualiza su estado.`,
    }),
};

module.exports = emailService;
