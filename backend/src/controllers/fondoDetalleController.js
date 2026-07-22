const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { isMesHabilitado } = require('../utils/mesVencido');

const MP_CATALOG = [
  { id: 1, nombre: 'Facturación' },
  { id: 2, nombre: 'Nómina' },
  { id: 3, nombre: 'Nómina electrónica' },
  { id: 4, nombre: 'Documentos contador - Pagos' },
  { id: 6, nombre: 'Información tributaria' },
  { id: 7, nombre: 'Producción y ventas' },
];

const normalizeDetalle = (row) => ({
  id:               row.id,
  nombre:           row.nombre,
  estado:           row.estado ?? 'pending',
  responsableId:    row.responsable_id ?? null,
  nota:             row.nota ?? null,
  updatedAt:        row.updated_at ?? null,
  tareasVinculadas: (row.tareas_vinculadas || []).map(t => ({
    id:             t.id,
    title:          t.title,
    description:    t.description || null,
    status:         t.status,
    priority:       t.priority,
    assignedTo:     t.assignedTo,
    assignedToName: t.assignedToName,
  })),
});

// mp6 (Información tributaria) deriva su estado de fondo_impuestos_items —
// tabla independiente de fondo_checklist_meses/fondo_checklist_items (esas
// pertenecen a Seguimiento Mensual y solo alimentan mp5/Contabilidad).
// Los 4 en 'na' cuentan como 'done': ya se revisó la empresa ese mes y no
// tenía impuestos que presentar, el proceso queda resuelto (no pendiente).
// El texto distinto para ese caso ("Sin impuestos aplicables...") se resuelve
// aparte en el frontend a partir de los items crudos, no de este estado.
const deriveImpuestosEstado = (rows) => {
  const noNa = rows.map(r => r.estado).filter(e => e !== 'na');
  if (noNa.length === 0) return 'done';
  if (noNa.every(e => e === 'presented')) return 'done';
  if (noNa.some(e => e === 'presented')) return 'in_progress';
  return 'pending';
};

// mp4 (Documentos contador - Pagos) deriva su estado del registro de
// fondo_pagos del mismo mes (módulo de Pagos a la fiduciaria) — no hay fila
// propia editable en fondo_detalle_macroprocesos para el campo estado, igual
// que mp6. mp4 rastrea si los documentos ya se ENVIARON (no si la fiduciaria
// ya aprobó el pago) — 'enviado' y 'aprobado' ambos cuentan como 'done'.
// 'rechazado' vuelve a 'in_progress' porque el envío falló y requiere
// corrección. Sin registro aún (mes no gestionado) cuenta como 'pending'.
const derivePagoMacroEstado = (estadoPago) => {
  if (estadoPago === 'enviado' || estadoPago === 'aprobado') return 'done';
  if (estadoPago === 'rechazado') return 'in_progress';
  return 'pending';
};

// mp3 (Nómina electrónica) deriva su estado del ítem "nomina electronica" del
// checklist de Seguimiento Mensual (vínculo por id en fondo_procesos.macroproceso_id,
// no por nombre — el proceso se puede renombrar desde "Editar estructura" y un
// match por texto se rompería en silencio). 'na' cuenta como 'done', mismo
// criterio que mp6: ya se revisó y no aplicaba, no queda pendiente.
const deriveNominaElectronicaEstado = (estado) => {
  if (estado === 'na') return 'done';
  if (estado === 'in_progress' || estado === 'done') return estado;
  return 'pending';
};

// mp2 (Nómina) y mp5 (Contabilidad) derivan su estado de TODOS los procesos
// del grupo NOMINA / CONTABILIDAD del checklist de Seguimiento Mensual
// (vínculo por id en fondo_proceso_grupos.macroproceso_id — mismo criterio
// que mp3, el grupo se puede renombrar sin romper el vínculo). Mismo criterio
// de 'na' que el resto: si TODOS los del grupo son 'na', el grupo queda
// 'done' (se revisó y no aplicaba nada). Si falta alguno por resolver pero
// ya hay avance (algún 'done'/'in_progress'), queda 'in_progress'.
const deriveGrupoEstado = (estados) => {
  const noNa = estados.filter(e => e !== 'na');
  if (noNa.length === 0) return 'done';
  if (noNa.every(e => e === 'done')) return 'done';
  if (noNa.some(e => e === 'done' || e === 'in_progress')) return 'in_progress';
  return 'pending';
};

const getDetalle = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const [mpResult, checklistMesResult, impuestosResult, pagoResult, nominaElecResult, nominaGrupoResult, contabilidadGrupoResult] = await Promise.all([
      db.query(
        `SELECT mp.id, mp.nombre, d.estado, d.responsable_id, d.nota, d.updated_at,
                (
                  SELECT json_agg(json_build_object(
                    'id',             t.id,
                    'title',          t.title,
                    'description',    t.description,
                    'status',         t.status,
                    'priority',       t.priority,
                    'assignedTo',     t.assigned_to,
                    'assignedToName', u.name
                  ) ORDER BY t.created_at)
                  FROM task_fondo_links fl
                  JOIN tasks t ON t.id = fl.task_id
                  LEFT JOIN users u ON u.id = t.assigned_to
                  WHERE fl.empresa_id = $1
                    AND fl.macro_id   = 'mp' || mp.id::text
                    AND fl.link_type  = 'macroproceso'
                ) AS tareas_vinculadas
         FROM (SELECT 1 AS id, 'Facturación'                  AS nombre UNION ALL
               SELECT 2,       'Nómina'                                 UNION ALL
               SELECT 3,       'Nómina electrónica'                     UNION ALL
               SELECT 4,       'Documentos contador - Pagos'            UNION ALL
               SELECT 6,       'Información tributaria'                  UNION ALL
               SELECT 7,       'Producción y ventas') mp
         LEFT JOIN fondo_detalle_macroprocesos d
                ON d.empresa_id = $1
               AND d.macroproceso_id = 'mp' || mp.id::text
               AND d.anio = $2
               AND d.mes  = $3
         ORDER BY mp.id`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT confirmed_nomina, enviado_nomina, confirmed_contabilidad, enviado_contabilidad
         FROM fondo_checklist_meses
         WHERE empresa_id = $1 AND anio = $2 AND mes = $3
         LIMIT 1`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT COALESCE(fi.estado, 'pending') AS estado
         FROM fondo_impuestos i
         LEFT JOIN fondo_impuestos_items fi
                ON fi.impuesto_id = i.id
               AND fi.empresa_id  = $1
               AND fi.anio        = $2
               AND fi.mes         = $3`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT estado FROM fondo_pagos
         WHERE empresa_id = $1 AND anio = $2 AND mes = $3
         LIMIT 1`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT COALESCE(i.estado, 'pending') AS estado
         FROM fondo_procesos p
         LEFT JOIN fondo_checklist_meses m
                ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
         LEFT JOIN fondo_checklist_items i
                ON i.mes_id = m.id AND i.proceso_id = p.id
         WHERE p.macroproceso_id = 'mp3'
         LIMIT 1`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT p.id, p.name, COALESCE(i.estado, 'pending') AS estado
         FROM fondo_procesos p
         JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp2'
         LEFT JOIN fondo_checklist_meses m
                ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
         LEFT JOIN fondo_checklist_items i
                ON i.mes_id = m.id AND i.proceso_id = p.id
         WHERE p.activo = true
         ORDER BY p.orden`,
        [empresaId, anio, mes]
      ),
      db.query(
        `SELECT COALESCE(i.estado, 'pending') AS estado
         FROM fondo_procesos p
         JOIN fondo_proceso_grupos g ON g.id = p.grupo_id AND g.macroproceso_id = 'mp5'
         LEFT JOIN fondo_checklist_meses m
                ON m.empresa_id = $1 AND m.anio = $2 AND m.mes = $3
         LEFT JOIN fondo_checklist_items i
                ON i.mes_id = m.id AND i.proceso_id = p.id
         WHERE p.activo = true`,
        [empresaId, anio, mes]
      ),
    ]);

    const checklistMes = checklistMesResult.rows[0];
    const mp2Confirmed = checklistMes?.confirmed_nomina ?? false;
    const mp2Enviado   = checklistMes?.enviado_nomina   ?? false;
    const mp5Confirmed = checklistMes?.confirmed_contabilidad ?? false;
    const mp5Enviado   = checklistMes?.enviado_contabilidad   ?? false;

    const macroprocesos = mpResult.rows.map(normalizeDetalle);

    // mp3 (Nómina electrónica): el estado propio de la fila se reemplaza por
    // el derivado del checklist mensual; responsable/nota/tareasVinculadas
    // siguen viniendo de fondo_detalle_macroprocesos y se mantienen editables.
    const nominaElectronicaEstado = nominaElecResult.rows.length > 0 ? nominaElecResult.rows[0].estado : 'pending';
    const mp3Index = macroprocesos.findIndex(m => m.id === 3);
    if (mp3Index !== -1) {
      macroprocesos[mp3Index] = {
        ...macroprocesos[mp3Index],
        estado:          deriveNominaElectronicaEstado(nominaElectronicaEstado),
        // Estado crudo del ítem del checklist (incluye 'na', que el estado
        // derivado de arriba ya colapsó a 'done') — el frontend lo usa para
        // distinguir "Completado" de "Completado - No aplica" en el texto.
        checklistEstado: nominaElectronicaEstado,
        readonly:        true,
      };
    }

    // mp2 (Nómina): el estado propio de la fila se reemplaza por el agregado
    // de TODOS los procesos del grupo NOMINA del checklist mensual;
    // responsable/nota/tareasVinculadas siguen viniendo de
    // fondo_detalle_macroprocesos y se mantienen editables. checklistItems
    // trae el desglose por proceso para mostrarlo tipo checklist en la ficha.
    const mp2Index = macroprocesos.findIndex(m => m.id === 2);
    if (mp2Index !== -1) {
      macroprocesos[mp2Index] = {
        ...macroprocesos[mp2Index],
        estado: deriveGrupoEstado(nominaGrupoResult.rows.map(r => r.estado)),
        checklistItems: nominaGrupoResult.rows.map(r => ({ id: r.id, nombre: r.name, estado: r.estado })),
        // Igual que mp5/Contabilidad: "confirmed"/"enviado" son el paso manual
        // de Seguimiento Mensual, independiente del estado derivado de arriba.
        confirmed: mp2Confirmed,
        enviado:   mp2Enviado,
        readonly: true,
      };
    }

    // mp4 (Documentos contador - Pagos): el estado propio de la fila se
    // reemplaza por el derivado del pago del mes en el módulo de Pagos;
    // responsable/nota/tareasVinculadas siguen viniendo de
    // fondo_detalle_macroprocesos y se mantienen editables.
    const pagoEstado = pagoResult.rows.length > 0 ? pagoResult.rows[0].estado : 'pendiente';
    const mp4Index = macroprocesos.findIndex(m => m.id === 4);
    if (mp4Index !== -1) {
      macroprocesos[mp4Index] = {
        ...macroprocesos[mp4Index],
        estado:     derivePagoMacroEstado(pagoEstado),
        pagoEstado,
        readonly:   true,
      };
    }

    // mp6 (Información tributaria): el estado propio de la fila se reemplaza por
    // el derivado del checklist de impuestos; responsable/nota/tareasVinculadas
    // siguen viniendo de fondo_detalle_macroprocesos y se mantienen editables.
    const mp6Index = macroprocesos.findIndex(m => m.id === 6);
    if (mp6Index !== -1) {
      macroprocesos[mp6Index] = {
        ...macroprocesos[mp6Index],
        estado: deriveImpuestosEstado(impuestosResult.rows),
        readonly: true,
      };
    }

    // mp5 (Contabilidad) es readonly. El estado (done/in_progress/pending) ya
    // NO viene de "confirmed" — se deriva del agregado de todos los procesos
    // del grupo CONTABILIDAD del checklist mensual, mismo criterio que mp2.
    // "confirmed" (y el flujo confirmar → enviar de Seguimiento Mensual) se
    // sigue mandando aparte: ahora es un paso manual posterior e
    // independiente ("listo para enviar"), no la fuente del estado.
    const mp5 = {
      id:               5,
      nombre:           'Contabilidad',
      estado:           deriveGrupoEstado(contabilidadGrupoResult.rows.map(r => r.estado)),
      confirmed:        mp5Confirmed,
      enviado:          mp5Enviado,
      responsableId:    null,
      nota:             null,
      updatedAt:        null,
      readonly:         true,
      tareasVinculadas: [],
    };

    // Insertar mp5 entre mp4 (index 3) y mp6 (index 4)
    macroprocesos.splice(4, 0, mp5);

    res.json({ macroprocesos });
  } catch (err) {
    next(err);
  }
};

const updateDetalle = async (req, res, next) => {
  try {
    const { empresaId, macroId } = req.params;
    const macroNum = parseInt(macroId, 10);

    if (macroNum === 5) {
      return res.status(400).json({ error: 'mp5/Contabilidad no se edita directamente' });
    }

    const { responsableId, nota, estado, anio, mes } = req.body;
    const mpKey = `mp${macroNum}`;

    if (!isMesHabilitado(anio, mes)) {
      return res.status(403).json({ error: 'Ese mes aún no está habilitado (mes vencido)' });
    }

    const result = await db.query(
      `INSERT INTO fondo_detalle_macroprocesos (id, empresa_id, macroproceso_id, anio, mes, estado, responsable_id, nota)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'pending'), $7, $8)
       ON CONFLICT (empresa_id, macroproceso_id, anio, mes) DO UPDATE
       SET estado         = COALESCE(EXCLUDED.estado,         fondo_detalle_macroprocesos.estado),
           responsable_id = COALESCE(EXCLUDED.responsable_id, fondo_detalle_macroprocesos.responsable_id),
           nota           = COALESCE(EXCLUDED.nota,           fondo_detalle_macroprocesos.nota)
       RETURNING *`,
      [uuidv4(), empresaId, mpKey, anio, mes, estado ?? null, responsableId ?? null, nota ?? null]
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_detalle_macroprocesos', result.rows[0].id, {
      empresaId,
      macroId: mpKey,
      estado,
      responsableId,
      nota,
    });

    req.io.emit('empresa:updated', { empresaId, tipo: 'detalle' });

    const catalogEntry = MP_CATALOG.find(m => m.id === macroNum);
    const row = result.rows[0];
    res.json({
      id:            macroNum,
      nombre:        catalogEntry?.nombre,
      estado:        row.estado,
      responsableId: row.responsable_id,
      nota:          row.nota,
      updatedAt:     row.updated_at,
    });
  } catch (err) {
    next(err);
  }
};

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const MP_NAMES = {
  mp1: 'Facturación',
  mp2: 'Nómina',
  mp3: 'Nómina electrónica',
  mp4: 'Documentos contador - Pagos',
  mp6: 'Información tributaria',
  mp7: 'Producción y ventas',
};

const getMacroTareas = async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.empresa_id, e.name AS empresa_nombre,
              d.macroproceso_id, d.anio, d.mes, d.estado, d.responsable_id
       FROM fondo_detalle_macroprocesos d
       JOIN fondo_empresas e ON e.id = d.empresa_id
       ORDER BY d.anio DESC, d.mes DESC, e.name, d.macroproceso_id`
    );

    const tareas = result.rows.map(row => ({
      id:            `fondo-${row.empresa_id}-${row.macroproceso_id}-${row.anio}-${row.mes}`,
      title:         `${row.empresa_nombre} — ${MP_NAMES[row.macroproceso_id] ?? row.macroproceso_id} (${MONTHS_ES[row.mes - 1]} ${row.anio})`,
      status:        row.estado === 'done' ? 'completed' : (row.estado ?? 'pending'),
      assignedTo:    row.responsable_id ? [row.responsable_id] : [],
      dueDate:       null,
      groupId:       null,
      tagIds:        [],
      source:        'fondo',
    }));

    res.json(tareas);
  } catch (err) {
    next(err);
  }
};

const getResponsables = async (req, res, next) => {
  try {
    const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
    const mes  = parseInt(req.query.mes,  10) || new Date().getMonth() + 1;

    // Miembros del grupo Fondo Emprender + sus macros pendientes/en_progreso del mes
    const result = await db.query(
      `SELECT
         u.id   AS user_id,
         u.name AS user_name,
         d.macroproceso_id,
         d.estado,
         e.id     AS empresa_id,
         e.name AS empresa_nombre
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id AND g.name = 'Fondo Emprender'
       JOIN users  u ON u.id = gm.user_id
       LEFT JOIN fondo_detalle_macroprocesos d
              ON d.responsable_id = u.id
             AND d.anio  = $1
             AND d.mes   = $2
             AND d.estado <> 'done'
       LEFT JOIN fondo_empresas e ON e.id = d.empresa_id
       ORDER BY u.name, e.name, d.macroproceso_id`,
      [anio, mes]
    );

    // Agrupar por usuario
    const byUser = {};
    for (const row of result.rows) {
      if (!byUser[row.user_id]) {
        byUser[row.user_id] = { userId: row.user_id, userName: row.user_name, tareas: [] };
      }
      if (row.macroproceso_id) {
        byUser[row.user_id].tareas.push({
          macroId:       row.macroproceso_id,
          macroNombre:   MP_NAMES[row.macroproceso_id] ?? row.macroproceso_id,
          estado:        row.estado,
          empresaId:     row.empresa_id,
          empresaNombre: row.empresa_nombre,
        });
      }
    }

    res.json({ anio, mes, responsables: Object.values(byUser) });
  } catch (err) {
    next(err);
  }
};

module.exports = { getDetalle, updateDetalle, getMacroTareas, getResponsables };
