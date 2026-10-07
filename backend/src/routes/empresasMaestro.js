// Directorio maestro de empresas (ver empresasMaestroController.js y migración 053).
// Lectura abierta a cualquier autenticado — todos deben poder ver qué empresas existen y en
// qué módulos están habilitadas. Escritura (crear/renombrar/habilitar/deshabilitar/fusionar)
// restringida a admin y leader: es la superficie pensada justamente para evitar que cualquiera
// cree duplicados sin darse cuenta, así que el acceso de escritura es más estrecho que en los
// 4 catálogos de módulo (que hoy dejan crear/editar a cualquier autenticado).
const { Router } = require('express');
const { body } = require('express-validator');
const { authMiddleware, roleMiddleware, canEdit } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { validateUUIDParam } = require('../middleware/security');
const { requireEmpresasMatricula } = require('../middleware/empresasAccess');
const {
  getDirectorio, getPosiblesDuplicados, createEmpresa, updateEmpresa,
  habilitarModulo, deshabilitarModulo, fusionar, descartarDuplicado, generarTokenDian, verificarMatricula, getRuesFuente, MODULOS,
} = require('../controllers/empresasMaestroController');

const router = Router();
router.use(authMiddleware);

router.get('/', getDirectorio);
router.get('/duplicados', getPosiblesDuplicados);
// Fecha de la última actualización de los datos del RUES (ver empresasMaestroController.js#getRuesFuente).
router.get('/rues-fuente', getRuesFuente);

// Abierto a cualquier autenticado (no admin/leader): generar el token es una acción operativa
// del día a día para cualquiera de los ~14 usuarios de la página, no algo que deba limitarse
// como sí se limita crear/fusionar empresas (ahí el riesgo es duplicar identidad; acá no).
router.post('/:id/generar-token-dian', canEdit, ...validateUUIDParam('id'), generarTokenDian);

// Consulta el RUES y actualiza el estado de la matrícula mercantil de las empresas (migración 064).
// Body opcional { forzar: true } para repasar todas; por defecto solo las pendientes. 409 si ya hay
// una verificación en curso. El administrador siempre puede; a los demás (menos viewer) se les da
// desde Usuarios con permissions.modulos.empresas.canActualizarMatricula (ver empresasAccess.js).
// Va ANTES del filtro admin/líder de abajo porque ese filtro no mira permisos por usuario.
router.post('/verificar-matricula', requireEmpresasMatricula, verificarMatricula);

router.use(roleMiddleware('admin', 'leader'));

router.post('/',
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').isLength({ max: 255 }),
  validate,
  createEmpresa
);

router.put('/:id',
  ...validateUUIDParam('id'),
  body('name').optional().trim().notEmpty().isLength({ max: 255 }),
  body('activa').optional().isBoolean().withMessage('activa debe ser boolean'),
  validate,
  updateEmpresa
);

router.post('/:id/habilitar',
  ...validateUUIDParam('id'),
  body('modulo').isIn(Object.keys(MODULOS)).withMessage(`modulo debe ser uno de: ${Object.keys(MODULOS).join(', ')}`),
  validate,
  habilitarModulo
);

router.delete('/:id/habilitar/:modulo',
  ...validateUUIDParam('id'),
  deshabilitarModulo
);

router.post('/fusionar',
  body('empresaIdA').isUUID().withMessage('empresaIdA debe ser un UUID válido'),
  body('empresaIdB').isUUID().withMessage('empresaIdB debe ser un UUID válido'),
  validate,
  fusionar
);

router.post('/duplicados/descartar',
  body('empresaIdA').isUUID().withMessage('empresaIdA debe ser un UUID válido'),
  body('empresaIdB').isUUID().withMessage('empresaIdB debe ser un UUID válido'),
  validate,
  descartarDuplicado
);

module.exports = router;
