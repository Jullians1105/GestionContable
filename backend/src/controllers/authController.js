const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { sign, signRefresh, verify, verifyRefresh } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/email');
const logger = require('../utils/logger');
const env = require('../config/env');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

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
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\') ON CONFLICT (token) DO NOTHING',
      [refreshToken, user.id]
    );

    logger.info({ userId: user.id }, 'User registered');
    res.status(201).json({ token, refreshToken, user });
  } catch (err) {
    next(err);
  }
};

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const LOCKOUT_MAX_ATTEMPTS = 5;

const recordLoginAttempt = async (email, ip, success) => {
  try {
    await db.query(
      'INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)',
      [email.toLowerCase(), ip || null, success]
    );
  } catch {
    // Non-fatal — never let audit failure block login
  }
};

const isLockedOut = async (email, ip) => {
  const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS).toISOString();

  // Check by email
  const byEmail = await db.query(
    'SELECT COUNT(*) FROM login_attempts WHERE email = $1 AND success = false AND created_at > $2',
    [email.toLowerCase(), windowStart]
  );
  if (parseInt(byEmail.rows[0].count) >= LOCKOUT_MAX_ATTEMPTS) return true;

  // Check by IP (protect against credential stuffing from same source)
  if (ip) {
    const byIp = await db.query(
      'SELECT COUNT(*) FROM login_attempts WHERE ip_address = $1 AND success = false AND created_at > $2',
      [ip, windowStart]
    );
    if (parseInt(byIp.rows[0].count) >= LOCKOUT_MAX_ATTEMPTS * 3) return true;
  }

  return false;
};

const login = async (req, res, next) => {
  const ip = req.ip || req.connection?.remoteAddress;
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase();

    // A07: Brute-force lockout check before any DB user lookup
    if (await isLockedOut(normalizedEmail, ip)) {
      logger.warn({ email: normalizedEmail, ip }, 'Login blocked — too many failed attempts');
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Intenta de nuevo en 15 minutos.' });
    }

    const result = await db.query(
      'SELECT id, email, name, role, password_hash, permissions, is_active FROM users WHERE email = $1',
      [normalizedEmail]
    );
    const user = result.rows[0];

    if (!user) {
      await recordLoginAttempt(normalizedEmail, ip, false);
      logger.warn({ email: normalizedEmail, ip }, 'Login failed — user not found');
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    if (!user.is_active) {
      logger.warn({ userId: user.id, ip }, 'Login blocked — account inactive');
      return res.status(403).json({ error: 'Cuenta desactivada. Contacta al administrador.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordLoginAttempt(normalizedEmail, ip, false);
      logger.warn({ userId: user.id, ip }, 'Login failed — wrong password');
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });
    }

    await recordLoginAttempt(normalizedEmail, ip, true);

    const token = sign({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = signRefresh({ userId: user.id });

    await db.query(
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\') ON CONFLICT (token) DO NOTHING',
      [refreshToken, user.id]
    );

    const { password_hash, is_active, ...safeUser } = user;
    logger.info({ userId: user.id, ip }, 'User logged in');
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
      'INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'7 days\') ON CONFLICT (token) DO NOTHING',
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

const updateMe = async (req, res, next) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const result = await db.query('SELECT id, email, password_hash FROM users WHERE id = $1', [userId]);
    const current = result.rows[0];
    if (!current) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (email && email.toLowerCase() !== current.email) {
      const existing = await db.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.toLowerCase(), userId]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'El email ya está registrado' });
      }
    }

    let passwordHash;
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ error: 'Debes indicar tu contraseña actual' });
      }
      const valid = await bcrypt.compare(currentPassword, current.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'La contraseña actual es incorrecta' });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    const updated = await db.query(
      `UPDATE users SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        password_hash = COALESCE($3, password_hash),
        updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, role, permissions, created_at, updated_at`,
      [name?.trim() || null, email?.toLowerCase() || null, passwordHash || null, userId]
    );

    logger.info({ userId }, 'Usuario actualizó su perfil');
    res.json({ user: updated.rows[0] });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const result = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];

    // Respuesta genérica siempre, para no revelar si el email existe
    let devToken;
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);

      await db.query(
        'INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'30 minutes\')',
        [tokenHash, user.id]
      );

      await sendPasswordResetEmail(email.toLowerCase(), rawToken);
      logger.info({ userId: user.id }, 'Password reset solicitado');

      // En desarrollo devolvemos el token directamente para no depender del cliente de email
      if (env.SHOW_RESET_TOKEN) devToken = rawToken;
    }

    res.json({ message: 'Si el email existe, se enviaron instrucciones para restablecer la contraseña', ...(devToken ? { devToken } : {}) });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    const tokenHash = hashToken(token);

    const result = await db.query(
      'SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used = false AND expires_at > NOW()',
      [tokenHash]
    );
    const tokenRow = result.rows[0];
    if (!tokenRow) {
      return res.status(400).json({ error: 'Token inválido o expirado' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, tokenRow.user_id]);
    await db.query('UPDATE password_reset_tokens SET used = true WHERE token_hash = $1', [tokenHash]);
    await db.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [tokenRow.user_id]);

    logger.info({ userId: tokenRow.user_id }, 'Password reseteada');
    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, refresh, logout, me, updateMe, forgotPassword, resetPassword };
