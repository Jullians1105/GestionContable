const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getGrupos, createGrupo, updateGrupo, deleteGrupo } = require('../controllers/fondoProcesoGruposController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/fondo/proceso-grupos:
 *   get:
 *     tags: [FondoProcesoGrupos]
 *     summary: Listar grupos de procesos del Seguimiento Mensual
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de grupos ordenada por `orden`
 */
router.get('/', getGrupos);

/**
 * @openapi
 * /api/fondo/proceso-grupos:
 *   post:
 *     tags: [FondoProcesoGrupos]
 *     summary: Crear un grupo de procesos
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
 *         description: Grupo creado
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender
 */
router.post('/',
  requireFondoAccess,
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  validate,
  createGrupo
);

/**
 * @openapi
 * /api/fondo/proceso-grupos/{id}:
 *   put:
 *     tags: [FondoProcesoGrupos]
 *     summary: Renombrar o reordenar un grupo
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
 *               name:  { type: string, maxLength: 255 }
 *               orden: { type: integer, minimum: 0 }
 *     responses:
 *       200:
 *         description: Grupo actualizado
 *       404:
 *         description: Grupo no encontrado
 */
router.put('/:id',
  ...validateUUIDParam('id'),
  requireFondoAccess,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  validate,
  updateGrupo
);

/**
 * @openapi
 * /api/fondo/proceso-grupos/{id}:
 *   delete:
 *     tags: [FondoProcesoGrupos]
 *     summary: Eliminar un grupo (sus procesos quedan sin grupo, no se borran)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204:
 *         description: Grupo eliminado
 *       404:
 *         description: Grupo no encontrado
 */
router.delete('/:id',
  ...validateUUIDParam('id'),
  requireFondoAccess,
  deleteGrupo
);

module.exports = router;
