const { Router } = require('express');
const { body, query } = require('express-validator');
const {
  getTasks, getTask, createTask, updateTask, deleteTask, getTaskHistory, searchTasks,
  getTemplates, updateMyAssigneeStatus,
  createDeleteRequest, respondDeleteRequest,
  addSubtask, updateSubtask, deleteSubtask,
  addComment, updateComment, deleteComment,
} = require('../controllers/taskController');
const { authMiddleware, canEdit, roleMiddleware } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateUUIDParam, sanitizePagination } = require('../middleware/security');

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
router.get('/', sanitizePagination, getTasks);

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
router.get('/templates', roleMiddleware('admin', 'leader'), getTemplates);

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
router.get('/:id', validateUUIDParam('id'), getTask);

/**
 * @openapi
 * /api/tasks/{id}/history:
 *   get:
 *     tags: [Tasks]
 *     summary: Historial de cambios de una tarea
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id/history', validateUUIDParam('id'), getTaskHistory);

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
  body('assignedTo').optional().custom((val) => {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const arr = Array.isArray(val) ? val : (val ? [val] : []);
    if (!arr.every(id => uuidRe.test(id))) throw new Error('assignedTo debe contener UUIDs válidos');
    return true;
  }),
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
  validateUUIDParam('id'),
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
router.delete('/:id', validateUUIDParam('id'), roleMiddleware('admin', 'leader'), deleteTask);

/**
 * @openapi
 * /api/tasks/{id}/delete-request:
 *   post:
 *     tags: [Tasks]
 *     summary: Solicitar la eliminación de una tarea (con motivo) — para quien no puede borrarla directamente
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/delete-request',
  validateUUIDParam('id'),
  canEdit,
  body('reason').trim().notEmpty(),
  validate,
  createDeleteRequest
);

/**
 * @openapi
 * /api/tasks/{id}/delete-request/{requestId}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Aprobar o rechazar una solicitud de eliminación (admin o líder del grupo de la tarea)
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/delete-request/:requestId',
  validateUUIDParam('id'),
  validateUUIDParam('requestId'),
  roleMiddleware('admin', 'leader'),
  body('action').isIn(['approve', 'reject']),
  validate,
  respondDeleteRequest
);

/**
 * @openapi
 * /api/tasks/{id}/assignees/me:
 *   patch:
 *     tags: [Tasks]
 *     summary: Marcar mi propio estado como asignado de la tarea (tasks.status se recalcula como agregado)
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/assignees/me',
  validateUUIDParam('id'),
  canEdit,
  body('status').isIn(['pending', 'in_progress', 'completed']),
  validate,
  updateMyAssigneeStatus
);

// Subtareas
router.post('/:id/subtasks', validateUUIDParam('id'), canEdit, addSubtask);
router.put('/:id/subtasks/:subtaskId', validateUUIDParam('id'), validateUUIDParam('subtaskId'), canEdit, updateSubtask);
router.delete('/:id/subtasks/:subtaskId', validateUUIDParam('id'), validateUUIDParam('subtaskId'), canEdit, deleteSubtask);

// Comentarios
router.post('/:id/comments', validateUUIDParam('id'), canEdit, addComment);
router.put('/:id/comments/:commentId', validateUUIDParam('id'), validateUUIDParam('commentId'), canEdit, updateComment);
router.delete('/:id/comments/:commentId', validateUUIDParam('id'), validateUUIDParam('commentId'), canEdit, deleteComment);

module.exports = router;
