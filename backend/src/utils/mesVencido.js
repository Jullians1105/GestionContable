// Seguimiento Mensual (checklist, macroprocesos, impuestos) es de mes vencido,
// pero el mes en curso se da por "vencido" anticipadamente desde el día 23:
// del 1 al 22 el mes habilitado es el calendario anterior; del 23 en adelante
// el mes habilitado pasa a ser el mes en curso. Se calcula en cada request a
// partir de la fecha real — sin estado persistido ni botón de avanzar, a
// diferencia de Pagos (fondo_pagos_mes_actual), que sí es manual porque las
// jefas necesitan controlar cuándo se abre cada mes de pago.
const DIA_CORTE = 23;

function getMesVencidoHabilitado(now = new Date()) {
  const diaActual  = now.getDate();
  const mesActual  = now.getMonth() + 1; // 1-12
  const anioActual = now.getFullYear();
  if (diaActual >= DIA_CORTE) return { anio: anioActual, mes: mesActual };
  if (mesActual === 1) return { anio: anioActual - 1, mes: 12 };
  return { anio: anioActual, mes: mesActual - 1 };
}

function isMesHabilitado(anio, mes) {
  const { anio: anioHabilitado, mes: mesHabilitado } = getMesVencidoHabilitado();
  return (anio * 100 + mes) <= (anioHabilitado * 100 + mesHabilitado);
}

module.exports = { getMesVencidoHabilitado, isMesHabilitado };
