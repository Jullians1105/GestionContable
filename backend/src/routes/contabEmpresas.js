const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const {
  getEmpresas, getEmpresa, updateEmpresa, deleteEmpresa,
} = require('../controllers/contabEmpresasController');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/contabilidad/empresas:
 *   get:
 *     tags: [ContabilidadEmpresas]
 *     summary: Listar empresas del módulo Contabilidad
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de empresas ordenada por nombre
 */
router.get('/', getEmpresas);

/**
 * @openapi
 * /api/contabilidad/empresas/{id}:
 *   get:
 *     tags: [ContabilidadEmpresas]
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
router.get('/:id', ...validateUUIDParam('id'), getEmpresa);

// Crear una empresa nueva ya no vive acá — solo en el directorio maestro
// (POST /api/empresas + habilitar módulo 'contab'), ver
// docs/ESTADO_EMPRESAS_DIRECTORIO.md.

/**
 * @openapi
 * /api/contabilidad/empresas/{id}:
 *   put:
 *     tags: [ContabilidadEmpresas]
 *     summary: Actualizar empresa (abierto a cualquier usuario autenticado)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Empresa actualizada
 *       404:
 *         description: Empresa no encontrada
 */
router.put('/:id',
  ...validateUUIDParam('id'),
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('activa').optional().isBoolean().withMessage('activa debe ser boolean'),
  body('nit').optional({ nullable: true }).trim().isLength({ max: 20 }).withMessage('nit debe tener máximo 20 caracteres'),
  validate,
  updateEmpresa
);

/**
 * @openapi
 * /api/contabilidad/empresas/{id}:
 *   delete:
 *     tags: [ContabilidadEmpresas]
 *     summary: Eliminar empresa (solo admin — borra en cascada sus períodos y documentos)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       204:
 *         description: Empresa eliminada
 *       403:
 *         description: Solo un administrador puede eliminar empresas
 *       404:
 *         description: Empresa no encontrada
 */
router.delete('/:id',
  ...validateUUIDParam('id'),
  roleMiddleware('admin'),
  deleteEmpresa
);

module.exports = router;
