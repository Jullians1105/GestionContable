// Fórmula de nómina compartida entre backend y el preview de frontend — una sola fuente
// evita la desincronización que ya ocurrió una vez con el SMMLV hardcodeado por separado.
// ESM real: el frontend lo importa de forma estática; el backend (CommonJS) lo consume
// vía `await import(...)` dentro de sus handlers async — no requiere plugins de bundling.

export const TASA_PENSION = 0.12;
export const TASA_ARL      = 0.0052;
export const TASA_CAJA     = 0.04;
export const TASA_APORTES  = TASA_PENSION + TASA_ARL + TASA_CAJA; // 16,52 %

export const TASA_VACACIONES          = 0.0417;
export const TASA_PRIMA               = 0.0833;
export const TASA_CESANTIAS           = 0.0833;
export const TASA_INTERESES_CESANTIAS = 0.01;

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Costo de nómina por empleado/mes.
// - devengado = salario + auxilio de transporte (solo si salario <= 2 SMMLV)
// - aportesEmpresa (pensión + ARL + caja): solo sobre salario
// - provisiones: vacaciones sobre salario; prima/cesantías (y sus intereses) sobre salario+auxilio
export function calcularNomina({ salario, smmlv, auxilioTransporte }) {
  const auxilioAplica = salario <= 2 * smmlv;
  const auxilio = auxilioAplica ? auxilioTransporte : 0;
  const baseCesantiasPrima = salario + auxilio;

  const devengado      = salario + auxilio;
  const aportesEmpresa = round2(salario * TASA_APORTES);

  const vacaciones         = salario * TASA_VACACIONES;
  const prima               = baseCesantiasPrima * TASA_PRIMA;
  const cesantias            = baseCesantiasPrima * TASA_CESANTIAS;
  const interesesCesantias  = cesantias * TASA_INTERESES_CESANTIAS;
  const provisiones = round2(vacaciones + prima + cesantias + interesesCesantias);

  const costoMes = devengado + aportesEmpresa + provisiones;

  return {
    auxilioAplica,
    auxilio,
    devengado,
    aportesEmpresa,
    provisionesDetalle: { vacaciones, prima, cesantias, interesesCesantias },
    provisiones,
    costoMes,
  };
}

// costoTotal = empleados × meses × costoMes, redondeado
export function calcularCostoTotal({ empleados, meses, costoMes }) {
  return round2(empleados * meses * costoMes);
}
