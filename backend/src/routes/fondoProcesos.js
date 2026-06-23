const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getProcesos, createProceso, updateProceso } = require('../controllers/fondoProcesosController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/fondo/procesos:
 *   get:
 *     tags: [FondoProcesos]
 *     summary: Listar procesos del catálogo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: incluirInactivos, in: query, schema: { type: boolean } }
 *     responses:
 *       200:
 *         description: Lista de procesos ordenada por `orden`
 */
router.get('/',
  query('incluirInactivos').optional().isBoolean(),
  validate,
  getProcesos
);

/**
 * @openapi
 * /api/fondo/procesos:
 *   post:
 *     tags: [FondoProcesos]
 *     summary: Crear proceso en el catálogo
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:  { type: string, maxLength: 255 }
 *               orden: { type: integer, minimum: 0 }
 *     responses:
 *       201:
 *         description: Proceso creado
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender
 */
router.post('/',
  requireFondoAccess,
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  validate,
  createProceso
);

/**
 * @openapi
 * /api/fondo/procesos/{id}:
 *   put:
 *     tags: [FondoProcesos]
 *     summary: Actualizar proceso (nombre, orden o activar/desactivar)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:   { type: string, maxLength: 255 }
 *               orden:  { type: integer, minimum: 0 }
 *               activo: { type: boolean }
 *     responses:
 *       200:
 *         description: Proceso actualizado
 *       404:
 *         description: Proceso no encontrado
 */
router.put('/:id',
  ...validateUUIDParam('id'),
  requireFondoAccess,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  body('activo').optional().isBoolean().withMessage('activo debe ser boolean'),
  validate,
  updateProceso
);

module.exports = router;
