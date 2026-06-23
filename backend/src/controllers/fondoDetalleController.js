const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const MP_CATALOG = [
  { id: 1, nombre: 'Revisión documental' },
  { id: 2, nombre: 'Análisis contable' },
  { id: 3, nombre: 'Seguimiento tributario' },
  { id: 4, nombre: 'Asesoría integral' },
  { id: 6, nombre: 'Generación de reportes' },
  { id: 7, nombre: 'Aprobación final' },
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
         FROM (SELECT 1 AS id, 'Revisión documental'   AS nombre UNION ALL
               SELECT 2,       'Análisis contable'              UNION ALL
               SELECT 3,       'Seguimiento tributario'         UNION ALL
               SELECT 4,       'Asesoría integral'              UNION ALL
               SELECT 6,       'Generación de reportes'         UNION ALL
               SELECT 7,       'Aprobación final') mp
         LEFT JOIN fondo_detalle_macroprocesos d
                ON d.empresa_id = $1
               AND d.macroproceso_id = 'mp' || mp.id::text
         ORDER BY mp.id`,
        [empresaId]
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

    const { responsableId, nota, estado } = req.body;
    const mpKey = `mp${macroNum}`;

    const result = await db.query(
      `INSERT INTO fondo_detalle_macroprocesos (id, empresa_id, macroproceso_id, estado, responsable_id, nota)
       VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5, $6)
       ON CONFLICT (empresa_id, macroproceso_id) DO UPDATE
       SET estado         = COALESCE(EXCLUDED.estado,         fondo_detalle_macroprocesos.estado),
           responsable_id = COALESCE(EXCLUDED.responsable_id, fondo_detalle_macroprocesos.responsable_id),
           nota           = COALESCE(EXCLUDED.nota,           fondo_detalle_macroprocesos.nota)
       RETURNING *`,
      [uuidv4(), empresaId, mpKey, estado ?? null, responsableId ?? null, nota ?? null]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_detalle_macroprocesos', result.rows[0].id, {
      empresaId,
      macroId: mpKey,
      estado,
      responsableId,
      nota,
    });

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
