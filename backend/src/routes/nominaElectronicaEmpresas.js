const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireNEView, requireNEAdmin } = require('../middleware/nominaElectronicaAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa,
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

// Crear una empresa nueva ya no vive acá — solo en el directorio maestro
// (POST /api/empresas + habilitar módulo 'ne'), ver
// docs/ESTADO_EMPRESAS_DIRECTORIO.md.

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
