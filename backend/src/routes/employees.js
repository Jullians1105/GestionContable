const { Router } = require('express');
const { body } = require('express-validator');
const db = require('../config/database');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/employees:
 *   get:
 *     tags: [Employees]
 *     summary: Listar todos los usuarios/empleados
 *     security:
 *       - bearerAuth: []
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, permissions, created_at, updated_at FROM users ORDER BY name ASC'
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, permissions, created_at, updated_at FROM users WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * @openapi
 * /api/employees:
 *   post:
 *     tags: [Employees]
 *     summary: Crear nuevo empleado (solo admin)
 *     security:
 *       - bearerAuth: []
 */
router.post('/',
  roleMiddleware('admin'),
  body('email').isEmail().normalizeEmail(),
  body('name').trim().notEmpty(),
  body('role').isIn(['admin', 'leader', 'member', 'viewer']),
  body('password').isLength({ min: 8 }),
  validate,
  async (req, res, next) => {
    try {
      const { email, name, role, password } = req.body;
      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Email ya registrado' });

      const passwordHash = await bcrypt.hash(password, 10);
      const id = uuidv4();
      const result = await db.query(
        'INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, role, created_at',
        [id, email, passwordHash, name, role]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

router.put('/:id',
  roleMiddleware('admin'),
  body('role').optional().isIn(['admin', 'leader', 'member', 'viewer']),
  body('name').optional().trim().notEmpty(),
  body('email').optional().isEmail().normalizeEmail(),
  body('password').optional().isLength({ min: 8 }),
  body('permissions').optional(),
  validate,
  async (req, res, next) => {
    try {
      const { name, role, email, password, permissions } = req.body;

      if (email) {
        const existing = await db.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, req.params.id]
        );
        if (existing.rows[0]) return res.status(409).json({ error: 'El email ya está registrado' });
      }

      let result;
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        result = await db.query(
          `UPDATE users SET
            name = COALESCE($1, name),
            role = COALESCE($2, role),
            email = COALESCE($3, email),
            password_hash = $4,
            permissions = COALESCE($5, permissions),
            updated_at = NOW()
           WHERE id = $6 RETURNING id, email, name, role, permissions, updated_at`,
          [name, role, email, passwordHash, permissions ? JSON.stringify(permissions) : null, req.params.id]
        );
      } else {
        result = await db.query(
          `UPDATE users SET
            name = COALESCE($1, name),
            role = COALESCE($2, role),
            email = COALESCE($3, email),
            permissions = COALESCE($4, permissions),
            updated_at = NOW()
           WHERE id = $5 RETURNING id, email, name, role, permissions, updated_at`,
          [name, role, email, permissions ? JSON.stringify(permissions) : null, req.params.id]
        );
      }

      if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json(result.rows[0]);
    } catch (err) {
      next(err);
    }
  }
);

router.delete('/:id', roleMiddleware('admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.userId) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }
    await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
