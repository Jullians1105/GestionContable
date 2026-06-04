const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');

const getGroups = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT g.*,
        u.name AS leader_name,
        (SELECT json_agg(json_build_object('id', u2.id, 'name', u2.name, 'role', u2.role, 'joined_at', gm.joined_at))
         FROM group_members gm JOIN users u2 ON u2.id = gm.user_id WHERE gm.group_id = g.id) AS members
       FROM groups g
       LEFT JOIN users u ON u.id = g.leader_id
       ORDER BY g.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
};

const createGroup = async (req, res, next) => {
  try {
    const { name, description, color, memberIds = [] } = req.body;
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO groups (id, leader_id, name, description, color) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [id, req.user.userId, name, description || null, color || '#004ac6']
    );
    const group = result.rows[0];

    await db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [id, req.user.userId]);
    await Promise.all(
      memberIds.filter(mid => mid !== req.user.userId).map(mid =>
        db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [id, mid])
      )
    );

    req.io?.emit('group:created', group);
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
};

const updateGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const result = await db.query(
      `UPDATE groups SET
        name = COALESCE($1, name),
        description = COALESCE($2, description),
        color = COALESCE($3, color),
        updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [name, description, color, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Grupo no encontrado' });

    req.io?.emit('group:updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

const deleteGroup = async (req, res, next) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM groups WHERE id = $1', [id]);
    req.io?.emit('group:deleted', { id });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
};

const addMember = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    await db.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [id, userId]
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const removeMember = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    await db.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [id, userId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { getGroups, createGroup, updateGroup, deleteGroup, addMember, removeMember };
