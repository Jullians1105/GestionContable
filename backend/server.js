const express = require('express');
const path = require('path');
const db = require('../mcpServer/dist/database');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

const statusToES = { pending: 'pendiente', in_progress: 'en_progreso', completed: 'completada' };
const statusToEN = { pendiente: 'pending', en_progreso: 'in_progress', completada: 'completed' };
const priorityToES = { high: 'alta', medium: 'media', low: 'baja' };
const priorityToEN = { alta: 'high', media: 'medium', baja: 'low' };

function toReact(t) {
  let extras = {};
  try { extras = JSON.parse(t.extras || '{}'); } catch {}
  return {
    id: `task_${t.id}`,
    title: t.titulo,
    description: t.descripcion || '',
    status: statusToEN[t.estado] || t.estado,
    priority: priorityToEN[t.prioridad] || t.prioridad,
    assignedTo: t.asignado_a || null,
    dueDate: t.fecha_limite || null,
    createdAt: t.fecha_creacion,
    updatedAt: t.fecha_actualizacion,
    groupId: extras.groupId || null,
    tagIds: extras.tagIds || [],
    subtasks: extras.subtasks || [],
    comments: extras.comments || [],
  };
}

function parseId(reactId) {
  return parseInt(String(reactId).replace('task_', ''));
}

function extrasJson(body) {
  return JSON.stringify({
    groupId: body.groupId || null,
    tagIds: body.tagIds || [],
    subtasks: body.subtasks || [],
    comments: body.comments || [],
  });
}

// GET /api/tasks
app.get('/api/tasks', (req, res) => {
  try {
    let sql = 'SELECT * FROM tareas WHERE 1=1';
    const params = [];
    if (req.query.status) { sql += ' AND estado = ?'; params.push(statusToES[req.query.status] || req.query.status); }
    if (req.query.priority) { sql += ' AND prioridad = ?'; params.push(priorityToES[req.query.priority] || req.query.priority); }
    if (req.query.assignedTo) { sql += ' AND asignado_a = ?'; params.push(req.query.assignedTo); }
    sql += ' ORDER BY fecha_creacion DESC';
    const result = db.query(sql, params.length ? params : undefined);
    res.json(result.rows.map(toReact));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/tasks
app.post('/api/tasks', (req, res) => {
  try {
    const { title, description, priority, assignedTo, dueDate, createdAt, updatedAt } = req.body;
    const now = new Date().toISOString();
    const result = db.run(
      `INSERT INTO tareas (titulo, descripcion, prioridad, asignado_a, fecha_limite, extras, fecha_creacion, fecha_actualizacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description || null, priorityToES[priority] || priority || 'media',
       assignedTo || null, dueDate || null, extrasJson(req.body),
       createdAt || now, updatedAt || now]
    );
    const task = db.query('SELECT * FROM tareas WHERE id = ?', [result.lastInsertRowid]).rows[0];
    res.status(201).json(toReact(task));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/tasks/:id
app.put('/api/tasks/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    const { title, description, status, priority, assignedTo, dueDate, updatedAt } = req.body;
    db.run(
      `UPDATE tareas SET titulo=?, descripcion=?, estado=?, prioridad=?, asignado_a=?, fecha_limite=?, extras=?, fecha_actualizacion=? WHERE id=?`,
      [title, description || null,
       statusToES[status] || status || 'pendiente',
       priorityToES[priority] || priority || 'media',
       assignedTo || null, dueDate || null,
       extrasJson(req.body),
       updatedAt || new Date().toISOString(), id]
    );
    const task = db.query('SELECT * FROM tareas WHERE id = ?', [id]).rows[0];
    res.json(toReact(task));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/tasks/:id
app.delete('/api/tasks/:id', (req, res) => {
  try {
    const id = parseId(req.params.id);
    db.run('DELETE FROM tareas WHERE id = ?', [id]);
    res.json({ success: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/employees
app.get('/api/employees', (req, res) => {
  try {
    const result = db.query('SELECT id, nombre, email FROM empleados WHERE activo = 1');
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
  try {
    const result = db.query(`
      SELECT COUNT(*) as total,
        COUNT(CASE WHEN estado='completada' THEN 1 END) as completadas,
        COUNT(CASE WHEN estado='en_progreso' THEN 1 END) as en_progreso,
        COUNT(CASE WHEN estado='pendiente' THEN 1 END) as pendientes
      FROM tareas
    `);
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Backend corriendo en http://localhost:${PORT}`);
});
