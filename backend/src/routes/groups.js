const { Router } = require('express');
const { body } = require('express-validator');
const { getGroups, createGroup, updateGroup, deleteGroup, addMember, removeMember, setMemberLeader } = require('../controllers/groupController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { requireGroupLeader } = require('../middleware/groupAccess');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');

const router = Router();
router.use(authMiddleware);

/**
 * @openapi
 * /api/groups:
 *   get:
 *     tags: [Groups]
 *     summary: Listar todos los grupos con sus miembros
 *     security:
 *       - bearerAuth: []
 */
router.get('/', getGroups);

router.post('/',
  roleMiddleware('admin', 'leader'),
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio'),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/),
  validate,
  createGroup
);

router.put('/:id',
  validateUUIDParam('id'),
  requireGroupLeader,
  body('name').optional().trim().notEmpty(),
  validate,
  updateGroup
);

router.delete('/:id', validateUUIDParam('id'), requireGroupLeader, deleteGroup);

router.post('/:id/members',
  validateUUIDParam('id'),
  requireGroupLeader,
  body('userId').notEmpty(),
  validate,
  addMember
);

router.delete('/:id/members/:userId',
  validateUUIDParam('id'),
  validateUUIDParam('userId'),
  requireGroupLeader,
  removeMember
);

/**
 * @openapi
 * /api/groups/{id}/members/{userId}/leader:
 *   put:
 *     tags: [Groups]
 *     summary: Asignar o quitar el liderazgo de un grupo a una persona (solo admin)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { name: id, in: path, required: true, schema: { type: string, format: uuid } }
 *       - { name: userId, in: path, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isLeader]
 *             properties:
 *               isLeader: { type: boolean }
 */
router.put('/:id/members/:userId/leader',
  validateUUIDParam('id'),
  validateUUIDParam('userId'),
  roleMiddleware('admin'),
  body('isLeader').isBoolean(),
  validate,
  setMemberLeader
);

module.exports = router;
