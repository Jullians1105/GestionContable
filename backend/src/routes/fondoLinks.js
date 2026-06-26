const { Router } = require('express');
const { body, param } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getLink, upsertLink, deleteLink } = require('../controllers/fondoLinksController');

const router = Router();
router.use(authMiddleware);

const validateTaskId = [
  param('id').isUUID().withMessage('id debe ser UUID'),
  validate,
];

/**
 * @openapi
 * /api/tasks/{id}/fondo-link:
 *   get:
 *     tags: [Tasks]
 *     summary: Obtener el vínculo de una tarea con Fondo Emprender
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Vínculo encontrado }
 *       404: { description: Sin vínculo }
 */
router.get('/:id/fondo-link', ...validateTaskId, getLink);

/**
 * @openapi
 * /api/tasks/{id}/fondo-link:
 *   post:
 *     tags: [Tasks]
 *     summary: Crear o actualizar el vínculo de una tarea con Fondo Emprender
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/fondo-link',
  ...validateTaskId,
  body('empresaId').isUUID().withMessage('empresaId debe ser UUID'),
  body('linkType').isIn(['macroproceso', 'checklist']).withMessage('linkType debe ser macroproceso o checklist'),
  body('macroId').optional({ nullable: true })
    .isIn(['mp1','mp2','mp3','mp4','mp6','mp7']).withMessage('macroId inválido'),
  body('procesoId').optional({ nullable: true }).isUUID().withMessage('procesoId debe ser UUID'),
  body('anio').optional({ nullable: true }).isInt({ min: 2000, max: 2100 }).toInt(),
  body('mes').optional({ nullable: true }).isInt({ min: 1, max: 12 }).toInt(),
  validate,
  upsertLink
);

/**
 * @openapi
 * /api/tasks/{id}/fondo-link:
 *   delete:
 *     tags: [Tasks]
 *     summary: Eliminar el vínculo de una tarea con Fondo Emprender
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id/fondo-link', ...validateTaskId, deleteLink);

module.exports = router;
