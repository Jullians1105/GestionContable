const { Router } = require('express');
const { body, query } = require('express-validator');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { requireFondoAccess } = require('../middleware/fondoAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa,
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

/**
 * @openapi
 * /api/fondo/empresas:
 *   post:
 *     tags: [FondoEmpresas]
 *     summary: Crear nueva empresa
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
 *               name:       { type: string, maxLength: 255 }
 *               categoria:  { type: string, enum: [contable, tributario] }
 *               monthlyFee: { type: number, minimum: 0 }
 *     responses:
 *       201:
 *         description: Empresa creada
 */
router.post('/',
  requireFondoAccess,
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  body('categoria').optional().isIn(['contable', 'tributario']),
  body('monthlyFee').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('monthlyFee debe ser un número >= 0'),
  validate,
  createEmpresa
);

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
 *               name:       { type: string, maxLength: 255 }
 *               categoria:  { type: string, enum: [contable, tributario] }
 *               monthlyFee: { type: number, minimum: 0 }
 *     responses:
 *       200:
 *         description: Empresa actualizada
 *       404:
 *         description: Empresa no encontrada
 */
router.put('/:id',
  validateUUIDParam('id'),
  requireFondoAccess,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('categoria').optional().isIn(['contable', 'tributario']),
  body('monthlyFee').optional({ nullable: true }).isFloat({ min: 0 }),
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
