const { Router } = require('express');
const { body } = require('express-validator');
const { getNotes, getNote, createNote, updateNote, deleteNote } = require('../controllers/personalNoteController');
const { authMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');

const router = Router();

// Igual que personal-tasks: espacio 100% personal, cualquier usuario
// autenticado gestiona sus propias notas, sin restricción de rol. El
// controller filtra siempre por user_id = req.user.userId.
router.use(authMiddleware);

router.get('/', getNotes);
router.get('/:id', validateUUIDParam('id'), getNote);

router.post(
  '/',
  [body('title').optional().isString().isLength({ max: 255 }), validate],
  createNote
);

router.put(
  '/:id',
  [
    validateUUIDParam('id'),
    body('title').optional().isString().isLength({ max: 255 }),
    body('content').optional().isArray(),
    validate,
  ],
  updateNote
);

router.delete('/:id', validateUUIDParam('id'), deleteNote);

module.exports = router;
