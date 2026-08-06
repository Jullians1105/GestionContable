// Fórmula de nómina compartida entre backend y el preview de frontend — una sola fuente
// evita la desincronización que ya ocurrió una vez con el SMMLV hardcodeado por separado.
// ESM real: el frontend lo importa de forma estática; el backend (CommonJS) lo consume
// vía `await import(...)` dentro de sus handlers async — no requiere plugins de bundling.

// Seguridad Social y Parafiscales — a cargo del empleador, se SUMAN al costo (no se
// descuentan del devengado como sí ocurre con los aportes que se le retienen al trabajador).
export const TASA_PENSION            = 0.12;
export const TASA_CAJA_COMPENSACION  = 0.04;

// Tarifas ARL por clase de riesgo (Decreto 1607 de 2002) — varía por trabajador según su
// labor, así que a diferencia de pensión/caja no hay una sola tarifa: quien genera el Excel
// tiene que elegir la clase antes de poder calcular el costo total.
export const TARIFAS_ARL = [0.522, 1.044, 2.436, 4.350, 6.960];

// Fracciones exactas (no redondeadas) — 15 días de vacaciones sobre 360 días/año = 1/24;
// prima y cesantías se causan sobre el año completo = 1/12 por mes. Con los porcentajes
// redondeados anteriores (0.0417 / 0.0833) el resultado se alejaba del real: para un
// trabajador con el mínimo (salario 1.750.905, auxilio 249.095) el documento soporte de
// nómina electrónica real da vacaciones=72.954, prima=cesantías=166.667, intereses=1.667 —
// solo calzan con 1/24 y 1/12 exactos.
export const TASA_VACACIONES          = 1 / 24;
export const TASA_PRIMA               = 1 / 12;
export const TASA_CESANTIAS           = 1 / 12;
export const TASA_INTERESES_CESANTIAS = 0.01;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Costo de nómina por empleado/mes = Devengado + Seguridad Social y Parafiscales.
// - Devengados: salario + auxilio de transporte (solo si salario <= 2 SMMLV) + vacaciones +
//   prima + cesantías + intereses de cesantías (todo lo que efectivamente se le paga/liquida
//   al trabajador ese período, no una provisión aparte).
// - Seguridad Social y Parafiscales: pensión + ARL + caja de compensación, sobre salario —
//   a cargo del empleador, así que se SUMAN al costo (a diferencia de lo que se le retiene
//   al trabajador, que no es costo adicional para la empresa, solo redirige parte del
//   devengado).
export function calcularNomina({ salario, smmlv, auxilioTransporte, tarifaArl }) {
  if (!TARIFAS_ARL.includes(tarifaArl)) {
    throw new Error(`tarifaArl inválida: debe ser una de ${TARIFAS_ARL.join(', ')}`);
  }

  const auxilioAplica = salario <= 2 * smmlv;
  const auxilio = auxilioAplica ? auxilioTransporte : 0;
  const baseCesantiasPrima = salario + auxilio;

  const vacaciones         = salario * TASA_VACACIONES;
  const prima               = baseCesantiasPrima * TASA_PRIMA;
  const cesantias            = baseCesantiasPrima * TASA_CESANTIAS;
  const interesesCesantias  = cesantias * TASA_INTERESES_CESANTIAS;

  const devengado = round2(salario + auxilio + vacaciones + prima + cesantias + interesesCesantias);

  const pension          = salario * TASA_PENSION;
  const arl              = salario * (tarifaArl / 100);
  const cajaCompensacion = salario * TASA_CAJA_COMPENSACION;

  const aportesPatronales = round2(pension + arl + cajaCompensacion);
  const costoMes          = round2(devengado + aportesPatronales);

  return {
    auxilioAplica,
    auxilio,
    devengadoDetalle: { vacaciones, prima, cesantias, interesesCesantias },
    devengado,
    aportesDetalle: { pension, arl, cajaCompensacion },
    aportesPatronales,
    costoMes,
  };
}

// costoTotal = empleados × meses × costoMes, redondeado
export function calcularCostoTotal({ empleados, meses, costoMes }) {
  return round2(empleados * meses * costoMes);
}

// Ventas Netas = Ventas Brutas (sin IVA/INC) − Devoluciones (sin IVA/INC). Es la base de la
// autorretención en la renta — misma fórmula que usa el backend en calcularResumenPeriodo,
// factorizada acá para que el preview de Nómina y la pantalla de Exportación no la
// reimplementen cada una por su lado (evita que diverjan, como ya pasó una vez con el SMMLV
// hardcodeado por separado — ver comentario arriba).
export function calcularVentasNetas(calculos) {
  if (!calculos) return 0;
  const ventasBrutoSinIva      = (calculos.ventasBruto ?? 0) - (calculos.ivaGenerado ?? 0) - (calculos.incGenerado ?? 0);
  const devolucionVentasSinIva = (calculos.devolucionVentas ?? 0) - (calculos.ivaDevolucionVentas ?? 0) - (calculos.incDevolucionVentas ?? 0);
  return ventasBrutoSinIva - devolucionVentasSinIva;
}
