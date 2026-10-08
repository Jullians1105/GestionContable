// Registro de actividad del equipo: qué hizo cada persona en un día, a partir de audit_log.
// Solo lectura. El acceso lo decide requireActividad (admin siempre; otros con
// permissions.modulos.actividad.canVer). Ver utils/actividadDescripcion.js para el texto de cada acción.
const db = require('../config/database');
const { describirEvento, clasificarEvento } = require('../utils/actividadDescripcion');

const TZ = 'America/Bogota';
const MAX_EVENTOS = 5000; // tope de seguridad por día
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

// Fecha de hoy en Bogotá (YYYY-MM-DD) — el día del equipo, no el del servidor.
function hoyBogota() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

// Resumen de lo que hizo una persona, para leerlo de un vistazo: por proceso (o tipo de acción), en cuántas
// empresas quedó cada estado (el ÚLTIMO del día por casilla: si alguien la cambió varias veces, cuenta
// cómo quedó) y cuántos cambios hizo. `eventos` viene del más reciente al más antiguo.
function armarResumen(eventos) {
  const filas = new Map();
  const casillasVistas = new Set();
  const empresas = new Set();
  const totales = { hecho: 0, proceso: 0, noaplica: 0, pendiente: 0 };

  for (const e of eventos) {
    const k = `${e.area}||${e.clasificacion.item}`;
    if (!filas.has(k)) {
      filas.set(k, { area: e.area, item: e.clasificacion.item, hecho: 0, proceso: 0, noaplica: 0, pendiente: 0, empresas: new Set(), cambios: 0 });
    }
    const fila = filas.get(k);
    fila.cambios += 1;
    const { estadoClave, empresa, clave } = e.clasificacion;
    if (empresa) { fila.empresas.add(empresa); empresas.add(empresa); }
    if (estadoClave && clave && !casillasVistas.has(clave)) {
      casillasVistas.add(clave);
      fila[estadoClave] += 1;
      totales[estadoClave] += 1;
    }
  }

  const items = Array.from(filas.values())
    .map((f) => ({ area: f.area, item: f.item, hecho: f.hecho, proceso: f.proceso, noaplica: f.noaplica, pendiente: f.pendiente, empresas: f.empresas.size, cambios: f.cambios }))
    .sort((a, b) => a.area.localeCompare(b.area, 'es') || b.cambios - a.cambios);
  return { cambios: eventos.length, empresas: empresas.size, ...totales, items };
}

const hora = (d) => new Intl.DateTimeFormat('es-CO', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));

// Traduce los ids que aparecen en los registros del día a nombres (una consulta por tipo).
async function cargarNombres(rows) {
  const ids = { fondoEmp: new Set(), extEmp: new Set(), neEmp: new Set(), contabEmp: new Set(), fondoProc: new Set(), extProc: new Set(), impuestos: new Set(), tasks: new Set() };
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
      case 'contab_reporte':
      case 'contab_exportacion':
      case 'contab_consolidado_exportacion': add(ids.contabEmp, c.empresaId); break;
      case 'exogenas_archivo': add(ids.contabEmp, c.contabEmpresaId); break;
      default: break;
    }
  }

  const consultas = [
    ['fondoEmp', 'SELECT id, name FROM fondo_empresas WHERE id = ANY($1::uuid[])'],
    ['extEmp', 'SELECT id, name FROM ext_empresas WHERE id = ANY($1::uuid[])'],
    ['neEmp', 'SELECT id, name FROM ne_empresas WHERE id = ANY($1::uuid[])'],
    ['contabEmp', 'SELECT id, name FROM contab_empresas WHERE id = ANY($1::uuid[])'],
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
      grupo.eventos.push({ id: r.id, hora: hora(r.created_at), area, texto, clasificacion: clasificarEvento(r, nombres) });
    }

    const usuarios = Array.from(porUsuario.values()).sort((a, b) => b.total - a.total);
    for (const u of usuarios) {
      u.resumen = armarResumen(u.eventos.map((e) => ({ area: e.area, clasificacion: e.clasificacion })));
      u.eventos = u.eventos.map(({ clasificacion, ...resto }) => resto); // la clasificación solo sirve para el resumen
    }
    res.json({ fecha, total: rows.length, truncado: rows.length >= MAX_EVENTOS, usuarios });
  } catch (err) {
    next(err);
  }
};

// ── Accesos: cómo usa el equipo la aplicación ────────────────────────────────────
// Señales de uso por persona (todas en hora de Bogotá):
//   login  → inicio de sesión exitoso (login_attempts)
//   sesion → sesión renovada (refresh_tokens): con la aplicación abierta se renueva cada hora, así que
//            sirve para estimar el tiempo conectado
//   accion → algo guardado (audit_log)
// "Día activo" = algún día con alguna señal. "Horas conectadas" = horas distintas con alguna señal
// (es una estimación: no mide cuánto tiempo estuvo la pestaña abierta sin usarse).
const DIAS_VALIDOS = new Set([1, 7, 30]);
// $1 = primer día, $2 = último día (inclusive), ambos en hora de Bogotá.
const RANGO_SQL = `
  WITH rango AS (
    SELECT ($1::date::timestamp AT TIME ZONE '${TZ}') AS ini, (($2::date + 1)::timestamp AT TIME ZONE '${TZ}') AS fin
  )`;
const SENALES_SQL = `${RANGO_SQL}, senales AS (
    SELECT u.id AS user_id, la.created_at AS ts, 'login' AS tipo
      FROM login_attempts la JOIN users u ON lower(u.email) = la.email, rango
      WHERE la.success AND la.created_at >= rango.ini AND la.created_at < rango.fin
    UNION ALL
    SELECT r.user_id, r.created_at, 'sesion' FROM refresh_tokens r, rango
      WHERE r.created_at >= rango.ini AND r.created_at < rango.fin
    UNION ALL
    SELECT a.user_id, a.created_at, 'accion' FROM audit_log a, rango
      WHERE a.user_id IS NOT NULL AND a.created_at >= rango.ini AND a.created_at < rango.fin
  )`;

// Las IP de Docker/proxy no dicen nada de la persona: se ocultan (ver nginx.conf, CF-Connecting-IP).
const IP_INTERNA = /^(::ffff:)?(172\.(1[6-9]|2\d|3[01])\.|127\.)|^::1$/;
const ipVisible = (ip) => (!ip || IP_INTERNA.test(ip) ? null : ip.replace(/^::ffff:/, ''));

function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

// GET /api/actividad/accesos?hasta=YYYY-MM-DD&dias=1|7|30
const getAccesos = async (req, res, next) => {
  try {
    const hasta = req.query.hasta || hoyBogota();
    if (!FECHA_RE.test(hasta) || Number.isNaN(Date.parse(hasta))) {
      return res.status(400).json({ error: 'La fecha debe tener el formato AAAA-MM-DD' });
    }
    const dias = parseInt(req.query.dias ?? '1', 10);
    if (!DIAS_VALIDOS.has(dias)) return res.status(400).json({ error: 'dias debe ser 1, 7 o 30' });
    const desde = sumarDias(hasta, -(dias - 1));
    const params = [desde, hasta];

    const [personasSql, horasSql, diasSql, fallidosSql, fallidosPorUsuarioSql, usuariosSql] = await Promise.all([
      db.query(
        `${SENALES_SQL}
         SELECT user_id,
                count(*) FILTER (WHERE tipo = 'login')  AS inicios,
                count(*) FILTER (WHERE tipo = 'accion') AS acciones,
                count(DISTINCT (ts AT TIME ZONE '${TZ}')::date) AS dias,
                count(DISTINCT date_trunc('hour', ts AT TIME ZONE '${TZ}')) AS horas,
                min(ts) AS primero, max(ts) AS ultimo
         FROM senales GROUP BY user_id`, params),
      db.query(
        `${SENALES_SQL}
         SELECT extract(hour FROM ts AT TIME ZONE '${TZ}')::int AS hora,
                count(DISTINCT (user_id, date_trunc('hour', ts AT TIME ZONE '${TZ}'))) AS personas
         FROM senales GROUP BY 1 ORDER BY 1`, params),
      db.query(
        `${SENALES_SQL}
         SELECT (ts AT TIME ZONE '${TZ}')::date AS fecha, count(DISTINCT user_id) AS personas
         FROM senales GROUP BY 1 ORDER BY 1`, params),
      db.query(
        `${RANGO_SQL}
         SELECT la.created_at, la.email, la.ip_address, u.name
         FROM login_attempts la LEFT JOIN users u ON lower(u.email) = la.email, rango
         WHERE NOT la.success AND la.created_at >= rango.ini AND la.created_at < rango.fin
         ORDER BY la.created_at DESC LIMIT 50`, params),
      db.query(
        `${RANGO_SQL}
         SELECT u.id AS user_id, count(*) AS fallidos
         FROM login_attempts la LEFT JOIN users u ON lower(u.email) = la.email, rango
         WHERE NOT la.success AND la.created_at >= rango.ini AND la.created_at < rango.fin
         GROUP BY u.id`, params),
      db.query('SELECT id, name, role FROM users WHERE is_active = true ORDER BY name'),
    ]);

    const uso = new Map(personasSql.rows.map((r) => [r.user_id, r]));
    const fallosPorUsuario = new Map(fallidosPorUsuarioSql.rows.map((r) => [r.user_id, Number(r.fallidos)]));

    const personas = usuariosSql.rows.map((u) => {
      const r = uso.get(u.id);
      return {
        userId: u.id,
        nombre: u.name,
        rol: u.role,
        iniciosSesion: r ? Number(r.inicios) : 0,
        acciones: r ? Number(r.acciones) : 0,
        diasActivos: r ? Number(r.dias) : 0,
        horasConectadas: r ? Number(r.horas) : 0,
        primerAcceso: r ? r.primero : null,
        ultimoAcceso: r ? r.ultimo : null,
        fallidos: fallosPorUsuario.get(u.id) || 0,
      };
    });
    // Primero quienes más usaron la aplicación; al final quienes no entraron en el período.
    personas.sort((a, b) => (b.horasConectadas - a.horasConectadas) || (b.acciones - a.acciones) || a.nombre.localeCompare(b.nombre));

    const fallidosDesconocidos = fallosPorUsuario.get(null) || 0;
    res.json({
      desde,
      hasta,
      dias,
      resumen: {
        inicios: personas.reduce((t, p) => t + p.iniciosSesion, 0),
        fallidos: Array.from(fallosPorUsuario.values()).reduce((t, n) => t + n, 0),
        fallidosCorreoDesconocido: fallidosDesconocidos,
        personasActivas: personas.filter((p) => p.horasConectadas > 0).length,
        personasTotal: personas.length,
      },
      personas,
      porHora: horasSql.rows.map((r) => ({ hora: r.hora, personas: Number(r.personas) })),
      porDia: diasSql.rows.map((r) => ({ fecha: new Date(r.fecha).toISOString().slice(0, 10), personas: Number(r.personas) })),
      fallidos: fallidosSql.rows.map((r) => ({ cuando: r.created_at, correo: r.email, nombre: r.name || null, ip: ipVisible(r.ip_address) })),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getActividad, getAccesos, hoyBogota };
