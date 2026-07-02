const { Router } = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { uploadDian, patchBorrador, exportarBorrador, aplicarClasificacionRapida } = require('../controllers/dianController');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    // Algunos clientes envían octet-stream para .xlsx — lo aceptamos y dejamos que exceljs lo valide
    if (allowed.includes(file.mimetype) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos Excel (.xlsx)'));
    }
  },
});

const handleUpload = (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Error de carga: ${err.message}` });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

router.use(authMiddleware);

/**
 * @openapi
 * /api/dian/upload:
 *   post:
 *     tags: [DIAN]
 *     summary: Cargar reporte Excel de la DIAN, calcular valores base y guardar borrador
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:
 *                 type: string
 *                 format: binary
 *                 description: Archivo Excel exportado del portal DIAN
 *     responses:
 *       201:
 *         description: Borrador creado. Devuelve id del borrador y cálculos base.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:         { type: string, format: uuid }
 *                 totalFilas: { type: integer }
 *                 calculos:
 *                   type: object
 *                   properties:
 *                     comprasBruto:         { type: number }
 *                     devolucionCompras:    { type: number }
 *                     ventasBruto:          { type: number }
 *                     devolucionVentas:     { type: number }
 *                     ivaDescontable:       { type: number }
 *                     ivaGenerado:          { type: number }
 *                     ivaDevolucionCompras: { type: number }
 *                     ivaDevolucionVentas:  { type: number }
 *       400:
 *         description: Archivo ausente, tipo inválido, o columna requerida faltante.
 *       401:
 *         description: No autenticado.
 */
router.post('/upload', handleUpload, uploadDian);

/**
 * @openapi
 * /api/dian/borradores/{id}:
 *   patch:
 *     tags: [DIAN]
 *     summary: Clasificar una fila del borrador (clasificacionRetencion + tasaRetencion)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [indice]
 *             properties:
 *               indice:                 { type: integer }
 *               clasificacionRetencion: { type: string, nullable: true }
 *               tasaRetencion:          { type: number, nullable: true }
 *     responses:
 *       200:
 *         description: Clasificación guardada.
 *       400:
 *         description: indice no existe en el borrador.
 *       404:
 *         description: Borrador no encontrado o no pertenece al usuario.
 */
router.patch('/borradores/:id',
  body('indice').notEmpty().isInt({ min: 0 }).withMessage('"indice" debe ser entero >= 0').toInt(),
  body('clasificacionRetencion').optional({ nullable: true }).isString(),
  body('tasaRetencion').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validate,
  patchBorrador
);

router.patch('/borradores/:id/aplicar-clasificacion-rapida',
  body('clasificacionRetencion').notEmpty().isString(),
  body('tasaRetencion').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validate,
  aplicarClasificacionRapida
);

router.post('/borradores/:id/exportar',
  body('empleados').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('meses').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
  body('salario').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  validate,
  exportarBorrador
);

module.exports = router;
