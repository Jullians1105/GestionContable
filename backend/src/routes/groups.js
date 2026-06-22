const { Router } = require('express');
const { body } = require('express-validator');
const { getGroups, createGroup, updateGroup, deleteGroup, addMember, removeMember } = require('../controllers/groupController');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
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
  roleMiddleware('admin', 'leader'),
  body('name').optional().trim().notEmpty(),
  validate,
  updateGroup
);

router.delete('/:id', validateUUIDParam('id'), roleMiddleware('admin'), deleteGroup);

router.post('/:id/members',
  validateUUIDParam('id'),
  roleMiddleware('admin', 'leader'),
  body('userId').notEmpty(),
  validate,
  addMember
);

router.delete('/:id/members/:userId',
  validateUUIDParam('id'),
  validateUUIDParam('userId'),
  roleMiddleware('admin', 'leader'),
  removeMember
);

module.exports = router;
