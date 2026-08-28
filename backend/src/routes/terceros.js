const { Router } = require('express');
const multer = require('multer');
const { body } = require('express-validator');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { uploadTerceros, consultarTercero, TIPOS_OPERACION } = require('../controllers/tercerosController');

const router = Router();

// Un lote típico es el conjunto de facturas de un periodo completo (puede ser varios cientos) —
// 500 da margen de sobra sin arriesgar memoria: cada PDF de factura DIAN pesa unos cientos de KB
// como mucho, así que 500 de a 5 MB es un techo de seguridad, no lo esperable en la práctica.
const MAX_PDFS_POR_LOTE = 500;

const uploadPdfs = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: MAX_PDFS_POR_LOTE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream') {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos PDF'));
    }
  },
});

const handleUploadPdfs = (req, res, next) => {
  uploadPdfs.array('pdfs', MAX_PDFS_POR_LOTE)(req, res, (err) => {
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
 * /api/terceros/upload:
 *   post:
 *     tags: [Terceros]
 *     summary: Subir PDFs de factura DIAN y extraer dirección/municipio/departamento por tercero
 *     description: Extrae Emisor y Adquiriente de cada PDF y hace upsert en `terceros` por NIT. Base de datos de uso general (no exclusiva de un módulo) — hoy alimenta el formato 1001 de Exógenas.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               tipoOperacion: { type: string, enum: [compras, ventas], description: "compras -> guarda el Emisor (vendedor); ventas -> guarda el Adquiriente (comprador)" }
 *               pdfs: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       200:
 *         description: Resumen del procesamiento (terceros guardados + errores por archivo, si los hubo).
 *       400:
 *         description: No se envió ningún PDF, o "tipoOperacion" ausente/inválido.
 *       401:
 *         description: No autenticado.
 */
router.post('/upload',
  handleUploadPdfs,
  body('tipoOperacion').notEmpty().isIn(TIPOS_OPERACION).withMessage(`"tipoOperacion" debe ser uno de: ${TIPOS_OPERACION.join(', ')}`),
  validate,
  uploadTerceros
);

/**
 * @openapi
 * /api/terceros/{nit}:
 *   get:
 *     tags: [Terceros]
 *     summary: Consultar un tercero guardado por NIT/documento ("Consulta Tercero")
 *     description: Devuelve todos los datos guardados del tercero, incluyendo régimen fiscal, responsabilidad tributaria, teléfono y correo — estos 4 solo se exponen acá, nunca en el resumen de /upload.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: nit
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Datos del tercero.
 *       400:
 *         description: Documento inválido.
 *       404:
 *         description: No hay ningún tercero guardado con ese documento.
 *       401:
 *         description: No autenticado.
 */
router.get('/:nit', consultarTercero);

module.exports = router;
