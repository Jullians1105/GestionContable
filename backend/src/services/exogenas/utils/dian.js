// Utilidades de negocio compartidas por los formatos de Exógenas, portadas 1:1 desde
// exogena_1005_app.py (docs/arqExogena.md §6.1-6.2) — mismo algoritmo, mismos nombres.

const PESOS_DV = [71, 67, 59, 53, 47, 43, 41, 37, 29, 23, 19, 17, 13, 7, 3];

const EMPRESA_KEYWORDS = [
  'SAS', 'S.A.S', 'LTDA', 'LTDA.', 'SA', 'S.A', 'CIA', 'CIA.', 'COMPANIA', 'COMPAÑIA',
  'EU', 'E.U', 'ESP', 'E.S.P', 'IPS', 'EPS', 'IE', 'I.E', 'ONG', 'FUNDACION', 'CORPORACION',
  'COOPERATIVA', 'ASOCIACION', 'SOCIEDAD', 'EMPRESA', 'INSTITUCION', 'UNIVERSIDAD',
  'COLEGIO', 'CONSORCIO', 'UNION TEMPORAL', 'DIAN', 'ALCALDIA', 'GOBERNACION',
  'MUNICIPIO', 'DEPARTAMENTO', 'MINISTERIO', 'SUPERINTENDENCIA', 'HOSPITAL',
  'CLINICA', 'CENTRO', 'GRUPO', 'HOLDING', 'INVERSIONES', 'CONSTRUCTORA',
];

const quitarAcentos = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

const normalizarTexto = (texto) =>
  quitarAcentos(texto).toUpperCase().trim().replace(/\s+/g, ' ');

const limpiarIdentificacion = (valor) => String(valor ?? '').replace(/\D/g, '');

// Redondeo ROUND_HALF_UP a 2 decimales — para montos siempre positivos (IVA), equivale a
// Math.round de JS. Consistente con la convención contable esperada por la DIAN.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// Algoritmo oficial DIAN módulo 11 para el dígito de verificación del NIT.
function calcularDV(numero) {
  let digitos = limpiarIdentificacion(numero);
  if (digitos.length > 15) digitos = digitos.slice(-15);
  digitos = digitos.padStart(15, '0');

  let total = 0;
  for (let i = 0; i < 15; i++) {
    total += Number(digitos[i]) * PESOS_DV[i];
  }
  const residuo = total % 11;
  return residuo <= 1 ? residuo : 11 - residuo;
}

// El TOKEN no trae columna explícita de tipo de identificación (NIT vs. cédula) — se infiere.
function inferirTipoDocumento(identificacion, nombre) {
  const nombreNorm = ` ${normalizarTexto(nombre)} `;
  const match = EMPRESA_KEYWORDS.some((kw) => nombreNorm.includes(` ${kw} `));
  if (match) return 31;

  const digitos = limpiarIdentificacion(identificacion);
  if (digitos.length >= 9 && (digitos[0] === '8' || digitos[0] === '9')) return 31;

  return 13;
}

const FRASES_NOTA_CREDITO = ['NOTA DE CREDITO', 'NOTA CREDITO', 'NOTA DE AJUSTE CREDITO'];

function esNotaCredito(tipoDocumentoExcel) {
  const norm = normalizarTexto(tipoDocumentoExcel);
  return FRASES_NOTA_CREDITO.some((frase) => norm.includes(frase));
}

// Separa un nombre completo de persona natural en NOM1/NOM2/APL1/APL2 para los formatos de
// exógena (el TOKEN solo trae el nombre como texto libre en una sola columna). Regla dada
// por el usuario: por lo general el orden es "dos nombres, luego apellidos" — se toman las
// primeras dos palabras como nombres y el resto como apellidos (el resto se une completo en
// APL2 si sobran más de 2 palabras, para no perder información con apellidos compuestos).
// No hay forma de partir un nombre en texto libre con 100% de certeza (apellidos/nombres
// compuestos, orden atípico) — esta es una heurística, no una regla exacta.
function separarNombrePersona(nombreCompleto) {
  const palabras = normalizarTexto(nombreCompleto).split(' ').filter(Boolean);

  if (palabras.length >= 4) {
    return { nom1: palabras[0], nom2: palabras[1], apl1: palabras[2], apl2: palabras.slice(3).join(' ') };
  }
  if (palabras.length === 3) {
    return { nom1: palabras[0], nom2: palabras[1], apl1: palabras[2], apl2: '' };
  }
  if (palabras.length === 2) {
    return { nom1: palabras[0], nom2: '', apl1: palabras[1], apl2: '' };
  }
  return { nom1: palabras[0] ?? '', nom2: '', apl1: '', apl2: '' };
}

module.exports = {
  quitarAcentos,
  normalizarTexto,
  limpiarIdentificacion,
  round2,
  calcularDV,
  inferirTipoDocumento,
  esNotaCredito,
  separarNombrePersona,
};
