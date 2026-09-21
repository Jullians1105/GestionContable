const db = require('../config/database');
const logger = require('../utils/logger');

// Mismo patrón que externasAccess.js / fondoAccess.js — permisos guardados en
// users.permissions (JSONB) bajo la clave modulos.nominaElectronica. A
// diferencia de esos dos, acá hay un segundo nivel: canEditar solo alcanza a
// las empresas donde el usuario es responsable_id (cada quien lleva lo suyo),
// mientras que canVerTodo (el líder del área) y admin ven/editan cualquier
// empresa. req.neScope queda en 'all' o 'own' para que el controlador filtre
// o valide dueño sin tener que releer permisos.
const requireNEAccess = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') {
    req.neScope = 'all';
    return next();
  }

  if (role === 'viewer') {
    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireNEAccess — viewer bloqueado'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Nómina Electrónica' });
  }

  try {
    const result = await db.query('SELECT permissions FROM users WHERE id = $1', [userId]);
    const perms = result.rows[0]?.permissions;

    if (perms?.modulos?.nominaElectronica?.canVerTodo === true) {
      req.neScope = 'all';
      return next();
    }
    if (perms?.modulos?.nominaElectronica?.canEditar === true) {
      req.neScope = 'own';
      return next();
    }

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireNEAccess — permiso nominaElectronica.canEditar/canVerTodo ausente'
    );
    return res.status(403).json({ error: 'No tienes permiso de edición en Nómina Electrónica' });
  } catch (err) {
    next(err);
  }
};

// Ver el seguimiento (GET) no exige permiso — "de momento" (pedido explícito
// del usuario, 2026-09) hasta que se reasignen responsables: cualquier
// usuario autenticado ve el mes completo, sin filtrar por responsable_id.
// Escribir (marcar estado/nota) sigue exigiendo requireNEAccess arriba.
const requireNEView = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  req.neScope = 'all';
  next();
};

// Catálogo de empresas (nombre, grupo, responsable, enlaces a Fondo/
// Externas): admin, o quien tenga el permiso granular canGestionar (mismo
// nombre/criterio que fondoEmprender.canGestionar) — así se le puede dar
// acceso a alguien puntual sin volverlo admin de toda la app.
const requireNEAdmin = async (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });

  const { userId, role } = req.user;

  if (role === 'admin') return next();

  try {
    const result = await db.query('SELECT permissions FROM users WHERE id = $1', [userId]);
    const perms = result.rows[0]?.permissions;
    if (perms?.modulos?.nominaElectronica?.canGestionar === true) return next();

    logger.warn(
      { userId, path: req.path, method: req.method },
      'requireNEAdmin — ni admin ni permiso nominaElectronica.canGestionar'
    );
    return res.status(403).json({ error: 'No tienes permiso para modificar el catálogo de empresas' });
  } catch (err) {
    next(err);
  }
};

// Fecha límite de Nómina Electrónica (ne_plazo): a diferencia del resto del módulo, esto NO es
// un permiso general — el usuario pidió explícitamente (2026-09-21) que solo una persona
// puntual la edite, ni siquiera otros admin, porque es un campo manual (los primeros 10 días
// hábiles del mes, sin sábados/domingos/festivos) y prefiere que una sola persona de confianza
// sea la responsable de mantenerla correcta en vez de repartir esa responsabilidad. Por eso
// compara el id directo en vez de un rol/permiso — si el día de mañana cambia quién la
// mantiene, hay que actualizar este id a mano.
const ID_RESPONSABLE_PLAZO = 'f2a82148-64d0-44a2-a0ac-37462ed43138'; // julliansadmin@gmail.com

const requireNEPlazoAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autenticado' });
  if (req.user.userId === ID_RESPONSABLE_PLAZO) return next();

  logger.warn(
    { userId: req.user.userId, path: req.path, method: req.method },
    'requireNEPlazoAdmin — no es la cuenta autorizada para editar la fecha límite'
  );
  return res.status(403).json({ error: 'Solo la cuenta responsable puede editar la fecha límite' });
};

module.exports = { requireNEAccess, requireNEView, requireNEAdmin, requireNEPlazoAdmin };
