// Limpieza diaria de borradores vencidos — `calculo_borradores` (wizard DIAN de Contabilidad) y
// `exogenas_borradores` (Exógenas) guardan el Excel original completo (BYTEA) y tienen
// `expires_at` a 14 días (ver migraciones 013_calculo_borradores y 041_exogenas_borradores),
// pero nada borraba nunca lo que ya venció — crecían para siempre. Encontrado en la auditoría de
// Contabilidad/Consolidado/Exógenas (2026-09-28), agregado a pedido explícito del usuario.
const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../utils/logger');

async function limpiarBorradoresVencidos() {
  try {
    const { rowCount: calculo } = await db.query('DELETE FROM calculo_borradores WHERE expires_at < NOW()');
    const { rowCount: exogenas } = await db.query('DELETE FROM exogenas_borradores WHERE expires_at < NOW()');
    if (calculo > 0 || exogenas > 0) {
      logger.info({ calculoBorradores: calculo, exogenasBorradores: exogenas }, 'Borradores vencidos eliminados');
    }
  } catch (err) {
    logger.error({ err }, 'Error eliminando borradores vencidos');
  }
}

function initBorradorCleanupCron() {
  // El servidor no queda encendido 24/7 (se apaga fuera de horario de oficina) — un cron a una
  // hora fija puede simplemente no correr nunca si el proceso no está vivo en ese instante,
  // node-cron no "recupera" ejecuciones perdidas. Por eso corre una vez apenas arranca el
  // backend (cubre cualquier horario real de encendido/deploy) y además queda programado a una
  // hora de oficina (10am) como red de respaldo, por si el proceso llega a quedar corriendo
  // varios días seguidos sin reiniciarse.
  limpiarBorradoresVencidos();
  cron.schedule('0 10 * * *', () => {
    limpiarBorradoresVencidos();
  });
  logger.info('Cron de limpieza de borradores vencidos inicializado (al arrancar + diario 10am)');
}

module.exports = { initBorradorCleanupCron, limpiarBorradoresVencidos };
