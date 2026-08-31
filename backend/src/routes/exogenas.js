const { Router } = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const {
  uploadExogenas, getExogenasBorrador, generarExogenas, generarExogenasCombinado,
  FORMATOS_SOPORTADOS,
} = require('../controllers/exogenasController');

const router = Router();

const EXCEL_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
];
const excelFileFilter = (_req, file, cb) => {
  if (EXCEL_MIMES.includes(file.mimetype) || file.mimetype === 'application/octet-stream') {
    cb(null, true);
  } else {
    cb(new Error('Solo se aceptan archivos Excel (.xlsx)'));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: excelFileFilter,
});

const handleUpload = (req, res, next) => {
  upload.fields([{ name: 'token', maxCount: 1 }, { name: 'plantilla', maxCount: 1 }])(req, res, (err) => {
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
 * /api/exogenas/upload:
 *   post:
 *     tags: [Exógenas]
 *     summary: Cargar TOKEN + plantilla SIIGO, agrupar por tercero y guardar borrador
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               formato:   { type: string, enum: [1001, 1005, 1006, 1007] }
 *               token:     { type: string, format: binary, description: Detalle de compras/ventas (hoja COMPRAS o VENTAS según el formato) }
 *               plantilla: { type: string, format: binary, description: Plantilla SIIGO del formato correspondiente }
 *     responses:
 *       201:
 *         description: Borrador creado. Devuelve id, resumen y registros agrupados.
 *       400:
 *         description: Archivo ausente, formato no soportado, o columna/hoja requerida faltante.
 *       401:
 *         description: No autenticado.
 */
router.post('/upload',
  handleUpload,
  body('formato').notEmpty().isIn(FORMATOS_SOPORTADOS).withMessage(`"formato" debe ser uno de: ${FORMATOS_SOPORTADOS.join(', ')}`),
  validate,
  uploadExogenas
);

/**
 * @openapi
 * /api/exogenas/borradores/{id}:
 *   get:
 *     tags: [Exógenas]
 *     summary: Recargar el estado de un borrador (registros agrupados + resumen)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Estado actual del borrador.
 *       404:
 *         description: Borrador no encontrado o no pertenece al usuario.
 */
router.get('/borradores/:id', getExogenasBorrador);

/**
 * @openapi
 * /api/exogenas/borradores/{id}/generar:
 *   post:
 *     tags: [Exógenas]
 *     summary: Escribir los registros en la plantilla SIIGO y descargar el Excel generado
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Archivo Excel generado.
 *       404:
 *         description: Borrador no encontrado o no pertenece al usuario.
 */
router.post('/borradores/:id/generar', generarExogenas);

/**
 * @openapi
 * /api/exogenas/generar-combinado:
 *   post:
 *     tags: [Exógenas]
 *     summary: Escribir varios borradores (uno por formato) en un solo Excel, cada uno en su propia hoja
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids: { type: array, items: { type: string, format: uuid }, minItems: 1 }
 *     responses:
 *       200:
 *         description: Archivo Excel generado con la hoja de cada formato ya llena.
 *       400:
 *         description: "ids" ausente/vacío, o error de negocio al llenar alguna hoja.
 *       404:
 *         description: Alguno de los borradores no existe, ya expiró o no pertenece al usuario.
 */
router.post('/generar-combinado',
  body('ids').isArray({ min: 1 }).withMessage('Se requiere un arreglo "ids" con al menos un borrador'),
  body('ids.*').isUUID().withMessage('Cada id debe ser un UUID válido'),
  validate,
  generarExogenasCombinado
);

module.exports = router;
