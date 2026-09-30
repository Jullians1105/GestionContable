// "En espera" (estado interno no_aplica, gris) se arrastra al mes siguiente: si
// una empresa no tiene NADA marcado en el mes pedido (sin fila en ne_meses) y
// su último mes con fila quedó en no_aplica, ese mes sale también en gris con
// la misma nota — así quien abre el mes nuevo ve de una vez qué no se pudo
// hacer y por qué, sin revisar empresa por empresa. No se guarda nada: se
// calcula al consultar, así que no hay proceso el día 1 ni filas "fantasma".
// En cuanto alguien marca algo en el mes nuevo se crea la fila (sembrada con
// el estado/nota heredados, ver neMesesController.updateMes) y esa manda. Si
// sigue en gris, el mes siguiente lo vuelve a arrastrar, hasta que se resuelva.
//
// Lo usan Nómina Electrónica (alias e/m/p, por defecto) y las celdas de
// "Nómina electrónica" de Fondo Emprender y Empresas Externas, que leen
// ne_meses con otros alias (ne/nm/nmp) — por eso los alias son parámetro.
//
// Requiere `emp` (ne_empresas) y `mes` (ne_meses del mes pedido, LEFT JOIN) ya
// en el FROM. Expone `prev.estado`, `prev.nota`, `prev.anio` y `prev.mes` del
// último mes anterior con fila.
const joinMesPrevio = (anioParam, mesParam, { emp = 'e', mes = 'm', prev = 'p' } = {}) => `
  LEFT JOIN LATERAL (
    SELECT pm.estado, pm.nota, pm.anio, pm.mes
    FROM ne_meses pm
    WHERE pm.empresa_id = ${emp}.id
      AND (pm.anio * 100 + pm.mes) < (${anioParam}::int * 100 + ${mesParam}::int)
    ORDER BY pm.anio DESC, pm.mes DESC
    LIMIT 1
  ) ${prev} ON ${mes}.id IS NULL`;

const sqlHeredada = ({ mes = 'm', prev = 'p' } = {}) =>
  `(${mes}.id IS NULL AND ${prev}.estado = 'no_aplica')`;

const SQL_HEREDADA = sqlHeredada();

// Estado y nota efectivos del mes (los propios, o los heredados si aplica),
// con los alias de columna que ya usan los controladores de Fondo/Externas.
const selectNeEfectivo = ({ mes = 'nm', prev = 'nmp' } = {}) => {
  const her = sqlHeredada({ mes, prev });
  return `CASE WHEN ${her} THEN 'no_aplica' ELSE ${mes}.estado END AS ne_estado,
              CASE WHEN ${her} THEN ${prev}.nota ELSE ${mes}.nota END AS ne_nota,
              CASE WHEN ${her} THEN ${prev}.anio END AS ne_heredada_anio,
              CASE WHEN ${her} THEN ${prev}.mes END AS ne_heredada_mes`;
};

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// "Observación de agosto: <nota>" — lo que ven en Fondo/Externas (celda de
// solo lectura) cuando la nota viene de un mes anterior. Si el año es otro
// también se dice ("agosto de 2025") para que no se confunda con el actual.
function notaConOrigen(nota, heredadaAnio, heredadaMes, anioPedido) {
  if (!heredadaMes) return nota;
  const mesTxt = MESES_ES[heredadaMes - 1];
  const cuando = heredadaAnio !== anioPedido ? `${mesTxt} de ${heredadaAnio}` : mesTxt;
  return nota?.trim() ? `Observación de ${cuando}: ${nota.trim()}` : `En espera desde ${cuando}`;
}

module.exports = { joinMesPrevio, sqlHeredada, SQL_HEREDADA, selectNeEfectivo, notaConOrigen };
