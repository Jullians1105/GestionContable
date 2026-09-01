// Regla de "mes habilitado" propia de Nómina Electrónica — DISTINTA de
// utils/mesVencido.js (día 23, compartida por Fondo Emprender/Empresas
// Externas): acá el mes habilitado es siempre el mes calendario anterior, y
// cambia justo el día 1 de cada mes (el 1 de octubre se habilita septiembre).
// No depende de un día de corte a mitad de mes porque el plazo real de la
// DIAN (primeros 10 días hábiles) se muestra aparte en ne_plazo — este mes
// habilitado es solo "qué mes se puede trabajar", no el plazo en sí.
function getMesHabilitado(now = new Date()) {
  const mesActual  = now.getMonth() + 1; // 1-12
  const anioActual = now.getFullYear();
  if (mesActual === 1) return { anio: anioActual - 1, mes: 12 };
  return { anio: anioActual, mes: mesActual - 1 };
}

function isMesHabilitado(anio, mes) {
  const { anio: anioHabilitado, mes: mesHabilitado } = getMesHabilitado();
  return (anio * 100 + mes) <= (anioHabilitado * 100 + mesHabilitado);
}

module.exports = { getMesHabilitado, isMesHabilitado };
