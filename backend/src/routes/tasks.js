const { Router } = require('express');
const { body, query } = require('express-validator');
const {
  getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks,
  addSubtask, updateSubtask, deleteSubtask,
  addComment, updateComment, deleteComment,
} = require('../controllers/taskController');
const { authMiddleware, canEdit, roleMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');

const router = Router();

router.use(authMiddleware);

/**
 * @openapi
 * /api/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Listar tareas con filtros
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: status, in: query, schema: { type: string, enum: [pending, in_progress, completed] } }
 *       - { name: priority, in: query, schema: { type: string, enum: [high, medium, low] } }
 *       - { name: assignedTo, in: query, schema: { type: string } }
 *       - { name: groupId, in: query, schema: { type: string } }
 *       - { name: search, in: query, schema: { type: string } }
 *       - { name: page, in: query, schema: { type: integer, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, default: 50 } }
 *     responses:
 *       200:
 *         description: Lista de tareas paginada
 */
router.get('/', getTasks);

/**
 * @openapi
 * /api/tasks/search:
 *   get:
 *     tags: [Tasks]
 *     summary: Búsqueda full-text en tareas
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: q, in: query, required: true, schema: { type: string } }
 *       - { name: limit, in: query, schema: { type: integer, default: 20 } }
 *     responses:
 *       200:
 *         description: Resultados de búsqueda con ranking
 */
router.get('/search', searchTasks);

/**
 * @openapi
 * /api/tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Obtener tarea por ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string } }
 *     responses:
 *       200:
 *         description: Tarea con subtareas, comentarios y tags
 *       404:
 *         description: Tarea no encontrada
 */
router.get('/:id', getTask);

/**
 * @openapi
 * /api/tasks/{id}/history:
 *   get:
 *     tags: [Tasks]
 *     summary: Historial de cambios de una tarea
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/history', getTaskHistory);

/**
 * @openapi
 * /api/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Crear nueva tarea
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskInput'
 *     responses:
 *       201:
 *         description: Tarea creada
 */
router.post('/',
  canEdit,
  body('title').trim().notEmpty().withMessage('El título es obligatorio').isLength({ max: 255 }),
  body('assignedTo').notEmpty().withMessage('Debes asignar la tarea a alguien'),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('status').optional().isIn(['pending', 'in_progress', 'completed']),
  validate,
  createTask
);

/**
 * @openapi
 * /api/tasks/{id}:
 *   put:
 *     tags: [Tasks]
 *     summary: Actualizar tarea
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id',
  canEdit,
  body('title').optional().trim().notEmpty().isLength({ max: 255 }),
  body('priority').optional().isIn(['high', 'medium', 'low']),
  body('status').optional().isIn(['pending', 'in_progress', 'completed']),
  validate,
  updateTask
);

/**
 * @openapi
 * /api/tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Eliminar tarea
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', roleMiddleware('admin', 'leader'), deleteTask);

// Subtareas
router.post('/:id/subtasks', canEdit, addSubtask);
router.put('/:id/subtasks/:subtaskId', canEdit, updateSubtask);
router.delete('/:id/subtasks/:subtaskId', canEdit, deleteSubtask);

// Comentarios
router.post('/:id/comments', canEdit, addComment);
router.put('/:id/comments/:commentId', canEdit, updateComment);
router.delete('/:id/comments/:commentId', canEdit, deleteComment);

module.exports = router;
