const { Router } = require('express');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { uploadDian } = require('../controllers/dianController');

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

module.exports = router;
