const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('./logger');

let transporter = null;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${env.CLIENT_URL}/reset-password?token=${token}`;
  const tx = getTransporter();
  if (!tx) {
    logger.warn({ to, resetUrl }, 'SMTP no configurado: no se envió el email de recuperación');
    return;
  }
  await tx.sendMail({
    from: env.FROM_EMAIL,
    to,
    subject: 'Recuperar contraseña - Gestor de Tareas',
    html: `
      <p>Recibimos una solicitud para restablecer tu contraseña.</p>
      <p><a href="${resetUrl}">Haz clic aquí para crear una nueva contraseña</a></p>
      <p>Este enlace expira en 30 minutos. Si no solicitaste esto, ignora este correo.</p>
    `,
  });
  logger.info({ to }, 'Email de recuperación enviado');
};

module.exports = { sendPasswordResetEmail };
