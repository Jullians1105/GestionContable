const { param, query } = require('express-validator');
const { validate } = require('./validation');
const logger = require('../utils/logger');
const env = require('../config/env');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateUUIDParam = (paramName = 'id') => [
  param(paramName)
    .matches(UUID_REGEX)
    .withMessage(`${paramName} debe ser un UUID válido`),
  validate,
];

// Caps page/limit to safe integer bounds — prevents runaway queries
const sanitizePagination = [
  query('page').optional().isInt({ min: 1, max: 1000 }).withMessage('page debe ser entre 1 y 1000').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit debe ser entre 1 y 100').toInt(),
  validate,
];

// Resource ownership check — passes if user owns the resource or has an elevated role
const requireOwnerOrRole = (getOwnerId, ...roles) => async (req, res, next) => {
  try {
    const ownerId = await getOwnerId(req);
    if (ownerId === req.user.userId || roles.includes(req.user.role)) return next();
    logger.warn(
      { userId: req.user.userId, path: req.path, method: req.method },
      'Ownership check failed — access denied'
    );
    return res.status(403).json({ error: 'No tienes permiso para modificar este recurso' });
  } catch (err) {
    next(err);
  }
};

// Startup check — aborts process if insecure defaults are used in production
const validateProductionEnv = () => {
  if (env.NODE_ENV !== 'production') return;

  const insecureDefaults = [
    'dev-secret-change-in-production',
    'dev-refresh-secret-change-in-production',
    'taskflow-dev-secret-key-change-in-production-2026',
    'taskflow-refresh-secret-different-key-2026',
  ];

  if (insecureDefaults.includes(env.JWT_SECRET)) {
    logger.fatal('SECURITY ABORT: JWT_SECRET usa un valor por defecto inseguro. Configure un secreto fuerte en .env');
    process.exit(1);
  }
  if (insecureDefaults.includes(env.JWT_REFRESH_SECRET)) {
    logger.fatal('SECURITY ABORT: JWT_REFRESH_SECRET usa un valor por defecto inseguro. Configure un secreto fuerte en .env');
    process.exit(1);
  }
  if (env.SHOW_RESET_TOKEN) {
    logger.fatal('SECURITY ABORT: SHOW_RESET_TOKEN=true expone tokens de recuperación. No debe estar activo en producción.');
    process.exit(1);
  }
};

module.exports = { validateUUIDParam, sanitizePagination, requireOwnerOrRole, validateProductionEnv };
