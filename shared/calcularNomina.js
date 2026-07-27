// Fórmula de nómina compartida entre backend y el preview de frontend — una sola fuente
// evita la desincronización que ya ocurrió una vez con el SMMLV hardcodeado por separado.
// ESM real: el frontend lo importa de forma estática; el backend (CommonJS) lo consume
// vía `await import(...)` dentro de sus handlers async — no requiere plugins de bundling.

export const TASA_PENSION = 0.04;
export const TASA_SALUD   = 0.04;
export const TASA_APORTES = TASA_PENSION + TASA_SALUD; // 8 %

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

// Costo de nómina por empleado/mes — replica el "Documento Soporte de Pago de Nómina
// Electrónica" real: Total = Devengados − Deducciones.
// - Devengados: salario + auxilio de transporte (solo si salario <= 2 SMMLV) + vacaciones +
//   prima + cesantías + intereses de cesantías (todo lo que efectivamente se le paga/liquida
//   al trabajador ese período, no una provisión aparte).
// - Deducciones: pensión + salud, sobre salario (lo que se le retiene al trabajador).
export function calcularNomina({ salario, smmlv, auxilioTransporte }) {
  const auxilioAplica = salario <= 2 * smmlv;
  const auxilio = auxilioAplica ? auxilioTransporte : 0;
  const baseCesantiasPrima = salario + auxilio;

  const vacaciones         = salario * TASA_VACACIONES;
  const prima               = baseCesantiasPrima * TASA_PRIMA;
  const cesantias            = baseCesantiasPrima * TASA_CESANTIAS;
  const interesesCesantias  = cesantias * TASA_INTERESES_CESANTIAS;

  const devengado    = round2(salario + auxilio + vacaciones + prima + cesantias + interesesCesantias);
  const deducciones  = round2(salario * TASA_APORTES);
  const costoMes     = round2(devengado - deducciones);

  return {
    auxilioAplica,
    auxilio,
    devengadoDetalle: { vacaciones, prima, cesantias, interesesCesantias },
    devengado,
    deducciones,
    costoMes,
  };
}

// costoTotal = empleados × meses × costoMes, redondeado
export function calcularCostoTotal({ empleados, meses, costoMes }) {
  return round2(empleados * meses * costoMes);
}
