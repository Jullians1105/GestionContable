const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { requireExternasAdmin } = require('../middleware/externasAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa,
} = require('../controllers/extEmpresasController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/externas/empresas:
 *   get:
 *     tags: [ExternasEmpresas]
 *     summary: Listar empresas externas
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de empresas ordenada por nombre
 */
router.get('/', getEmpresas);

/**
 * @openapi
 * /api/externas/empresas/{id}:
 *   get:
 *     tags: [ExternasEmpresas]
 *     summary: Obtener empresa externa por ID
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
router.get('/:id', ...validateUUIDParam('id'), getEmpresa);

// Crear una empresa nueva ya no vive acá — solo en el directorio maestro
// (POST /api/empresas + habilitar módulo 'ext'), ver
// docs/ESTADO_EMPRESAS_DIRECTORIO.md.

/**
 * @openapi
 * /api/externas/empresas/{id}:
 *   put:
 *     tags: [ExternasEmpresas]
 *     summary: Actualizar empresa externa
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
 *               name:          { type: string, maxLength: 255 }
 *               activa:        { type: boolean }
 *               responsableId: { type: string, format: uuid, nullable: true, description: null desasigna el responsable }
 *               contador:      { type: string, maxLength: 255, nullable: true, description: null desasigna el contador }
 *     responses:
 *       200:
 *         description: Empresa actualizada
 *       403:
 *         description: Solo un administrador puede gestionar empresas
 *       404:
 *         description: Empresa no encontrada
 */
router.put('/:id',
  ...validateUUIDParam('id'),
  requireExternasAdmin,
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('activa').optional().isBoolean().withMessage('activa debe ser boolean'),
  body('responsableId').optional({ nullable: true }).isUUID().withMessage('responsableId debe ser un UUID válido'),
  body('contador').optional({ nullable: true }).trim().isLength({ max: 255 }).withMessage('contador debe tener máximo 255 caracteres'),
  validate,
  updateEmpresa
);

/**
 * @openapi
 * /api/externas/empresas/{id}:
 *   delete:
 *     tags: [ExternasEmpresas]
 *     summary: Eliminar empresa externa (solo admin — borra en cascada su checklist)
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
  ...validateUUIDParam('id'),
  requireExternasAdmin,
  deleteEmpresa
);

module.exports = router;
