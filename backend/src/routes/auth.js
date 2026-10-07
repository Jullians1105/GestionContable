const { Router } = require('express');
const { body } = require('express-validator');
const { login, refresh, logout, me, updateMe } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { passwordRules } = require('../middleware/security');

const router = Router();

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Iniciar sesión
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login exitoso, retorna token JWT
 *       401:
 *         description: Credenciales inválidas
 */
router.post('/login',
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
  validate,
  login
);

/**
 * @openapi
 * /api/auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Renovar access token usando refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: Nuevo token generado
 */
router.post('/refresh', body('refreshToken').notEmpty(), validate, refresh);

/**
 * @openapi
 * /api/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión (invalida el token)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada
 */
router.post('/logout', authMiddleware, logout);

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario actual
 */
router.get('/me', authMiddleware, me);

/**
 * @openapi
 * /api/auth/me:
 *   put:
 *     tags: [Auth]
 *     summary: Actualizar el perfil del usuario autenticado
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string, format: email }
 *               currentPassword: { type: string }
 *               newPassword: { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Perfil actualizado
 *       400:
 *         description: Datos inválidos o falta la contraseña actual
 *       401:
 *         description: Contraseña actual incorrecta
 *       409:
 *         description: Email ya registrado
 */
router.put('/me',
  authMiddleware,
  body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
  body('email').optional().isEmail().normalizeEmail(),
  body('currentPassword').optional().notEmpty(),
  passwordRules('newPassword').optional(),
  validate,
  updateMe
);

module.exports = router;
