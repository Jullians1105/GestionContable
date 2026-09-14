// Comparación heurística de nombres de empresa — extraído de dianController.js (donde nació
// para el chequeo de primera vinculación de empresa en Contabilidad, ver
// dianController.js#uploadDian) porque el directorio maestro de empresas también lo necesita
// para sugerir posibles duplicados entre catálogos (Fondo Emprender / Empresas Externas /
// Nómina Electrónica / Contabilidad).
// "ASOCIACION"/"FUNDACION" son tipo de figura jurídica, igual que "SAS"/"LTDA" — no una
// palabra que distinga una empresa de otra. Encontrado en datos reales del directorio maestro
// de empresas: 12 de las ~190 empresas empiezan por "ASOCIACION", así que sin este filtro
// cualquier par de asociaciones distintas salía sugerido como posible duplicado solo por
// compartir esa palabra (66 pares falsos positivos solo entre esas 12). "ASO" es la misma
// palabra abreviada, tal como aparece en varios nombres del catálogo (ej. "ASO. MUJERES...").
const PALABRAS_GENERICAS_RAZON_SOCIAL = new Set([
  'SAS', 'S.A.S', 'LTDA', 'LTDA.', 'SA', 'S.A', 'CIA', 'CIA.', 'COMPANIA', 'COMPAÑIA',
  'EU', 'E.U', 'ESP', 'E.S.P', 'Y', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'EN', 'CON',
  'ASOCIACION', 'ASOCIACIONES', 'ASO', 'FUNDACION', 'FUNDACIONES',
]);

const normalizarNombreSimple = (texto) =>
  String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const palabrasSignificativas = (nombre) =>
  normalizarNombreSimple(nombre).split(' ').filter((p) => p.length >= 3 && !PALABRAS_GENERICAS_RAZON_SOCIAL.has(p));

// true si comparten al menos una palabra significativa — heurística permisiva a propósito
// (nombres de catálogo vs. razón social del reporte pueden variar en orden, abreviaturas,
// sufijos legales), pensada solo para atrapar el caso evidente de "no tiene nada que ver".
const nombresSeParecen = (nombreA, nombreB) => {
  const palabrasA = new Set(palabrasSignificativas(nombreA));
  const palabrasB = palabrasSignificativas(nombreB);
  if (palabrasA.size === 0 || palabrasB.length === 0) return true; // sin datos suficientes, no bloquear
  return palabrasB.some((p) => palabrasA.has(p));
};

module.exports = { nombresSeParecen, palabrasSignificativas, normalizarNombreSimple };
