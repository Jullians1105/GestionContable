const { Router } = require('express');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/tags:
 *   get:
 *     tags: [Tags]
 *     summary: Listar todos los tags
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query('SELECT * FROM task_tags ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/',
  body('name').trim().notEmpty(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validate,
  async (req, res, next) => {
    try {
      const { name, color = '#6366f1' } = req.body;
      const result = await db.query(
        'INSERT INTO task_tags (id, name, color) VALUES ($1, $2, $3) RETURNING *',
        [uuidv4(), name, color]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) { next(err); }
  }
);

router.put('/:id',
  roleMiddleware('admin', 'leader'),
  body('name').optional().trim().notEmpty(),
  validate,
  async (req, res, next) => {
    try {
      const { name, color } = req.body;
      const result = await db.query(
        'UPDATE task_tags SET name = COALESCE($1, name), color = COALESCE($2, color) WHERE id = $3 RETURNING *',
        [name, color, req.params.id]
      );
      if (!result.rows[0]) return res.status(404).json({ error: 'Tag no encontrado' });
      res.json(result.rows[0]);
    } catch (err) { next(err); }
  }
);

router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    await db.query('DELETE FROM task_tags WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
