const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireExternasAdmin } = require('../middleware/externasAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getGrupos, createGrupo, updateGrupo, deleteGrupo } = require('../controllers/extProcesoGruposController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/externas/proceso-grupos:
 *   get:
 *     tags: [ExternasProcesoGrupos]
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
 * /api/externas/proceso-grupos:
 *   post:
 *     tags: [ExternasProcesoGrupos]
 *     summary: Crear un grupo de procesos (solo admin)
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
 *         description: Solo un administrador puede modificar la estructura de columnas
 */
router.post('/',
  requireExternasAdmin,
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  validate,
  createGrupo
);

/**
 * @openapi
 * /api/externas/proceso-grupos/{id}:
 *   put:
 *     tags: [ExternasProcesoGrupos]
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
  requireExternasAdmin,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('orden').optional({ nullable: true }).isInt({ min: 0 }).withMessage('orden debe ser un entero >= 0'),
  validate,
  updateGrupo
);

/**
 * @openapi
 * /api/externas/proceso-grupos/{id}:
 *   delete:
 *     tags: [ExternasProcesoGrupos]
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
  requireExternasAdmin,
  deleteGrupo
);

module.exports = router;
