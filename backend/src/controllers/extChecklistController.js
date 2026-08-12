const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { isMesHabilitado } = require('../utils/mesVencido');

const getChecklistMes = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const result = await db.query(
      `SELECT p.id, p.name, p.orden, p.activo,
              COALESCE(i.estado, 'pending') AS estado,
              i.nota
       FROM ext_procesos p
       LEFT JOIN ext_checklist_meses m
              ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
       LEFT JOIN ext_checklist_items i
              ON i.mes_id = m.id AND i.proceso_id = p.id
       WHERE p.activo = true OR i.id IS NOT NULL
       ORDER BY p.orden`,
      [empresaId, anio, mes]
    );

    res.json({
      items: result.rows.map(row => ({
        id:     row.id,
        name:   row.name,
        orden:  row.orden,
        activo: row.activo,
        estado: row.estado,
        nota:   row.nota,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// Checklist del mes para TODAS las empresas en una sola consulta — evita el
// N+1 (una petición por empresa) que en Fondo Emprender saturaba el rate
// limiter con varios usuarios abriendo la grilla o recibiendo el refetch por
// socket a la vez (ver fondoChecklistController.getChecklistMesTodasEmpresas).
const getChecklistMesTodasEmpresas = async (req, res, next) => {
  try {
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const result = await db.query(
      `SELECT e.id AS empresa_id,
              p.id, p.name, p.orden, p.activo,
              COALESCE(i.estado, 'pending') AS estado,
              i.nota
       FROM ext_empresas e
       CROSS JOIN ext_procesos p
       LEFT JOIN ext_checklist_meses m
              ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
       LEFT JOIN ext_checklist_items i
              ON i.mes_id = m.id AND i.proceso_id = p.id
       WHERE p.activo = true OR i.id IS NOT NULL
       ORDER BY e.id, p.orden`,
      [anio, mes]
    );

    const porEmpresa = new Map();
    for (const row of result.rows) {
      let entry = porEmpresa.get(row.empresa_id);
      if (!entry) {
        entry = { empresaId: row.empresa_id, items: [] };
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
    // "el frontend envió nota explícitamente" (incluido vaciarla) — ver el
    // mismo comentario en fondoChecklistController.updateChecklistItem.
    const notaProvided = Object.prototype.hasOwnProperty.call(req.body, 'nota');
    let notaToSave = null;
    if (notaProvided) {
      notaToSave = typeof nota === 'string' ? nota.trim() : nota;
      if (notaToSave === '') notaToSave = null;
    }

    // Crear la fila del mes solo si no existe aún. INSERT ... ON CONFLICT DO
    // NOTHING no devuelve fila cuando hay conflicto, por eso el SELECT aparte.
    await db.query(
      `INSERT INTO ext_checklist_meses (id, empresa_id, anio, mes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (empresa_id, anio, mes) DO NOTHING`,
      [uuidv4(), empresaId, anio, mes]
    );
    const mesResult = await db.query(
      'SELECT id FROM ext_checklist_meses WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
      [empresaId, anio, mes]
    );
    const mesId = mesResult.rows[0].id;

    const result = await db.query(
      `INSERT INTO ext_checklist_items (id, mes_id, proceso_id, estado, nota)
       VALUES ($1, $2, $3, COALESCE($4, 'pending'), $5)
       ON CONFLICT (mes_id, proceso_id) DO UPDATE
       SET estado = COALESCE(EXCLUDED.estado, ext_checklist_items.estado),
           nota   = CASE WHEN $6 THEN EXCLUDED.nota ELSE ext_checklist_items.nota END
       RETURNING *`,
      [uuidv4(), mesId, procesoId, estado ?? null, notaToSave, notaProvided]
    );

    await auditLog(req.user.userId, 'UPDATE', 'ext_checklist_items', result.rows[0].id, {
      empresaId, anio, mes, procesoId, estado, nota: notaToSave,
    });

    req.io.emit('externas:updated', { empresaId, anio, mes, tipo: 'checklist' });

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

module.exports = { getChecklistMes, getChecklistMesTodasEmpresas, updateChecklistItem };
