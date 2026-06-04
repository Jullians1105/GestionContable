const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sign, signRefresh, verify, verifyRefresh } = require('../utils/jwt');
const logger = require('../utils/logger');

const register = async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'El email ya está registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();

    const result = await db.query(
      `INSERT INTO users (id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'member')
       RETURNING id, email, name, role, created_at`,
      [id, email.toLowerCase(), passwordHash, name]
    );
    const user = result.rows[0];

    const token = sign({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefresh({ userId: user.id });

    await db.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [refreshToken, user.id]
    );

    logger.info({ userId: user.id }, 'User registered');
    res.status(201).json({ token, refreshToken, user });
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const result = await db.query(
      'SELECT id, email, name, role, password_hash, permissions FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    const token = sign({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefresh({ userId: user.id });

    await db.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [refreshToken, user.id]
    );

    const { password_hash, ...safeUser } = user;
    logger.info({ userId: user.id }, 'User logged in');
    res.json({ token, refreshToken, user: safeUser });
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'refreshToken requerido' });

    const stored = await db.query(
      'SELECT user_id FROM refresh_tokens WHERE token = $1 AND expires_at > NOW() AND revoked = false',
      [refreshToken]
    );
    if (stored.rows.length === 0) {
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });
    }

    const decoded = verifyRefresh(refreshToken);
    const userResult = await db.query(
      'SELECT id, email, name, role FROM users WHERE id = $1',
      [decoded.userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    await db.query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [refreshToken]);

    const newToken = sign({ userId: user.id, email: user.email, role: user.role });
    const newRefreshToken = signRefresh({ userId: user.id });

    await db.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\')',
      [newRefreshToken, user.id]
    );

    res.json({ token: newToken, refreshToken: newRefreshToken });
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    await db.query(
      'INSERT INTO token_blacklist (token, expires_at) VALUES ($1, NOW() + INTERVAL \'2 hours\')',
      [req.token]
    );
    if (refreshToken) {
      await db.query('UPDATE refresh_tokens SET revoked = true WHERE token = $1', [refreshToken]);
    }

    logger.info({ userId: req.user.userId }, 'User logged out');
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, role, permissions, created_at, updated_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me };
