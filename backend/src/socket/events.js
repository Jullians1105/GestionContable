const { verify } = require('../utils/jwt');
const logger = require('../utils/logger');

const setupSocket = (io) => {
  // Autenticación de socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Token requerido'));
    try {
      const decoded = verify(token);
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

    socket.on('join:task', (taskId) => socket.join(`task:${taskId}`));
    socket.on('leave:task', (taskId) => socket.leave(`task:${taskId}`));
    socket.on('join:group', (groupId) => socket.join(`group:${groupId}`));
    socket.on('leave:group', (groupId) => socket.leave(`group:${groupId}`));

    socket.on('mark:read', async (notifId) => {
      try {
        const db = require('../config/database');
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
