require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./utils/logger');
const { validateProductionEnv } = require('./middleware/security');
const { setupSocket } = require('./socket/events');
const { errorHandler, notFound } = require('./middleware/errorHandler');

validateProductionEnv();

const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const employeeRoutes = require('./routes/employees');
const groupRoutes = require('./routes/groups');
const tagRoutes = require('./routes/tags');
const statsRoutes = require('./routes/stats');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);

// En desarrollo permite cualquier puerto de localhost (Vite puede usar 5173, 5174, etc.)
const corsOrigin = env.NODE_ENV === 'development'
  ? /^http:\/\/localhost(:\d+)?$/
  : env.CLIENT_URL;

// Socket.io
const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true },
});
setupSocket(io);

// Inyectar io en todas las requests
app.use((req, _res, next) => { req.io = io; next(); });

// Security middlewares
app.use(helmet({ contentSecurityPolicy: env.NODE_ENV === 'production' }));
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Demasiados intentos de login' },
});
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Swagger — solo en desarrollo (A05: no exponer docs en producción)
if (env.NODE_ENV !== 'production') {
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'Gestor de Tareas API', version: '3.0.0', description: 'API REST para gestión de tareas empresarial' },
    servers: [{ url: `http://localhost:${env.PORT}`, description: 'Desarrollo' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        TaskInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 255 },
            description: { type: 'string' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            assignedTo: { type: 'string', format: 'uuid' },
            dueDate: { type: 'string', format: 'date' },
            groupId: { type: 'string', format: 'uuid' },
            tagIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'],
});
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
} // end swagger dev-only block

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/notifications', notificationRoutes);

// Frontend is served by nginx in production — this block only runs locally
if (env.NODE_ENV === 'development') {
  const path = require('path');
  const distPath = path.join(__dirname, '../../dist');
  if (require('fs').existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
}

app.use(notFound);
app.use(errorHandler);

if (env.NODE_ENV !== 'test') {
  server.listen(env.PORT, () => {
    logger.info(`Gestor de Tareas backend v3.0 corriendo en http://localhost:${env.PORT}`);
    logger.info(`Docs: http://localhost:${env.PORT}/api/docs`);
    logger.info(`Ambiente: ${env.NODE_ENV}`);
  });
}

module.exports = { app, server, io };
