const { Router } = require('express');
const { param, body, query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { getDetalle, updateDetalle, getMacroTareas, getResponsables } = require('../controllers/fondoDetalleController');

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

const validateMacroId = [
  param('macroId')
    .isInt({ min: 1, max: 7 })
    .withMessage('macroId debe ser un entero entre 1 y 7')
    .toInt(),
  validate,
];

router.get('/tareas-macro', getMacroTareas);
router.get('/responsables', getResponsables);

/**
 * @openapi
 * /api/fondo/detalle/{empresaId}:
 *   get:
 *     tags: [FondoDetalle]
 *     summary: Obtener los 7 macroprocesos de una empresa para un mes (mp5 derivado de checklist)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path,  required: true, schema: { type: string, format: uuid } }
 *       - { name: anio,      in: query, required: true, schema: { type: integer } }
 *       - { name: mes,       in: query, required: true, schema: { type: integer, minimum: 1, maximum: 12 } }
 *     responses:
 *       200:
 *         description: >
 *           Array de 7 macroprocesos (mp1-mp7). mp2/Nómina y mp5/Contabilidad son readonly y
 *           sus campos confirmed/enviado se derivan de fondo_checklist_meses (columnas
 *           _nomina/_contabilidad respectivamente). Los demás reflejan fondo_detalle_macroprocesos.
 */
router.get('/:empresaId',
  ...validateUUIDParam('empresaId'),
  ...validateAnioMes,
  getDetalle
);

/**
 * @openapi
 * /api/fondo/detalle/{empresaId}/{macroId}:
 *   put:
 *     tags: [FondoDetalle]
 *     summary: Actualizar responsable y/o nota de un macroproceso (mp1-4, mp6, mp7)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: macroId,   in: path, required: true, schema: { type: integer, minimum: 1, maximum: 7 } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               responsableId: { type: string, format: uuid }
 *               nota:          { type: string }
 *     responses:
 *       200:
 *         description: Macroproceso actualizado (crea la fila si no existía).
 *       400:
 *         description: macroId=5 no se puede editar directamente.
 *       403:
 *         description: Sin permiso de edición en Fondo Emprender.
 */
router.put('/:empresaId/:macroId',
  ...validateUUIDParam('empresaId'),
  ...validateMacroId,
  requireFondoAccess,
  body('anio').notEmpty().isInt({ min: 2000, max: 2100 }).toInt().withMessage('anio requerido'),
  body('mes').notEmpty().isInt({ min: 1, max: 12 }).toInt().withMessage('mes requerido'),
  body('estado').optional().isIn(['pending', 'in_progress', 'done'])
    .withMessage('estado debe ser pending, in_progress o done'),
  body('responsableId').optional({ nullable: true }).isUUID().withMessage('responsableId debe ser un UUID válido'),
  body('nota').optional({ nullable: true }).isString(),
  validate,
  updateDetalle
);

module.exports = router;
