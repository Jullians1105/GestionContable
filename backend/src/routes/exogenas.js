const { Router } = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { uploadExogenas, getExogenasBorrador, generarExogenas, FORMATOS_SOPORTADOS } = require('../controllers/exogenasController');

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos Excel (.xlsx)'));
    }
  },
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
 *               formato:   { type: string, enum: [1005] }
 *               token:     { type: string, format: binary, description: Detalle de compras (hoja COMPRAS) }
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

module.exports = router;
