const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const MP_CATALOG = [
  { id: 1, nombre: 'Facturación' },
  { id: 2, nombre: 'Nómina' },
  { id: 3, nombre: 'Nómina electrónica' },
  { id: 4, nombre: 'Documentos contador - Pagos' },
  { id: 6, nombre: 'Información tributaria' },
  { id: 7, nombre: 'Producción y ventas' },
];

const normalizeDetalle = (row) => ({
  id:            row.id,
  nombre:        row.nombre,
  estado:        row.estado ?? 'pending',
  responsableId: row.responsable_id ?? null,
  nota:          row.nota ?? null,
  updatedAt:     row.updated_at ?? null,
});

const getDetalle = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const [mpResult, mp5Result] = await Promise.all([
      db.query(
        `SELECT mp.id, mp.nombre, d.estado, d.responsable_id, d.nota, d.updated_at
         FROM (SELECT 1 AS id, 'Facturación'                  AS nombre UNION ALL
               SELECT 2,       'Nómina'                                 UNION ALL
               SELECT 3,       'Nómina electrónica'                     UNION ALL
               SELECT 4,       'Documentos contador - Pagos'            UNION ALL
               SELECT 6,       'Información tributaria'                  UNION ALL
               SELECT 7,       'Producción y ventas') mp
         LEFT JOIN fondo_detalle_macroprocesos d
                ON d.empresa_id = $1
               AND d.macroproceso_id = 'mp' || mp.id::text
               AND d.anio = $2
               AND d.mes  = $3
         ORDER BY mp.id`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT confirmed FROM fondo_checklist_meses
         WHERE empresa_id = $1 AND anio = $2 AND mes = $3
         LIMIT 1`,
        [empresaId, anio, mes]
      ),
    ]);

    const mp5Confirmed = mp5Result.rows.length > 0 ? mp5Result.rows[0].confirmed : false;

    const macroprocesos = mpResult.rows.map(normalizeDetalle);

    // mp5 (Contabilidad) es readonly — se deriva de fondo_checklist_meses.confirmed
    const mp5 = {
      id:            5,
      nombre:        'Contabilidad',
      estado:        mp5Confirmed ? 'done' : 'pending',
      confirmed:     mp5Confirmed,
      responsableId: null,
      nota:          null,
      updatedAt:     null,
      readonly:      true,
    };

    // Insertar mp5 entre mp4 (index 3) y mp6 (index 4)
    macroprocesos.splice(4, 0, mp5);

    res.json({ macroprocesos });
  } catch (err) {
    next(err);
  }
};

const updateDetalle = async (req, res, next) => {
  try {
    const { empresaId, macroId } = req.params;
    const macroNum = parseInt(macroId, 10);

    if (macroNum === 5) {
      return res.status(400).json({ error: 'mp5/Contabilidad no se edita directamente' });
    }

    const { responsableId, nota, estado, anio, mes } = req.body;
    const mpKey = `mp${macroNum}`;

    const result = await db.query(
      `INSERT INTO fondo_detalle_macroprocesos (id, empresa_id, macroproceso_id, anio, mes, estado, responsable_id, nota)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'pending'), $7, $8)
       ON CONFLICT (empresa_id, macroproceso_id, anio, mes) DO UPDATE
       SET estado         = COALESCE(EXCLUDED.estado,         fondo_detalle_macroprocesos.estado),
           responsable_id = COALESCE(EXCLUDED.responsable_id, fondo_detalle_macroprocesos.responsable_id),
           nota           = COALESCE(EXCLUDED.nota,           fondo_detalle_macroprocesos.nota)
       RETURNING *`,
      [uuidv4(), empresaId, mpKey, anio, mes, estado ?? null, responsableId ?? null, nota ?? null]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_detalle_macroprocesos', result.rows[0].id, {
      empresaId,
      macroId: mpKey,
      estado,
      responsableId,
      nota,
    });

    req.io.emit('empresa:updated', { empresaId, tipo: 'detalle' });

    const catalogEntry = MP_CATALOG.find(m => m.id === macroNum);
    const row = result.rows[0];
    res.json({
      id:            macroNum,
      nombre:        catalogEntry?.nombre,
      estado:        row.estado,
      responsableId: row.responsable_id,
      nota:          row.nota,
      updatedAt:     row.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDetalle, updateDetalle };
