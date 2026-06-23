const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getChecklistMes,
  updateChecklistItem,
  updateChecklistConfirmado,
} = require('../controllers/fondoChecklistController');

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
 * /api/fondo/checklist/{empresaId}:
 *   get:
 *     tags: [FondoChecklist]
 *     summary: Obtener checklist de una empresa para un mes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: >
 *           Lista de procesos con su estado en el mes. confirmed=false si el mes
 *           nunca ha sido tocado (no se crea fila en fondo_checklist_meses al leer).
 */
router.get('/:empresaId',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  getChecklistMes
);

/**
 * @openapi
 * /api/fondo/checklist/{empresaId}/item/{procesoId}:
 *   put:
 *     tags: [FondoChecklist]
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
 *         description: Item actualizado. Crea fondo_checklist_meses si el mes no existía.
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender
 */
router.put('/:empresaId/item/:procesoId',
  ...validateUUIDParam('empresaId'),
  ...validateUUIDParam('procesoId'),
  ...validateAnioMes,
  requireFondoAccess,
  body('estado').optional().isIn(['pending', 'in_progress', 'done', 'na'])
    .withMessage('estado debe ser pending, in_progress, done o na'),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updateChecklistItem
);

/**
 * @openapi
 * /api/fondo/checklist/{empresaId}/confirmado:
 *   put:
 *     tags: [FondoChecklist]
 *     summary: Marcar/desmarcar el mes como confirmado (flag "Contabilidad")
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes,  in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [confirmed]
 *             properties:
 *               confirmed: { type: boolean }
 *     responses:
 *       200:
 *         description: Mes actualizado
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender
 */
router.put('/:empresaId/confirmado',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  requireFondoAccess,
  body('confirmed').isBoolean().withMessage('confirmed debe ser boolean'),
  validate,
  updateChecklistConfirmado
);

module.exports = router;
