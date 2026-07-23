const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

// El listado no trae `content` — puede pesar bastante en JSONB y la lista
// solo necesita título/fecha para el panel lateral tipo Notion.
function normalizeNoteListItem(n) {
  return {
    id: n.id,
    title: n.title,
    position: n.position,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

function normalizeNote(n) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    position: n.position,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  };
}

const getNotes = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, title, position, created_at, updated_at
       FROM personal_notes
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.user.userId]
    );
    res.json(result.rows.map(normalizeNoteListItem));
  } catch (err) {
    next(err);
  }
};

const getNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM personal_notes WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(normalizeNote(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const createNote = async (req, res, next) => {
  try {
    const { title } = req.body;
    const id = uuidv4();
    await db.query(
      'INSERT INTO personal_notes (id, user_id, title) VALUES ($1, $2, $3)',
      [id, req.user.userId, (title && title.trim()) || '']
    );
    const result = await db.query('SELECT * FROM personal_notes WHERE id = $1', [id]);
    res.status(201).json(normalizeNote(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, content, position } = req.body;

    const fields = [];
    const params = [];
    let i = 1;
    if (title !== undefined) { fields.push(`title = $${i++}`); params.push(title.trim()); }
    if (content !== undefined) { fields.push(`content = $${i++}`); params.push(JSON.stringify(content)); }
    if (position !== undefined) { fields.push(`position = $${i++}`); params.push(position); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id, req.user.userId);
    const result = await db.query(
      `UPDATE personal_notes SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++} RETURNING *`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada' });
    res.json(normalizeNote(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteNote = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM personal_notes WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Nota no encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

module.exports = { getNotes, getNote, createNote, updateNote, deleteNote };
