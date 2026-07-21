const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const ITEMS_SUBQUERY = `
  (SELECT json_agg(json_build_object(
     'id', i.id, 'title', i.title, 'completed', i.completed,
     'position', i.position, 'createdAt', i.created_at
   ) ORDER BY i.position, i.created_at)
   FROM personal_task_items i WHERE i.personal_task_id = pt.id) AS items
`;

function normalizePersonalTask(t) {
  return {
    id: t.id,
    title: t.title,
    completed: t.completed,
    position: t.position,
    dueDate: t.due_date ? t.due_date.toISOString().slice(0, 10) : null,
    items: (t.items || []).map(i => ({
      id: i.id,
      title: i.title,
      completed: i.completed,
      position: i.position,
      createdAt: i.createdAt,
    })),
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

const getPersonalTasks = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY}
       FROM personal_tasks pt
       WHERE pt.user_id = $1
       ORDER BY pt.position, pt.created_at`,
      [req.user.userId]
    );
    res.json(result.rows.map(normalizePersonalTask));
  } catch (err) {
    next(err);
  }
};

const createPersonalTask = async (req, res, next) => {
  try {
    const { title, dueDate } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

    const id = uuidv4();
    await db.query(
      'INSERT INTO personal_tasks (id, user_id, title, due_date) VALUES ($1, $2, $3, $4)',
      [id, req.user.userId, title.trim(), dueDate || null]
    );

    const result = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY} FROM personal_tasks pt WHERE pt.id = $1`,
      [id]
    );
    res.status(201).json(normalizePersonalTask(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updatePersonalTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, completed, dueDate, position } = req.body;

    const fields = [];
    const params = [];
    let i = 1;
    if (title !== undefined) { fields.push(`title = $${i++}`); params.push(title.trim()); }
    if (completed !== undefined) { fields.push(`completed = $${i++}`); params.push(completed); }
    if (dueDate !== undefined) { fields.push(`due_date = $${i++}`); params.push(dueDate || null); }
    if (position !== undefined) { fields.push(`position = $${i++}`); params.push(position); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id, req.user.userId);
    const result = await db.query(
      `UPDATE personal_tasks SET ${fields.join(', ')} WHERE id = $${i++} AND user_id = $${i++}`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Tarea no encontrada' });

    const full = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY} FROM personal_tasks pt WHERE pt.id = $1`,
      [id]
    );
    res.json(normalizePersonalTask(full.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deletePersonalTask = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM personal_tasks WHERE id = $1 AND user_id = $2',
      [id, req.user.userId]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

// ── Items del checklist ─────────────────────────────────────────────────────

// Verifica que la tarea personal exista y sea del usuario autenticado antes
// de tocar sus items — evita que alguien manipule items de otro usuario
// adivinando un personal_task_id ajeno.
const assertOwnsTask = async (taskId, userId) => {
  const result = await db.query(
    'SELECT id FROM personal_tasks WHERE id = $1 AND user_id = $2',
    [taskId, userId]
  );
  return result.rowCount > 0;
};

const addItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'El título es obligatorio' });

    if (!(await assertOwnsTask(id, req.user.userId))) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    await db.query(
      'INSERT INTO personal_task_items (id, personal_task_id, title) VALUES ($1, $2, $3)',
      [uuidv4(), id, title.trim()]
    );

    const full = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY} FROM personal_tasks pt WHERE pt.id = $1`,
      [id]
    );
    res.status(201).json(normalizePersonalTask(full.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const { title, completed } = req.body;

    if (!(await assertOwnsTask(id, req.user.userId))) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const fields = [];
    const params = [];
    let i = 1;
    if (title !== undefined) { fields.push(`title = $${i++}`); params.push(title.trim()); }
    if (completed !== undefined) { fields.push(`completed = $${i++}`); params.push(completed); }
    if (!fields.length) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(itemId, id);
    const result = await db.query(
      `UPDATE personal_task_items SET ${fields.join(', ')} WHERE id = $${i++} AND personal_task_id = $${i++}`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Item no encontrado' });

    const full = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY} FROM personal_tasks pt WHERE pt.id = $1`,
      [id]
    );
    res.json(normalizePersonalTask(full.rows[0]));
  } catch (err) {
    next(err);
  }
};

const deleteItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;

    if (!(await assertOwnsTask(id, req.user.userId))) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }

    const result = await db.query(
      'DELETE FROM personal_task_items WHERE id = $1 AND personal_task_id = $2',
      [itemId, id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Item no encontrado' });

    const full = await db.query(
      `SELECT pt.*, ${ITEMS_SUBQUERY} FROM personal_tasks pt WHERE pt.id = $1`,
      [id]
    );
    res.json(normalizePersonalTask(full.rows[0]));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPersonalTasks,
  createPersonalTask,
  updatePersonalTask,
  deletePersonalTask,
  addItem,
  updateItem,
  deleteItem,
};
