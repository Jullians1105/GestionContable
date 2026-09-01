const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireNEView, requireNEAdmin } = require('../middleware/nominaElectronicaAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa,
} = require('../controllers/neEmpresasController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/nomina-electronica/empresas:
 *   get:
 *     tags: [NominaElectronicaEmpresas]
 *     summary: Listar empresas del catálogo — de momento visible para cualquier autenticado
 *     security:
 *       - bearerAuth: []
 */
router.get('/', requireNEView, getEmpresas);

/**
 * @openapi
 * /api/nomina-electronica/empresas/{id}:
 *   get:
 *     tags: [NominaElectronicaEmpresas]
 *     summary: Obtener empresa por ID
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', ...validateUUIDParam('id'), getEmpresa);

/**
 * @openapi
 * /api/nomina-electronica/empresas:
 *   post:
 *     tags: [NominaElectronicaEmpresas]
 *     summary: Crear empresa (admin o permiso nominaElectronica.canGestionar)
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
 *               name:           { type: string, maxLength: 255 }
 *               responsableId:  { type: string, format: uuid, nullable: true }
 *               fondoEmpresaId: { type: string, format: uuid, nullable: true }
 *               extEmpresaId:   { type: string, format: uuid, nullable: true }
 *     responses:
 *       201:
 *         description: Empresa creada
 *       409:
 *         description: La empresa de Fondo/Externas ya está enlazada a otra fila
 */
router.post('/',
  requireNEAdmin,
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  body('origen').optional({ nullable: true }).isIn(['maritza', 'diana', 'externas']),
  body('responsableId').optional({ nullable: true }).isUUID(),
  body('fondoEmpresaId').optional({ nullable: true }).isUUID(),
  body('extEmpresaId').optional({ nullable: true }).isUUID(),
  validate,
  createEmpresa
);

/**
 * @openapi
 * /api/nomina-electronica/empresas/{id}:
 *   put:
 *     tags: [NominaElectronicaEmpresas]
 *     summary: Actualizar empresa (admin o permiso nominaElectronica.canGestionar)
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id',
  ...validateUUIDParam('id'),
  requireNEAdmin,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('activa').optional().isBoolean(),
  body('origen').optional({ nullable: true }).isIn(['maritza', 'diana', 'externas']),
  body('responsableId').optional({ nullable: true }).isUUID(),
  body('fondoEmpresaId').optional({ nullable: true }).isUUID(),
  body('extEmpresaId').optional({ nullable: true }).isUUID(),
  validate,
  updateEmpresa
);

/**
 * @openapi
 * /api/nomina-electronica/empresas/{id}:
 *   delete:
 *     tags: [NominaElectronicaEmpresas]
 *     summary: Eliminar empresa (admin o permiso canGestionar — borra en cascada su seguimiento mensual)
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', ...validateUUIDParam('id'), requireNEAdmin, deleteEmpresa);

module.exports = router;
