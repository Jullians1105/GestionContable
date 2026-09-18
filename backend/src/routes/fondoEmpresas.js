const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa,
} = require('../controllers/fondoEmpresasController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/fondo/empresas:
 *   get:
 *     tags: [FondoEmpresas]
 *     summary: Listar empresas de Fondo Emprender
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: categoria, in: query, schema: { type: string, enum: [contable, tributario] } }
 *     responses:
 *       200:
 *         description: Lista de empresas ordenada por nombre
 */
router.get('/',
  query('categoria').optional().isIn(['contable', 'tributario']),
  validate,
  getEmpresas
);

/**
 * @openapi
 * /api/fondo/empresas/{id}:
 *   get:
 *     tags: [FondoEmpresas]
 *     summary: Obtener empresa por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Empresa encontrada
 *       404:
 *         description: Empresa no encontrada
 */
router.get('/:id', validateUUIDParam('id'), getEmpresa);

// Crear una empresa nueva ya no vive acá — solo en el directorio maestro
// (POST /api/empresas + habilitar módulo 'fondo'), ver
// docs/ESTADO_EMPRESAS_DIRECTORIO.md.

/**
 * @openapi
 * /api/fondo/empresas/{id}:
 *   put:
 *     tags: [FondoEmpresas]
 *     summary: Actualizar empresa
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
 *               name:        { type: string, maxLength: 255 }
 *               categoria:   { type: string, enum: [contable, tributario] }
 *               monthlyFee:  { type: number, minimum: 0 }
 *               codigoSiigo: { type: string, maxLength: 20, nullable: true, description: Solo admin; null lo borra }
 *     responses:
 *       200:
 *         description: Empresa actualizada
 *       403:
 *         description: Sin permiso de edición, o codigoSiigo enviado por un no-admin
 *       404:
 *         description: Empresa no encontrada
 */
router.put('/:id',
  validateUUIDParam('id'),
  requireFondoAccess,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('categoria').optional().isIn(['contable', 'tributario']),
  body('monthlyFee').optional({ nullable: true }).isFloat({ min: 0 }),
  body('codigoSiigo').optional({ nullable: true }).trim().isLength({ max: 20 }).withMessage('El código Siigo no puede superar 20 caracteres'),
  validate,
  updateEmpresa
);

/**
 * @openapi
 * /api/fondo/empresas/{id}:
 *   delete:
 *     tags: [FondoEmpresas]
 *     summary: Eliminar empresa (solo admin — borra en cascada checklist, detalle y pagos)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204:
 *         description: Empresa eliminada
 *       404:
 *         description: Empresa no encontrada
 */
router.delete('/:id',
  validateUUIDParam('id'),
  roleMiddleware('admin'),
  deleteEmpresa
);

module.exports = router;
