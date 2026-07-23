// Seguimiento Mensual (checklist, macroprocesos, impuestos) es de mes vencido:
// el mes en curso todavía no ha "vencido", así que el mes habilitado para
// editar es siempre el mes calendario anterior. Se calcula en cada request a
// partir de la fecha real — sin estado persistido ni botón de avanzar, a
// diferencia de Pagos (fondo_pagos_mes_actual), que sí es manual porque las
// jefas necesitan controlar cuándo se abre cada mes de pago.
function getMesVencidoHabilitado(now = new Date()) {
  const mesActual  = now.getMonth() + 1; // 1-12
  const anioActual = now.getFullYear();
  if (mesActual === 1) return { anio: anioActual - 1, mes: 12 };
  return { anio: anioActual, mes: mesActual - 1 };
}

function isMesHabilitado(anio, mes) {
  const { anio: anioHabilitado, mes: mesHabilitado } = getMesVencidoHabilitado();
  return (anio * 100 + mes) <= (anioHabilitado * 100 + mesHabilitado);
}

module.exports = { getMesVencidoHabilitado, isMesHabilitado };
