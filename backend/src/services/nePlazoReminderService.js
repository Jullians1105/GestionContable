// Avisos de Nómina Electrónica — 3 tipos, un cron diario (no hace falta más frecuencia, son
// avisos de calendario, no de hora puntual). La fecha límite (ne_plazo.fecha_limite) sigue
// siendo 100% manual — el usuario decidió (2026-09-21) no automatizarla por festivos porque no
// confía en la fuente de festivos disponible; ver requireNEPlazoAdmin, que restringe quién la
// puede editar a una sola cuenta de confianza.
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const { sendPushToUser } = require('./pushService');
const { getMesHabilitado } = require('../utils/mesVencidoNominaElectronica');

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// `pg` parsea una columna DATE a un objeto Date de JS anclado a medianoche UTC (mismo detalle
// que ya documenta nePlazoController.js#toDateOnlyString) — convertir eso con
// `.toLocaleDateString()` o comparar contra un `new Date()` "de hoy" (que sí vive en la hora
// LOCAL del servidor) corre la fecha un día para adelante o atrás según el huso horario donde
// corra el proceso. Estas 3 funciones trabajan siempre con "YYYY-MM-DD" puro para no toque
// ninguna zona horaria real.
function toISODateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

// "Hoy" según el reloj del servidor (no UTC) — el cron corre a una hora fija del día local.
function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Diferencia en días entre dos "YYYY-MM-DD" — Date.UTC acá es solo aritmética de calendario
// sobre 3 números, no un instante real, así que no hay huso horario que pueda correrla.
function diasEntre(desdeISO, hastaISO) {
  const [ay, am, ad] = desdeISO.split('-').map(Number);
  const [by, bm, bd] = hastaISO.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

async function notificarUsuarios(io, userIds, type, message) {
  for (const userId of userIds) {
    const notifId = uuidv4();
    await db.query(
      `INSERT INTO notifications (id, user_id, type, message) VALUES ($1, $2, $3, $4)`,
      [notifId, userId, type, message]
    );
    io?.to(`user:${userId}`).emit('notification:received', {
      id: notifId, type, message, read: false, createdAt: new Date().toISOString(),
    });
    sendPushToUser(userId, { title: 'Nómina Electrónica', body: message, url: '/dian/nomina-electronica', tag: notifId });
  }
}

// El cron corre una vez al día, pero si el proceso se reinicia (un redeploy) podría correr dos
// veces el mismo día — esto evita mandar el mismo aviso duplicado.
async function yaSeEnvioHoy(type) {
  const { rows } = await db.query(
    `SELECT 1 FROM notifications WHERE type = $1 AND created_at::date = CURRENT_DATE LIMIT 1`,
    [type]
  );
  return rows.length > 0;
}

async function getFechaLimite() {
  const { rows } = await db.query('SELECT fecha_limite FROM ne_plazo WHERE id = 1');
  return rows[0]?.fecha_limite ?? null;
}

// Para cada responsable con empresas de Nómina Electrónica asignadas: cuántas siguen sin marcar
// ningún estado (pendientes) y cuántas quedaron en "no aplica" (por revisar, ver
// stats.noAplica/'revisar' en NominaElectronicaPage.jsx) para el mes habilitado. Sin fila en
// ne_meses = pendiente sin marcar (mismo criterio que el resto del módulo, ver migración 045).
async function contarPorResponsable(anio, mes) {
  const { rows } = await db.query(`
    SELECT e.responsable_id,
           COUNT(*) FILTER (WHERE COALESCE(m.estado, 'pendiente') = 'pendiente' AND COALESCE(m.autorizada, false) = false) AS pendientes,
           COUNT(*) FILTER (WHERE m.estado = 'no_aplica') AS por_revisar
    FROM ne_empresas e
    LEFT JOIN ne_meses m ON m.empresa_id = e.id AND m.anio = $1 AND m.mes = $2
    WHERE e.responsable_id IS NOT NULL AND e.activa = true
    GROUP BY e.responsable_id
  `, [anio, mes]);
  return rows
    .map((r) => ({ responsableId: r.responsable_id, pendientes: Number(r.pendientes), porRevisar: Number(r.por_revisar) }))
    .filter((r) => r.pendientes > 0 || r.porRevisar > 0);
}

// Día 1 del mes: avisa a quien tiene acceso al módulo (no solo a los responsables — acá es un
// aviso general de "ya se puede empezar a trabajar el mes").
async function avisarMesHabilitado(io) {
  try {
    const hoy = new Date();
    if (hoy.getDate() !== 1) return;
    if (await yaSeEnvioHoy('ne_mes_habilitado')) return;

    const { anio, mes } = getMesHabilitado(hoy);
    const fechaLimite = await getFechaLimite();
    const fechaLimiteISO = toISODateOnly(fechaLimite);
    const fechaStr = fechaLimiteISO
      ? (() => {
          const [y, m, d] = fechaLimiteISO.split('-').map(Number);
          return `${d} de ${MESES_ES[m - 1]} de ${y}`;
        })()
      : 'sin configurar todavía';

    const { rows: userRows } = await db.query(`
      SELECT id FROM users
      WHERE role = 'admin'
         OR permissions->'modulos'->'nominaElectronica'->>'canVerTodo' = 'true'
         OR permissions->'modulos'->'nominaElectronica'->>'canEditar' = 'true'
    `);
    if (userRows.length === 0) return;

    const mensaje = `Se habilitó ${MESES_ES[mes - 1]} de ${anio} para Nómina Electrónica. Fecha límite: ${fechaStr}.`;
    await notificarUsuarios(io, userRows.map((r) => r.id), 'ne_mes_habilitado', mensaje);
    logger.info({ anio, mes }, 'Aviso de mes habilitado (Nómina Electrónica) enviado');
  } catch (err) {
    logger.error({ err }, 'Error enviando aviso de mes habilitado (Nómina Electrónica)');
  }
}

// 5 días antes de la fecha límite manual — por responsable, con sus propios conteos.
async function avisarPlazoProximo(io) {
  try {
    const fechaLimite = await getFechaLimite();
    const fechaLimiteISO = toISODateOnly(fechaLimite);
    if (!fechaLimiteISO) return;

    const diasFaltantes = diasEntre(hoyISO(), fechaLimiteISO);
    if (diasFaltantes !== 5) return;
    if (await yaSeEnvioHoy('ne_plazo_proximo')) return;

    const { anio, mes } = getMesHabilitado(new Date());
    const responsables = await contarPorResponsable(anio, mes);
    for (const r of responsables) {
      const mensaje = `Quedan 5 días para el plazo de Nómina Electrónica. Tienes ${r.pendientes} pendiente${r.pendientes === 1 ? '' : 's'} y ${r.porRevisar} por revisar.`;
      await notificarUsuarios(io, [r.responsableId], 'ne_plazo_proximo', mensaje);
    }
    logger.info({ responsables: responsables.length }, 'Aviso de plazo próximo (Nómina Electrónica) enviado');
  } catch (err) {
    logger.error({ err }, 'Error enviando aviso de plazo próximo (Nómina Electrónica)');
  }
}

// El mismo día de la fecha límite — mismo criterio, por responsable.
async function avisarPlazoVencido(io) {
  try {
    const fechaLimite = await getFechaLimite();
    const fechaLimiteISO = toISODateOnly(fechaLimite);
    if (!fechaLimiteISO) return;
    if (hoyISO() !== fechaLimiteISO) return;
    if (await yaSeEnvioHoy('ne_plazo_vencido')) return;

    const { anio, mes } = getMesHabilitado(new Date());
    const responsables = await contarPorResponsable(anio, mes);
    for (const r of responsables) {
      const mensaje = `Hoy vence el plazo de Nómina Electrónica. Tienes ${r.pendientes} pendiente${r.pendientes === 1 ? '' : 's'} y ${r.porRevisar} por revisar.`;
      await notificarUsuarios(io, [r.responsableId], 'ne_plazo_vencido', mensaje);
    }
    logger.info({ responsables: responsables.length }, 'Aviso de plazo vencido (Nómina Electrónica) enviado');
  } catch (err) {
    logger.error({ err }, 'Error enviando aviso de plazo vencido (Nómina Electrónica)');
  }
}

function initNEPlazoCron(io) {
  cron.schedule('0 8 * * *', () => {
    avisarMesHabilitado(io);
    avisarPlazoProximo(io);
    avisarPlazoVencido(io);
  });
  logger.info('Cron de avisos de Nómina Electrónica inicializado (diario 8am)');
}

module.exports = { initNEPlazoCron, avisarMesHabilitado, avisarPlazoProximo, avisarPlazoVencido, contarPorResponsable };
