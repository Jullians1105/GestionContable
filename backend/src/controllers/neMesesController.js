const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { isMesHabilitado } = require('../utils/mesVencido');

const normalizeRow = (row) => ({
  empresaId:         row.empresa_id,
  name:              row.name,
  origen:            row.origen ?? null,
  responsableId:     row.responsable_id ?? null,
  responsableNombre: row.responsable_nombre ?? null,
  fondoEmpresaId:    row.fondo_empresa_id ?? null,
  extEmpresaId:      row.ext_empresa_id ?? null,
  estado:            row.estado ?? 'pendiente',
  autorizada:        row.autorizada ?? false,
  tieneNovedad:      row.tiene_novedad ?? false,
  novedadNota:       row.novedad_nota ?? null,
  nota:              row.nota ?? null,
  updatedAt:         row.updated_at,
});

// Mes para TODAS las empresas en una sola consulta — evita el N+1 documentado
// en extChecklistController.getChecklistMesTodasEmpresas. Con scope 'own'
// (cada quien lo suyo) se filtra por responsable_id acá, no en el frontend.
const getMesTodasEmpresas = async (req, res, next) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const own  = req.neScope === 'own';

    const result = await db.query(
      `SELECT e.id AS empresa_id, e.name, e.origen, e.responsable_id, e.fondo_empresa_id, e.ext_empresa_id,
              u.name AS responsable_nombre,
              COALESCE(m.estado, 'pendiente') AS estado,
              COALESCE(m.autorizada, false) AS autorizada,
              COALESCE(m.tiene_novedad, false) AS tiene_novedad,
              m.novedad_nota, m.nota, m.updated_at
       FROM ne_empresas e
       LEFT JOIN users u ON u.id = e.responsable_id
       LEFT JOIN ne_meses m ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
       WHERE e.activa = true ${own ? 'AND e.responsable_id = $3' : ''}
       ORDER BY e.name ASC`,
      own ? [anio, mes, req.user.userId] : [anio, mes]
    );

    res.json(result.rows.map(normalizeRow));
  } catch (err) {
    next(err);
  }
};

const updateMes = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { estado, autorizada, tieneNovedad } = req.body;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    const empresaResult = await db.query('SELECT responsable_id FROM ne_empresas WHERE id = $1 AND activa = true', [empresaId]);
    if (!empresaResult.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    if (req.neScope === 'own' && empresaResult.rows[0].responsable_id !== req.user.userId) {
      return res.status(403).json({ error: 'Esta empresa no está a tu cargo' });
    }

    // Distinguir "no lo mandaron" (no tocar el valor guardado) de "lo
    // mandaron explícitamente" (incluido vaciarlo) — mismo criterio que nota
    // en extChecklistController.updateChecklistItem.
    const novedadNotaProvided = Object.prototype.hasOwnProperty.call(req.body, 'novedadNota');
    let novedadNotaToSave = null;
    if (novedadNotaProvided) {
      novedadNotaToSave = typeof req.body.novedadNota === 'string' ? req.body.novedadNota.trim() : req.body.novedadNota;
      if (novedadNotaToSave === '') novedadNotaToSave = null;
    }
    const notaProvided = Object.prototype.hasOwnProperty.call(req.body, 'nota');
    let notaToSave = null;
    if (notaProvided) {
      notaToSave = typeof req.body.nota === 'string' ? req.body.nota.trim() : req.body.nota;
      if (notaToSave === '') notaToSave = null;
    }

    await db.query(
      `INSERT INTO ne_meses (id, empresa_id, anio, mes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, anio, mes) DO NOTHING`,
      [uuidv4(), empresaId, anio, mes]
    );

    const result = await db.query(
      `UPDATE ne_meses SET
        estado        = COALESCE($1, estado),
        autorizada    = COALESCE($2, autorizada),
        tiene_novedad = COALESCE($3, tiene_novedad),
        novedad_nota  = CASE WHEN $4 THEN $5 ELSE novedad_nota END,
        nota          = CASE WHEN $6 THEN $7 ELSE nota END
       WHERE empresa_id = $8 AND anio = $9 AND mes = $10
       RETURNING *`,
      [
        estado ?? null,
        autorizada ?? null,
        tieneNovedad ?? null,
        novedadNotaProvided, novedadNotaToSave,
        notaProvided, notaToSave,
        empresaId, anio, mes,
      ]
    );

    await auditLog(req.user.userId, 'UPDATE', 'ne_meses', result.rows[0].id, {
      empresaId, anio, mes, estado, autorizada, tieneNovedad, novedadNota: novedadNotaToSave, nota: notaToSave,
    });

    req.io.emit('nominaElectronica:updated', { empresaId, anio, mes, tipo: 'mes' });

    res.json({
      id:           result.rows[0].id,
      empresaId:    result.rows[0].empresa_id,
      estado:       result.rows[0].estado,
      autorizada:   result.rows[0].autorizada,
      tieneNovedad: result.rows[0].tiene_novedad,
      novedadNota:  result.rows[0].novedad_nota,
      nota:         result.rows[0].nota,
      updatedAt:    result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getMesTodasEmpresas, updateMes };
