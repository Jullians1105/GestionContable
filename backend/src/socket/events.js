const { verify } = require('../utils/jwt');
const logger = require('../utils/logger');
const db = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v) => typeof v === 'string' && UUID_REGEX.test(v);

const setupSocket = (io) => {
  // Autenticación de socket
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token requerido'));
    try {
      const decoded = verify(token);
      // Un usuario desactivado no debe poder abrir (ni mantener) un socket
      const { rows } = await db.query('SELECT is_active FROM users WHERE id = $1', [decoded.userId]);
      if (!rows[0] || rows[0].is_active === false) return next(new Error('Cuenta desactivada'));
      socket.user = decoded;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  const onlineUsers = new Map();

  io.on('connection', (socket) => {
    const { userId, email } = socket.user;
    logger.info({ userId }, 'Socket connected');

    socket.join(`user:${userId}`);
    onlineUsers.set(userId, { email, socketId: socket.id });
    io.emit('user:online', { userId, email });
    // Enviar al cliente recién conectado la lista de quién ya está en línea
    socket.emit('users:online:list', Array.from(onlineUsers.keys()));

    // Solo ids con forma de UUID: evita que el cliente invente nombres de sala arbitrarios
    socket.on('join:task', (taskId) => { if (esUuid(taskId)) socket.join(`task:${taskId}`); });
    socket.on('leave:task', (taskId) => { if (esUuid(taskId)) socket.leave(`task:${taskId}`); });
    socket.on('join:group', (groupId) => { if (esUuid(groupId)) socket.join(`group:${groupId}`); });
    socket.on('leave:group', (groupId) => { if (esUuid(groupId)) socket.leave(`group:${groupId}`); });

    socket.on('mark:read', async (notifId) => {
      try {
        await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [notifId, userId]);
      } catch (err) {
        logger.error({ err }, 'mark:read failed');
      }
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(userId);
      io.emit('user:offline', { userId });
      logger.info({ userId }, 'Socket disconnected');
    });
  });

  return io;
};

module.exports = { setupSocket };
