const { Router } = require('express');
const { query } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { getPeriodos, getConsolidado, getResumenAnual, exportarConsolidado } = require('../controllers/contabConsolidadoController');

const router = Router();
router.use(authMiddleware);

const validatePeriodoQuery = [
  query('empresaId').notEmpty().withMessage('empresaId es requerido').isUUID().withMessage('empresaId debe ser un UUID válido'),
  query('anio').notEmpty().withMessage('anio es requerido').isInt({ min: 2000, max: 2100 }).toInt(),
  query('mes').optional().isInt({ min: 1, max: 12 }).toInt(),
  query('cuatrimestre').optional().isInt({ min: 1, max: 3 }).toInt(),
  validate,
];

/**
 * @openapi
 * /api/contabilidad/periodos:
 *   get:
 *     tags: [ContabilidadConsolidado]
 *     summary: Meses ya guardados para una empresa (para saber qué se puede consultar/exportar)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: query, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Lista de períodos guardados
 */
router.get('/periodos',
  query('empresaId').notEmpty().isUUID().withMessage('empresaId debe ser un UUID válido'),
  validate,
  getPeriodos
);

/**
 * @openapi
 * /api/contabilidad/consolidado/resumen-anual:
 *   get:
 *     tags: [ContabilidadConsolidado]
 *     summary: Base de compras/ventas por cada uno de los 12 meses del año (para el gráfico de tendencia)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: query, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: Arreglo de 12 posiciones (una por mes) con base de compras y ventas
 */
router.get('/consolidado/resumen-anual',
  query('empresaId').notEmpty().withMessage('empresaId es requerido').isUUID().withMessage('empresaId debe ser un UUID válido'),
  query('anio').notEmpty().withMessage('anio es requerido').isInt({ min: 2000, max: 2100 }).toInt(),
  validate,
  getResumenAnual
);

/**
 * @openapi
 * /api/contabilidad/consolidado:
 *   get:
 *     tags: [ContabilidadConsolidado]
 *     summary: Consolidado mensual, cuatrimestral (con cuatrimestre=1|2|3) o anual (sin mes ni cuatrimestre)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: empresaId, in: query, required: true, schema: { type: string, format: uuid } }
 *       - { name: anio, in: query, required: true, schema: { type: integer } }
 *       - { name: mes, in: query, schema: { type: integer, minimum: 1, maximum: 12 } }
 *       - { name: cuatrimestre, in: query, schema: { type: integer, minimum: 1, maximum: 3 } }
 *     responses:
 *       200:
 *         description: Totales, agrupados por concepto/IVA, y detalle de documentos
 *       404:
 *         description: Empresa no encontrada
 */
router.get('/consolidado', validatePeriodoQuery, getConsolidado);

router.get('/consolidado/exportar', validatePeriodoQuery, exportarConsolidado);

module.exports = router;
