const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { isMesHabilitado } = require('../utils/mesVencido');

// Columnas reales por tipo — Nómina y Contabilidad tienen cada una su propio
// par confirmed/enviado en fondo_checklist_meses (ver migración 031). Nunca
// se arma el nombre de columna a partir de `tipo` con interpolación directa:
// siempre se pasa por este mapa fijo, así `tipo` (ya validado como enum en
// la ruta) no puede terminar inyectado en el SQL.
const TIPO_COLUMNAS = {
  nomina:       { confirmed: 'confirmed_nomina',       confirmedAt: 'confirmed_nomina_at',       enviado: 'enviado_nomina',       enviadoAt: 'enviado_nomina_at' },
  contabilidad: { confirmed: 'confirmed_contabilidad', confirmedAt: 'confirmed_contabilidad_at', enviado: 'enviado_contabilidad', enviadoAt: 'enviado_contabilidad_at' },
};

const getChecklistMes = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const result = await db.query(
      `SELECT p.id, p.name, p.orden, p.activo,
              COALESCE(i.estado, 'pending') AS estado,
              i.nota,
              COALESCE(m.confirmed_nomina, false) AS confirmed_nomina,
              m.confirmed_nomina_at,
              COALESCE(m.enviado_nomina, false) AS enviado_nomina,
              m.enviado_nomina_at,
              COALESCE(m.confirmed_contabilidad, false) AS confirmed_contabilidad,
              m.confirmed_contabilidad_at,
              COALESCE(m.enviado_contabilidad, false) AS enviado_contabilidad,
              m.enviado_contabilidad_at
       FROM fondo_procesos p
       LEFT JOIN fondo_checklist_meses m
              ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
       LEFT JOIN fondo_checklist_items i
              ON i.mes_id = m.id AND i.proceso_id = p.id
       WHERE p.activo = true OR i.id IS NOT NULL
       ORDER BY p.orden`,
      [empresaId, anio, mes]
    );

    const rows = result.rows;
    const first = rows[0];
    const items = rows.map(row => ({
      id:     row.id,
      name:   row.name,
      orden:  row.orden,
      activo: row.activo,
      estado: row.estado,
      nota:   row.nota,
    }));

    res.json({
      confirmedNomina:            first?.confirmed_nomina ?? false,
      confirmedNominaAt:          first?.confirmed_nomina_at ?? null,
      enviadoNomina:              first?.enviado_nomina ?? false,
      enviadoNominaAt:            first?.enviado_nomina_at ?? null,
      confirmedContabilidad:      first?.confirmed_contabilidad ?? false,
      confirmedContabilidadAt:    first?.confirmed_contabilidad_at ?? null,
      enviadoContabilidad:        first?.enviado_contabilidad ?? false,
      enviadoContabilidadAt:      first?.enviado_contabilidad_at ?? null,
      items,
    });
  } catch (err) {
    next(err);
  }
};

// Checklist del mes para TODAS las empresas en una sola consulta — evita el
// N+1 (una petición por empresa) que saturaba el rate limiter con 13+ usuarios
// abriendo la grilla o recibiendo el refetch por socket a la vez.
const getChecklistMesTodasEmpresas = async (req, res, next) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const result = await db.query(
      `SELECT e.id AS empresa_id,
              p.id, p.name, p.orden, p.activo,
              COALESCE(i.estado, 'pending') AS estado,
              i.nota,
              COALESCE(m.confirmed_nomina, false) AS confirmed_nomina,
              m.confirmed_nomina_at,
              COALESCE(m.enviado_nomina, false) AS enviado_nomina,
              m.enviado_nomina_at,
              COALESCE(m.confirmed_contabilidad, false) AS confirmed_contabilidad,
              m.confirmed_contabilidad_at,
              COALESCE(m.enviado_contabilidad, false) AS enviado_contabilidad,
              m.enviado_contabilidad_at
       FROM fondo_empresas e
       CROSS JOIN fondo_procesos p
       LEFT JOIN fondo_checklist_meses m
              ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
       LEFT JOIN fondo_checklist_items i
              ON i.mes_id = m.id AND i.proceso_id = p.id
       WHERE p.activo = true OR i.id IS NOT NULL
       ORDER BY e.id, p.orden`,
      [anio, mes]
    );

    const porEmpresa = new Map();
    for (const row of result.rows) {
      let entry = porEmpresa.get(row.empresa_id);
      if (!entry) {
        entry = {
          empresaId: row.empresa_id,
          confirmedNomina: row.confirmed_nomina,
          confirmedNominaAt: row.confirmed_nomina_at,
          enviadoNomina: row.enviado_nomina,
          enviadoNominaAt: row.enviado_nomina_at,
          confirmedContabilidad: row.confirmed_contabilidad,
          confirmedContabilidadAt: row.confirmed_contabilidad_at,
          enviadoContabilidad: row.enviado_contabilidad,
          enviadoContabilidadAt: row.enviado_contabilidad_at,
          items: [],
        };
        porEmpresa.set(row.empresa_id, entry);
      }
      entry.items.push({
        id:     row.id,
        name:   row.name,
        orden:  row.orden,
        activo: row.activo,
        estado: row.estado,
        nota:   row.nota,
      });
    }

    res.json(Array.from(porEmpresa.values()));
  } catch (err) {
    next(err);
  }
};

const updateChecklistItem = async (req, res, next) => {
  try {
    const { empresaId, procesoId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { estado, nota } = req.body;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    // Distinguir "el frontend no envió nota" (no tocar el valor guardado) de
    // "el frontend envió nota explícitamente" (incluido vaciarla) — antes
    // ambos casos llegaban como NULL y el COALESCE de abajo los trataba igual,
    // por lo que borrar el texto de una nota y perder el foco no la borraba.
    const notaProvided = Object.prototype.hasOwnProperty.call(req.body, 'nota');
    let notaToSave = null;
    if (notaProvided) {
      notaToSave = typeof nota === 'string' ? nota.trim() : nota;
      if (notaToSave === '') notaToSave = null;
    }

    // Crear la fila del mes solo si no existe aún
    await db.query(
      `INSERT INTO fondo_checklist_meses (id, empresa_id, anio, mes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, anio, mes) DO NOTHING`,
      [uuidv4(), empresaId, anio, mes]
    );
    const mesResult = await db.query(
      'SELECT id FROM fondo_checklist_meses WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
      [empresaId, anio, mes]
    );
    const mesId = mesResult.rows[0].id;

    const result = await db.query(
      `INSERT INTO fondo_checklist_items (id, mes_id, proceso_id, estado, nota)
       VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5)
       ON CONFLICT (mes_id, proceso_id) DO UPDATE
       SET estado = COALESCE(EXCLUDED.estado, fondo_checklist_items.estado),
           nota   = CASE WHEN $6 THEN EXCLUDED.nota ELSE fondo_checklist_items.nota END
       RETURNING *`,
      [uuidv4(), mesId, procesoId, estado ?? null, notaToSave, notaProvided]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_checklist_items', result.rows[0].id, {
      empresaId, anio, mes, procesoId, estado, nota: notaToSave,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'checklist' });

    res.json({
      id:        result.rows[0].id,
      mesId:     result.rows[0].mes_id,
      procesoId: result.rows[0].proceso_id,
      estado:    result.rows[0].estado,
      nota:      result.rows[0].nota,
      updatedAt: result.rows[0].updated_at,
    });
  } catch (err) {
    next(err);
  }
};

const updateChecklistConfirmado = async (req, res, next) => {
  try {
    const { empresaId, tipo } = req.params;
    const cols = TIPO_COLUMNAS[tipo];
    if (!cols) return res.status(400).json({ error: 'tipo debe ser nomina o contabilidad' });

    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { confirmed } = req.body;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    // Revertir la confirmación también revierte el envío de ESE mismo tipo:
    // no tiene sentido dejar "enviado" en pie sobre una nómina/contabilidad
    // que ya no está confirmada. El otro tipo no se toca — son independientes.
    const result = await db.query(
      `INSERT INTO fondo_checklist_meses (id, empresa_id, anio, mes, ${cols.confirmed}, ${cols.confirmedAt})
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 THEN NOW() ELSE NULL END)
       ON CONFLICT (empresa_id, anio, mes) DO UPDATE
       SET ${cols.confirmed}   = EXCLUDED.${cols.confirmed},
           ${cols.confirmedAt} = CASE WHEN EXCLUDED.${cols.confirmed} THEN NOW() ELSE NULL END,
           ${cols.enviado}     = CASE WHEN EXCLUDED.${cols.confirmed} THEN fondo_checklist_meses.${cols.enviado} ELSE false END,
           ${cols.enviadoAt}   = CASE WHEN EXCLUDED.${cols.confirmed} THEN fondo_checklist_meses.${cols.enviadoAt} ELSE NULL END
       RETURNING *`,
      [uuidv4(), empresaId, anio, mes, confirmed]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_checklist_meses', result.rows[0].id, {
      empresaId, anio, mes, tipo, confirmed,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'checklist' });

    const row = result.rows[0];
    res.json({
      id:          row.id,
      empresaId:   row.empresa_id,
      anio:        row.anio,
      mes:         row.mes,
      confirmed:   row[cols.confirmed],
      confirmedAt: row[cols.confirmedAt],
      enviado:     row[cols.enviado],
      enviadoAt:   row[cols.enviadoAt],
    });
  } catch (err) {
    next(err);
  }
};

const updateChecklistEnviado = async (req, res, next) => {
  try {
    const { empresaId, tipo } = req.params;
    const cols = TIPO_COLUMNAS[tipo];
    if (!cols) return res.status(400).json({ error: 'tipo debe ser nomina o contabilidad' });

    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { enviado } = req.body;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    const existing = await db.query(
      `SELECT ${cols.confirmed} FROM fondo_checklist_meses WHERE empresa_id = $1 AND anio = $2 AND mes = $3`,
      [empresaId, anio, mes]
    );
    if (enviado && !existing.rows[0]?.[cols.confirmed]) {
      const label = tipo === 'nomina' ? 'nómina' : 'contabilidad';
      return res.status(409).json({ error: `No se puede marcar como enviada una ${label} que aún no está confirmada` });
    }

    const result = await db.query(
      `UPDATE fondo_checklist_meses
       SET ${cols.enviado} = $1, ${cols.enviadoAt} = CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE empresa_id = $2 AND anio = $3 AND mes = $4
       RETURNING *`,
      [enviado, empresaId, anio, mes]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_checklist_meses', result.rows[0].id, {
      empresaId, anio, mes, tipo, enviado,
    });

    req.io.emit('empresa:updated', { empresaId, anio, mes, tipo: 'checklist' });

    const row = result.rows[0];
    res.json({
      id:          row.id,
      empresaId:   row.empresa_id,
      anio:        row.anio,
      mes:         row.mes,
      confirmed:   row[cols.confirmed],
      confirmedAt: row[cols.confirmedAt],
      enviado:     row[cols.enviado],
      enviadoAt:   row[cols.enviadoAt],
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getChecklistMes,
  getChecklistMesTodasEmpresas,
  updateChecklistItem,
  updateChecklistConfirmado,
  updateChecklistEnviado,
};
