// Registro de actividad del equipo: qué hizo cada persona en un día, a partir de audit_log.
// Solo lectura. El acceso lo decide requireActividad (admin siempre; otros con
// permissions.modulos.actividad.canVer). Ver utils/actividadDescripcion.js para el texto de cada acción.
const db = require('../config/database');
const { describirEvento } = require('../utils/actividadDescripcion');

const TZ = 'America/Bogota';
const MAX_EVENTOS = 5000; // tope de seguridad por día
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fecha de hoy en Bogotá (YYYY-MM-DD) — el día del equipo, no el del servidor.
function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

const hora = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));

// Traduce los ids que aparecen en los registros del día a nombres (una consulta por tipo).
async function cargarNombres(rows) {
  const ids = { fondoEmp: new Set(), extEmp: new Set(), neEmp: new Set(), fondoProc: new Set(), extProc: new Set(), impuestos: new Set(), tasks: new Set() };
  const add = (set, id) => { if (typeof id === 'string' && UUID_RE.test(id)) set.add(id); };

  for (const r of rows) {
    const c = r.changes || {};
    switch (r.table_name) {
      case 'fondo_checklist_items': add(ids.fondoEmp, c.empresaId); add(ids.fondoProc, c.procesoId); break;
      case 'fondo_checklist_meses':
      case 'fondo_detalle_macroprocesos':
      case 'fondo_pagos': add(ids.fondoEmp, c.empresaId); break;
      case 'fondo_impuestos_items': add(ids.fondoEmp, c.empresaId); add(ids.impuestos, c.impuestoId); break;
      case 'ext_checklist_items': add(ids.extEmp, c.empresaId); add(ids.extProc, c.procesoId); break;
      case 'ext_checklist_meses': add(ids.extEmp, c.empresaId); break;
      case 'ne_meses': add(ids.neEmp, c.empresaId); break;
      case 'fondo_empresas': add(ids.fondoEmp, r.record_id); break;
      case 'ext_empresas': add(ids.extEmp, r.record_id); break;
      case 'ne_empresas': add(ids.neEmp, r.record_id); break;
      case 'fondo_procesos': add(ids.fondoProc, r.record_id); break;
      case 'ext_procesos': add(ids.extProc, r.record_id); break;
      case 'tasks': add(ids.tasks, r.record_id); break;
      default: break;
    }
  }

  const consultas = [
    ['fondoEmp', 'SELECT id, name FROM fondo_empresas WHERE id = ANY($1::uuid[])'],
    ['extEmp', 'SELECT id, name FROM ext_empresas WHERE id = ANY($1::uuid[])'],
    ['neEmp', 'SELECT id, name FROM ne_empresas WHERE id = ANY($1::uuid[])'],
    ['fondoProc', 'SELECT id, name FROM fondo_procesos WHERE id = ANY($1::uuid[])'],
    ['extProc', 'SELECT id, name FROM ext_procesos WHERE id = ANY($1::uuid[])'],
    ['impuestos', 'SELECT id, nombre AS name FROM fondo_impuestos WHERE id = ANY($1::uuid[])'],
    ['tasks', 'SELECT id, title AS name FROM tasks WHERE id = ANY($1::uuid[])'],
  ];
  const nombres = {};
  await Promise.all(consultas.map(async ([clave, sql]) => {
    nombres[clave] = {};
    if (ids[clave].size === 0) return;
    const { rows: filas } = await db.query(sql, [Array.from(ids[clave])]);
    for (const f of filas) nombres[clave][f.id] = f.name;
  }));
  return nombres;
}

// GET /api/actividad?fecha=YYYY-MM-DD&userId=<uuid>
const getActividad = async (req, res, next) => {
  try {
    const fecha = req.query.fecha || hoyBogota();
    if (!FECHA_RE.test(fecha) || Number.isNaN(Date.parse(fecha))) {
      return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' });
    }
    const { userId } = req.query;
    if (userId && !UUID_RE.test(userId)) return res.status(400).json({ error: 'userId inválido' });

    // Rango del día en hora de Bogotá (usa el índice por created_at).
    const params = [fecha];
    let filtroUsuario = '';
    if (userId) { params.push(userId); filtroUsuario = 'AND al.user_id = $2'; }

    const { rows } = await db.query(
      `SELECT al.id, al.user_id, u.name AS user_name, al.action, al.table_name, al.record_id, al.changes, al.created_at
       FROM audit_log al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.created_at >= ($1::date::timestamp AT TIME ZONE '${TZ}')
         AND al.created_at <  (($1::date + 1)::timestamp AT TIME ZONE '${TZ}')
         ${filtroUsuario}
       ORDER BY al.created_at DESC
       LIMIT ${MAX_EVENTOS}`,
      params
    );

    const nombres = await cargarNombres(rows);

    const porUsuario = new Map();
    for (const r of rows) {
      const clave = r.user_id || 'sistema';
      if (!porUsuario.has(clave)) {
        porUsuario.set(clave, { userId: r.user_id, nombre: r.user_name || 'Sistema', total: 0, areas: {}, eventos: [] });
      }
      const grupo = porUsuario.get(clave);
      const { area, texto } = describirEvento(r, nombres);
      grupo.total += 1;
      grupo.areas[area] = (grupo.areas[area] || 0) + 1;
      grupo.eventos.push({ id: r.id, hora: hora(r.created_at), area, texto });
    }

    const usuarios = Array.from(porUsuario.values()).sort((a, b) => b.total - a.total);
    res.json({ fecha, total: rows.length, truncado: rows.length >= MAX_EVENTOS, usuarios });
  } catch (err) {
    next(err);
  }
};

module.exports = { getActividad, hoyBogota };
