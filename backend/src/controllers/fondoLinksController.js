const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const MACRO_NAMES = {
  mp1: 'Facturación',
  mp2: 'Nómina',
  mp3: 'Nómina electrónica',
  mp4: 'Documentos contador - Pagos',
  mp6: 'Información tributaria',
  mp7: 'Producción y ventas',
};

const normalizeLink = (row) => {
  if (!row) return null;
  return {
    id:         row.id,
    taskId:     row.task_id,
    empresaId:  row.empresa_id,
    empresaNombre: row.empresa_nombre ?? null,
    linkType:   row.link_type,
    macroId:    row.macro_id ?? null,
    macroNombre: row.macro_id ? (MACRO_NAMES[row.macro_id] ?? row.macro_id) : null,
    procesoId:  row.proceso_id ?? null,
    procesoNombre: row.proceso_nombre ?? null,
    anio:       row.anio ?? null,
    mes:        row.mes ?? null,
    createdAt:  row.created_at,
    updatedAt:  row.updated_at,
  };
};

const getLink = async (req, res, next) => {
  try {
    const { id: taskId } = req.params;
    const result = await db.query(
      `SELECT l.*, e.name AS empresa_nombre, p.name AS proceso_nombre
       FROM task_fondo_links l
       JOIN fondo_empresas e ON e.id = l.empresa_id
       LEFT JOIN fondo_procesos p ON p.id = l.proceso_id
       WHERE l.task_id = $1`,
      [taskId]
    );
    if (result.rows.length === 0) return res.json(null);
    res.json(normalizeLink(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const upsertLink = async (req, res, next) => {
  try {
    const { id: taskId } = req.params;
    const { empresaId, linkType, macroId, procesoId, anio, mes } = req.body;

    // Verify task exists
    const taskCheck = await db.query('SELECT id FROM tasks WHERE id = $1', [taskId]);
    if (!taskCheck.rows[0]) return res.status(404).json({ error: 'Tarea no encontrada' });

    const result = await db.query(
      `INSERT INTO task_fondo_links (id, task_id, empresa_id, link_type, macro_id, proceso_id, anio, mes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (task_id) DO UPDATE SET
         empresa_id = EXCLUDED.empresa_id,
         link_type  = EXCLUDED.link_type,
         macro_id   = EXCLUDED.macro_id,
         proceso_id = EXCLUDED.proceso_id,
         anio       = EXCLUDED.anio,
         mes        = EXCLUDED.mes,
         updated_at = NOW()
       RETURNING *`,
      [uuidv4(), taskId, empresaId, linkType, macroId ?? null, procesoId ?? null, anio ?? null, mes ?? null]
    );

    const enriched = await db.query(
      `SELECT l.*, e.name AS empresa_nombre, p.name AS proceso_nombre
       FROM task_fondo_links l
       JOIN fondo_empresas e ON e.id = l.empresa_id
       LEFT JOIN fondo_procesos p ON p.id = l.proceso_id
       WHERE l.id = $1`,
      [result.rows[0].id]
    );

    const io = req.app.get('io')
    if (io) io.emit('task:updated', { id: taskId, hasFondoLink: true })

    res.json(normalizeLink(enriched.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteLink = async (req, res, next) => {
  try {
    const { id: taskId } = req.params;
    const result = await db.query('DELETE FROM task_fondo_links WHERE task_id = $1 RETURNING id', [taskId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Sin vínculo' });

    const io = req.app.get('io')
    if (io) io.emit('task:updated', { id: taskId, hasFondoLink: false })

    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

module.exports = { getLink, upsertLink, deleteLink, MACRO_NAMES };
