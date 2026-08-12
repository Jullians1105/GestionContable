const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireExternasAccess } = require('../middleware/externasAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getChecklistMes,
  getChecklistMesTodasEmpresas,
  updateChecklistItem,
} = require('../controllers/extChecklistController');

const router = Router();
router.use(authMiddleware);

const validateAnioMes = [
  query('anio')
    .notEmpty().withMessage('anio es requerido')
    .isInt({ min: 2000, max: 2100 }).withMessage('anio debe ser un año entre 2000 y 2100')
    .toInt(),
  query('mes')
    .notEmpty().withMessage('mes es requerido')
    .isInt({ min: 1, max: 12 }).withMessage('mes debe ser entre 1 y 12')
    .toInt(),
  validate,
];

/**
 * @openapi
 * /api/externas/checklist/mes:
 *   get:
 *     tags: [ExternasChecklist]
 *     summary: Obtener el checklist del mes para todas las empresas en una sola llamada
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: Array de { empresaId, items[] }, uno por empresa.
 */
router.get('/mes',
  ...validateAnioMes,
  getChecklistMesTodasEmpresas
);

/**
 * @openapi
 * /api/externas/checklist/{empresaId}:
 *   get:
 *     tags: [ExternasChecklist]
 *     summary: Obtener checklist de una empresa para un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: Lista de procesos con su estado en el mes (no crea fila al leer).
 */
router.get('/:empresaId',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  getChecklistMes
);

/**
 * @openapi
 * /api/externas/checklist/{empresaId}/item/{procesoId}:
 *   put:
 *     tags: [ExternasChecklist]
 *     summary: Actualizar estado/nota de un proceso individual en un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: procesoId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               estado: { type: string, enum: [pending, in_progress, done, na] }
 *               nota:   { type: string }
 *     responses:
 *       200:
 *         description: Item actualizado. Crea ext_checklist_meses si el mes no existía.
 *       403:
 *         description: Sin permiso de edición en Empresas Externas, o mes vencido
 */
router.put('/:empresaId/item/:procesoId',
  ...validateUUIDParam('empresaId'),
  ...validateUUIDParam('procesoId'),
  ...validateAnioMes,
  requireExternasAccess,
  body('estado').optional().isIn(['pending', 'in_progress', 'done', 'na'])
    .withMessage('estado debe ser pending, in_progress, done o na'),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updateChecklistItem
);

module.exports = router;
