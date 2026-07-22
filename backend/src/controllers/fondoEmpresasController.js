const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizeEmpresa = (row) => ({
  id:               row.id,
  name:             row.name,
  categoria:        row.categoria,
  monthlyFee:       row.monthly_fee !== null && row.monthly_fee !== undefined
                      ? parseFloat(row.monthly_fee)
                      : null,
  macrosDone:       row.macros_done       ?? 0,
  macrosInProgress: row.macros_in_progress ?? 0,
  confirmed:        row.confirmed         ?? false,
  createdAt:        row.created_at,
  updatedAt:        row.updated_at,
});

const getEmpresas = async (req, res, next) => {
  try {
    const { categoria } = req.query;
    const now  = new Date();
    const anio = req.query.anio ? parseInt(req.query.anio, 10) : now.getFullYear();
    const mes  = req.query.mes  ? parseInt(req.query.mes,  10) : now.getMonth() + 1;

    const params = [anio, mes];
    let where = '';
    if (categoria) {
      where = 'WHERE e.categoria = $3';
      params.push(categoria);
    }
    const result = await db.query(
      `SELECT e.*,
              COALESCE((
                SELECT COUNT(*)::int FROM fondo_detalle_macroprocesos d
                WHERE d.empresa_id = e.id AND d.estado = 'done'
                  AND d.anio = $1 AND d.mes = $2
                  AND d.macroproceso_id NOT IN ('mp2', 'mp3', 'mp4', 'mp6')
              ), 0)
              +
              -- mp2/Nómina y mp5/Contabilidad tampoco viven en
              -- fondo_detalle_macroprocesos — se derivan del agregado de TODOS
              -- los procesos de su grupo (NOMINA/CONTABILIDAD) en el checklist
              -- mensual, misma lógica que deriveGrupoEstado en
              -- fondoDetalleController.js: 'na' en todos cuenta como done, si
              -- falta alguno pero ya hay avance queda in_progress.
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM fondo_procesos p
                JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp2'
                LEFT JOIN fondo_checklist_meses m
                       ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                LEFT JOIN fondo_checklist_items i
                       ON i.mes_id = m.id AND i.proceso_id = p.id
                WHERE p.activo = true AND COALESCE(i.estado, 'pending') NOT IN ('done', 'na')
              ) THEN 1 ELSE 0 END
              +
              CASE WHEN NOT EXISTS (
                SELECT 1 FROM fondo_procesos p
                JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp5'
                LEFT JOIN fondo_checklist_meses m
                       ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                LEFT JOIN fondo_checklist_items i
                       ON i.mes_id = m.id AND i.proceso_id = p.id
                WHERE p.activo = true AND COALESCE(i.estado, 'pending') NOT IN ('done', 'na')
              ) THEN 1 ELSE 0 END
              +
              -- mp3/Nómina electrónica tampoco vive en fondo_detalle_macroprocesos —
              -- se deriva del ítem "nomina electronica" del checklist mensual, misma
              -- lógica que deriveNominaElectronicaEstado en fondoDetalleController.js:
              -- 'na' cuenta como done (ya se revisó, no quedó pendiente).
              CASE WHEN (
                SELECT COALESCE(i.estado, 'pending')
                FROM fondo_procesos p
                LEFT JOIN fondo_checklist_meses m
                       ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                LEFT JOIN fondo_checklist_items i
                       ON i.mes_id = m.id AND i.proceso_id = p.id
                WHERE p.macroproceso_id = 'mp3'
                LIMIT 1
              ) IN ('done', 'na') THEN 1 ELSE 0 END
              +
              -- mp6/Información tributaria no vive en fondo_detalle_macroprocesos —
              -- se deriva de fondo_impuestos_items, misma lógica que
              -- deriveImpuestosEstado en fondoDetalleController.js: cuenta como
              -- done si ningún ítem quedó en 'pending' (los 4 en 'na' también
              -- cuentan como done — ya se revisó y no había nada que presentar).
              CASE WHEN COALESCE((
                SELECT
                  CASE
                    WHEN COUNT(*) FILTER (WHERE COALESCE(fi.estado, 'pending') NOT IN ('na', 'presented')) > 0 THEN false
                    ELSE true
                  END
                FROM fondo_impuestos i
                LEFT JOIN fondo_impuestos_items fi
                       ON fi.impuesto_id = i.id
                      AND fi.empresa_id  = e.id
                      AND fi.anio        = $1
                      AND fi.mes         = $2
              ), false) THEN 1 ELSE 0 END
              +
              -- mp4/Documentos contador - Pagos tampoco vive en
              -- fondo_detalle_macroprocesos — se deriva de fondo_pagos, misma
              -- lógica que derivePagoMacroEstado en fondoDetalleController.js:
              -- 'enviado' o 'aprobado' cuentan como done (mp4 rastrea el envío,
              -- no la aprobación final de la fiduciaria).
              CASE WHEN (
                SELECT estado FROM fondo_pagos
                WHERE empresa_id = e.id AND anio = $1 AND mes = $2
                LIMIT 1
              ) IN ('enviado', 'aprobado') THEN 1 ELSE 0 END
              AS macros_done,
              COALESCE((
                SELECT COUNT(*)::int FROM fondo_detalle_macroprocesos d
                WHERE d.empresa_id = e.id AND d.estado = 'in_progress'
                  AND d.anio = $1 AND d.mes = $2
                  AND d.macroproceso_id NOT IN ('mp2', 'mp3', 'mp4')
              ), 0)
              +
              -- mp2/Nómina: in_progress si hay algo de avance pero no está
              -- 100% resuelto (si estuviera 100% resuelto ya sumó en el done
              -- de arriba, así que las dos CASE nunca se prenden a la vez).
              CASE WHEN
                EXISTS (
                  SELECT 1 FROM fondo_procesos p
                  JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp2'
                  LEFT JOIN fondo_checklist_meses m
                         ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                  LEFT JOIN fondo_checklist_items i
                         ON i.mes_id = m.id AND i.proceso_id = p.id
                  WHERE p.activo = true AND COALESCE(i.estado, 'pending') IN ('done', 'in_progress')
                )
                AND EXISTS (
                  SELECT 1 FROM fondo_procesos p
                  JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp2'
                  LEFT JOIN fondo_checklist_meses m
                         ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                  LEFT JOIN fondo_checklist_items i
                         ON i.mes_id = m.id AND i.proceso_id = p.id
                  WHERE p.activo = true AND COALESCE(i.estado, 'pending') NOT IN ('done', 'na')
                )
              THEN 1 ELSE 0 END
              +
              -- mp5/Contabilidad: mismo criterio que mp2, sobre el grupo CONTABILIDAD.
              CASE WHEN
                EXISTS (
                  SELECT 1 FROM fondo_procesos p
                  JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp5'
                  LEFT JOIN fondo_checklist_meses m
                         ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                  LEFT JOIN fondo_checklist_items i
                         ON i.mes_id = m.id AND i.proceso_id = p.id
                  WHERE p.activo = true AND COALESCE(i.estado, 'pending') IN ('done', 'in_progress')
                )
                AND EXISTS (
                  SELECT 1 FROM fondo_procesos p
                  JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp5'
                  LEFT JOIN fondo_checklist_meses m
                         ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                  LEFT JOIN fondo_checklist_items i
                         ON i.mes_id = m.id AND i.proceso_id = p.id
                  WHERE p.activo = true AND COALESCE(i.estado, 'pending') NOT IN ('done', 'na')
                )
              THEN 1 ELSE 0 END
              +
              CASE WHEN (
                SELECT COALESCE(i.estado, 'pending')
                FROM fondo_procesos p
                LEFT JOIN fondo_checklist_meses m
                       ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
                LEFT JOIN fondo_checklist_items i
                       ON i.mes_id = m.id AND i.proceso_id = p.id
                WHERE p.macroproceso_id = 'mp3'
                LIMIT 1
              ) = 'in_progress' THEN 1 ELSE 0 END
              +
              CASE WHEN (
                SELECT estado FROM fondo_pagos
                WHERE empresa_id = e.id AND anio = $1 AND mes = $2
                LIMIT 1
              ) = 'rechazado' THEN 1 ELSE 0 END
              AS macros_in_progress,
              COALESCE((
                SELECT m.confirmed_contabilidad FROM fondo_checklist_meses m
                WHERE m.empresa_id = e.id
                  AND m.anio = $1
                  AND m.mes  = $2
                LIMIT 1
              ), false) AS confirmed
       FROM fondo_empresas e
       ${where}
       ORDER BY e.name ASC`,
      params
    );
    res.json(result.rows.map(normalizeEmpresa));
  } catch (err) {
    next(err);
  }
};

const getEmpresa = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM fondo_empresas WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const createEmpresa = async (req, res, next) => {
  try {
    const { name, categoria = 'contable', monthlyFee = null } = req.body;
    const id = uuidv4();
    const result = await db.query(
      `INSERT INTO fondo_empresas (id, name, categoria, monthly_fee)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, name.trim().toUpperCase(), categoria, monthlyFee]
    );
    await auditLog(req.user.userId, 'CREATE', 'fondo_empresas', id, { name, categoria, monthlyFee });
    req.io.emit('empresa:updated', { empresaId: id, tipo: 'empresa' });
    res.status(201).json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT * FROM fondo_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    const { name, categoria, monthlyFee } = req.body;
    const result = await db.query(
      `UPDATE fondo_empresas SET
        name        = COALESCE($1, name),
        categoria   = COALESCE($2, categoria),
        monthly_fee = COALESCE($3, monthly_fee)
       WHERE id = $4
       RETURNING *`,
      [
        name !== undefined ? name.trim().toUpperCase() : null,
        categoria ?? null,
        monthlyFee !== undefined ? monthlyFee : null,
        id,
      ]
    );
    await auditLog(req.user.userId, 'UPDATE', 'fondo_empresas', id, { name, categoria, monthlyFee });
    req.io.emit('empresa:updated', { empresaId: id, tipo: 'empresa' });
    res.json(normalizeEmpresa(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteEmpresa = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await db.query('SELECT id FROM fondo_empresas WHERE id = $1', [id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Empresa no encontrada' });

    await db.query('DELETE FROM fondo_empresas WHERE id = $1', [id]);
    await auditLog(req.user.userId, 'DELETE', 'fondo_empresas', id, {});
    req.io.emit('empresa:updated', { empresaId: id, tipo: 'empresa' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { getEmpresas, getEmpresa, createEmpresa, updateEmpresa, deleteEmpresa };
