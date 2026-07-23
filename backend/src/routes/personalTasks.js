const { Router } = require('express');
const { body } = require('express-validator');
const { validate } = require('../middleware/validation');
const {
  getPersonalTasks, createPersonalTask, updatePersonalTask, deletePersonalTask,
  addItem, updateItem, deleteItem,
} = require('../controllers/personalTaskController');
const { authMiddleware } = require('../middleware/auth');
const { validateUUIDParam } = require('../middleware/security');

const router = Router();

// Sin roleMiddleware/canEdit a propósito: es un espacio 100% personal, todo
// usuario autenticado (incluido viewer) gestiona sus propias tareas. El
// controller filtra siempre por user_id = req.user.userId.
router.use(authMiddleware);

/**
 * @openapi
 * /api/personal-tasks:
 *   get:
 *     tags: [PersonalTasks]
 *     summary: Listar mis tareas pendientes personales
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: OK }
 */
router.get('/', getPersonalTasks);

router.post(
  '/',
  [
    body('title').trim().notEmpty().withMessage('El título es obligatorio'),
    body('reminderAt').optional({ nullable: true }).isISO8601().withMessage('Fecha de recordatorio inválida'),
    validate,
  ],
  createPersonalTask
);

router.put(
  '/:id',
  [
    validateUUIDParam('id'),
    body('reminderAt').optional({ nullable: true }).isISO8601().withMessage('Fecha de recordatorio inválida'),
    validate,
  ],
  updatePersonalTask
);
router.delete('/:id', validateUUIDParam('id'), deletePersonalTask);

router.post(
  '/:id/items',
  [validateUUIDParam('id'), body('title').trim().notEmpty().withMessage('El título es obligatorio'), validate],
  addItem
);
router.put(
  '/:id/items/:itemId',
  [validateUUIDParam('id'), validateUUIDParam('itemId')],
  updateItem
);
router.delete(
  '/:id/items/:itemId',
  [validateUUIDParam('id'), validateUUIDParam('itemId')],
  deleteItem
);

module.exports = router;
