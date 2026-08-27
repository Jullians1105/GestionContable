// Extracción de dirección/municipio/departamento de terceros a partir del PDF de factura
// electrónica generado por la DIAN (representación gráfica del catálogo público
// catalogo-vpfe.dian.gov.co). Alimenta la tabla `terceros` — deliberadamente NO vive dentro de
// services/exogenas/: aunque nació para resolver el formato 1001, es una base de datos de
// terceros de uso general (cualquier módulo puede consultarla), no algo propio de Exógenas.
// Ver docs/PLANEACION_EXTRACCION_DATOS_FACTURAS.md.
//
// El layout es SIEMPRE el mismo (lo genera la DIAN, no el sistema de facturación del emisor),
// confirmado contra una factura real de muestra — por eso alcanza con regex fijas, sin OCR ni
// soporte de N formatos distintos.
const pdfParse = require('pdf-parse');
const { normalizarTexto, quitarAcentos, limpiarIdentificacion } = require('../exogenas/utils/dian');
const { MUNICIPIOS_DANE } = require('./data/municipiosDane');
const { DEPARTAMENTOS_DANE } = require('./data/departamentosDane');
const { NOMENCLATURA_OFICIAL, ALIAS_COMUNES } = require('./data/nomenclaturaDian');

// Reglas de la DIAN para archivos estructurados de exógenas: solo A-Z sin tildes ni Ñ, dígitos,
// espacios, puntos y comas — cualquier otro carácter (#, $, %, guiones, etc.) puede corromper la
// lectura del archivo o generar rechazo automático. Los símbolos removidos se reemplazan por
// espacio (no se borran sin más) para no pegar dos números que antes estaban separados por un
// "-" o un "#" (ej. "8-32" no debe terminar en "832"). `permitirExtra` deja pasar caracteres
// adicionales sin tocar — usado solo en razón social, donde el usuario pidió conservar el "&"
// (frecuente en nombres de empresa: "GARCÍA & ASOCIADOS"), aunque en sentido estricto tampoco
// esté en la lista permitida por la DIAN.
function limpiarParaDian(texto, permitirExtra = '') {
  if (!texto) return texto;
  const patron = new RegExp(`[^A-Z0-9.,\\s${permitirExtra}]`, 'g');
  return quitarAcentos(texto)
    .toUpperCase()
    .replace(patron, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Limpieza adicional sobre normalizarTexto para comparar lugares: quita paréntesis (ej.
// "Cali (Valle)"), comas/puntos, y el sufijo "D.C."/"D C" de Bogotá — así "Bogotá", "Bogotá,
// D.C." y "Bogotá D.C." quedan todos en la misma clave "BOGOTA" sin necesitar un alias
// hardcodeado por cada variante de escritura.
function normalizarLugar(texto) {
  return normalizarTexto(texto)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\bD\s*C\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const MUNICIPIOS_POR_NOMBRE = new Map();
for (const [codigo, nombre] of MUNICIPIOS_DANE) {
  const key = normalizarLugar(nombre);
  if (!MUNICIPIOS_POR_NOMBRE.has(key)) MUNICIPIOS_POR_NOMBRE.set(key, []);
  MUNICIPIOS_POR_NOMBRE.get(key).push(codigo);
}
// Lista plana para búsqueda por similitud (ver mejorCoincidenciaFuzzy) cuando no hay match
// exacto — ej. errores de tipeo en el municipio de la factura.
const MUNICIPIOS_NORMALIZADOS = MUNICIPIOS_DANE.map(([codigo, nombre]) => [codigo, normalizarLugar(nombre)]);
const NOMBRE_MUNICIPIO_POR_CODIGO = new Map(MUNICIPIOS_DANE.map(([codigo, nombre]) => [codigo, nombre]));

const DEPARTAMENTOS_POR_NOMBRE = new Map(
  DEPARTAMENTOS_DANE.map(([codigo, nombre]) => [normalizarLugar(nombre), codigo])
);
const NOMBRE_DEPARTAMENTO_POR_CODIGO = new Map(DEPARTAMENTOS_DANE);

// Bogotá se organiza en localidades (Kennedy, Suba, Chapinero...), que NO son municipios propios
// en DIVIPOLA — cuando la factura trae la localidad en vez de "Bogotá" en el campo Municipio, se
// resuelve igual a 11001. Lista fija de las 20 localidades (información pública estable, no sale
// del PDF de municipios del usuario — a diferencia de esa tabla, esta no tiene una fuente oficial
// puntual que citar, pero la división de Bogotá en localidades no cambia).
const LOCALIDADES_BOGOTA = new Set([
  'USAQUEN', 'CHAPINERO', 'SANTA FE', 'SAN CRISTOBAL', 'USME', 'TUNJUELITO', 'BOSA', 'KENNEDY',
  'FONTIBON', 'ENGATIVA', 'SUBA', 'BARRIOS UNIDOS', 'TEUSAQUILLO', 'LOS MARTIRES', 'MARTIRES',
  'ANTONIO NARINO', 'PUENTE ARANDA', 'LA CANDELARIA', 'CANDELARIA', 'RAFAEL URIBE URIBE',
  'CIUDAD BOLIVAR', 'SUMAPAZ',
]);
const CODIGO_BOGOTA = '11001';

// Distancia de edición clásica (inserciones/borrados/sustituciones) — usada para tolerar errores
// de tipeo al comparar el municipio de la factura contra el catálogo oficial.
function distanciaLevenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + costo);
    }
    anterior = actual;
  }
  return anterior[b.length];
}

// Tolera hasta ~20% de caracteres distintos (mínimo 1) — suficiente para un tipeo o dos, sin
// abrir la puerta a que un municipio completamente distinto pase por "coincidencia". Si hay
// empate entre dos candidatos igual de cercanos, no se puede elegir uno con confianza — se deja
// sin mapear en vez de adivinar.
function mejorCoincidenciaFuzzy(municipioNormalizado, candidatos) {
  let mejorCodigo = null;
  let mejorDistancia = Infinity;
  let empatado = false;

  for (const [codigo, nombreNorm] of candidatos) {
    const d = distanciaLevenshtein(municipioNormalizado, nombreNorm);
    if (d < mejorDistancia) {
      mejorDistancia = d;
      mejorCodigo = codigo;
      empatado = false;
    } else if (d === mejorDistancia) {
      empatado = true;
    }
  }

  const umbral = Math.max(1, Math.round(municipioNormalizado.length * 0.2));
  return (mejorCodigo && !empatado && mejorDistancia <= umbral) ? mejorCodigo : null;
}

// Mapa único forma-reconocida -> código, combinando la tabla oficial (formas de una o varias
// palabras, ej. "CENTRO COMERCIAL" -> CC) y los alias comunes. Frases de varias palabras se
// intentan primero (ver normalizarDireccion) para no partir "Avenida calle" en "AV" + palabra
// suelta cuando debía mapear directo a "AC".
const NOMENCLATURA_POR_FORMA = new Map();
for (const [codigo, forma] of [...NOMENCLATURA_OFICIAL, ...ALIAS_COMUNES]) {
  NOMENCLATURA_POR_FORMA.set(normalizarTexto(forma), codigo);
}
const MAX_PALABRAS_FRASE = Math.max(
  ...[...NOMENCLATURA_OFICIAL, ...ALIAS_COMUNES].map(([, forma]) => forma.trim().split(/\s+/).length)
);

// Transcribe una dirección de texto libre a la nomenclatura DIAN: reemplaza palabras/frases
// reconocidas por su código (CALLE -> CL, AVENIDA CARRERA -> AK, Vda -> VRD...) y deja el resto
// tal cual vino, solo en mayúscula — no se adivinan palabras no reconocidas, para no
// arriesgarse a alterar mal una dirección real. Idempotente en la práctica: un código ya escrito
// (ej. "CL") no matchea ninguna forma completa de la tabla, así que cae al mismo camino de
// "dejar tal cual, en mayúscula" y el resultado no cambia.
function normalizarDireccion(direccion) {
  if (!direccion) return direccion;

  const original = direccion.trim().split(/\s+/);
  const claves = normalizarTexto(direccion).split(/\s+/);
  const salida = [];

  let i = 0;
  while (i < original.length) {
    let coincidio = false;
    for (let largo = Math.min(MAX_PALABRAS_FRASE, original.length - i); largo >= 1; largo--) {
      const frase = claves.slice(i, i + largo).join(' ');
      const codigo = NOMENCLATURA_POR_FORMA.get(frase);
      if (codigo) {
        salida.push(codigo);
        i += largo;
        coincidio = true;
        break;
      }
    }
    if (!coincidio) {
      salida.push(original[i].toUpperCase());
      i += 1;
    }
  }

  return salida.join(' ');
}

// Etiquetas del layout fijo — se usan como "topes" para saber dónde termina el valor de un
// campo. El PDF es de 2 columnas; en el texto plano quedan pegadas sin separador cuando ambas
// tienen contenido en la misma fila (ej. "Nit del Emisor:   901939874País:   Colombia").
const ETIQUETAS = [
  'Nombre Comercial', 'Nit del Emisor', 'País', 'Tipo de Contribuyente', 'Departamento',
  'Régimen Fiscal', 'Régimen fiscal', 'Municipio\\s*/\\s*Ciudad', 'Responsabilidad tributaria',
  'Dirección', 'Actividad Económica', 'Teléfono\\s*/\\s*Móvil', 'Correo', 'Tipo de Documento',
  'Número Documento', 'Datos del',
];
const TOPE = ETIQUETAS.map((e) => `${e}\\s*:`).join('|');

function extraerCampo(texto, etiqueta) {
  const m = texto.match(new RegExp(`${etiqueta}\\s*:\\s*([\\s\\S]*?)(?=${TOPE}|$)`));
  if (!m) return null;
  return m[1].replace(/\s+/g, ' ').trim() || null;
}

function extraerDigitos(texto, etiqueta) {
  const m = texto.match(new RegExp(`${etiqueta}\\s*:\\s*(\\d+)`));
  return m ? m[1] : null;
}

function extraerParte(texto) {
  const identificacion = limpiarIdentificacion(
    extraerDigitos(texto, 'Nit del Emisor') ?? extraerDigitos(texto, 'Número Documento')
  );
  const razonSocial = extraerCampo(texto, 'Razón Social') ?? extraerCampo(texto, 'Nombre o Razón Social');
  const departamento = extraerCampo(texto, 'Departamento');
  const municipio = extraerCampo(texto, 'Municipio\\s*/\\s*Ciudad');
  const direccion = extraerCampo(texto, 'Dirección');

  if (!identificacion || !razonSocial) return null;
  return { identificacion, razonSocial, departamento, municipio, direccion };
}

// Nombres completos/ceremoniales que DANE registra con un nombre más corto en su propia tabla
// (ej. Cúcuta figura en el catálogo oficial solo como "CÚCUTA", no como "San José de Cúcuta", su
// nombre legal completo — caso real visto en varias facturas de Norte de Santander). Igual que
// ALIAS_COMUNES, esta lista es criterio propio a partir de casos reales, no sale de ningún
// documento oficial que el usuario haya pasado — se espera ir ampliándola con lo que aparezca.
const NOMBRES_COMPLETOS_MUNICIPIO = new Map([
  ['SAN JOSE DE CUCUTA', 'CUCUTA'],
  ['SANTIAGO DE CALI', 'CALI'],
  ['SAN SEBASTIAN DE MARIQUITA', 'MARIQUITA'],
]);

// Ruido frecuente encontrado en el campo "Municipio / Ciudad" de facturas reales:
//   - Nombre completo/ceremonial en vez del nombre corto que usa la tabla oficial (ver
//     NOMBRES_COMPLETOS_MUNICIPIO arriba).
//   - El nombre del departamento pegado al final (ej. "Madrid Cundinamarca" en vez de solo
//     "Madrid") — pasa cuando quien llenó el RUT repitió el departamento en el campo de
//     municipio. Se quita comparando contra el catálogo oficial completo de departamentos, no
//     solo el que trae la factura en su propio campo "Departamento" (que puede venir mal
//     diligenciado, como en este caso real: decía "Bogotá" y el municipio real era en
//     Cundinamarca).
// El prefijo "Localidad ..." (ej. "Localidad Kennedy") NO se limpia acá — se resuelve aparte en
// mapearCodigoDane, antes de esta función, porque "localidad" es terminología exclusiva de
// Bogotá y decide el resultado por sí sola (ver comentario ahí).
function limpiarRuidoMunicipio(municipioNorm) {
  let limpio = municipioNorm.replace(/^CORREGIMIENTO\s+/, '');
  limpio = NOMBRES_COMPLETOS_MUNICIPIO.get(limpio) ?? limpio;
  for (const [, nombreDepto] of DEPARTAMENTOS_DANE) {
    const deptoNorm = normalizarLugar(nombreDepto);
    if (limpio !== deptoNorm && limpio.endsWith(` ${deptoNorm}`)) {
      limpio = limpio.slice(0, -(deptoNorm.length + 1)).trim();
      break;
    }
  }
  return limpio;
}

function conNombres(codigoMunicipio) {
  if (!codigoMunicipio) return { nombreMunicipio: null, nombreDepartamento: null };
  const codigoDepto = codigoMunicipio.slice(0, 2);
  return {
    nombreMunicipio: NOMBRE_MUNICIPIO_POR_CODIGO.get(codigoMunicipio) ?? null,
    nombreDepartamento: NOMBRE_DEPARTAMENTO_POR_CODIGO.get(codigoDepto) ?? null,
  };
}

// Resuelve el código DANE del municipio/departamento comparando el texto de la factura contra el
// catálogo oficial, en 3 pasos (del más al menos confiable):
//   1. Localidad de Bogotá (Kennedy, Suba...) -> Bogotá directo, sin ambigüedad posible.
//   2. Coincidencia exacta (ya normalizada — ver normalizarLugar) contra el nombre de municipio.
//      La gran mayoría son únicos a nivel nacional y se resuelven así. Si el nombre se repite en
//      más de un departamento (~6% de los casos, ej. "SAN FRANCISCO"), se desambigua con el
//      nombre del departamento que trae la misma factura.
//   3. Si no hubo coincidencia exacta, se prueba por similitud (tolera tipeos) — restringida al
//      departamento cuando se lo pudo reconocer, para no arriesgar un match cruzado entre
//      departamentos distintos por una coincidencia de nombre casual.
// Cuando SÍ hay coincidencia (por cualquiera de los 3 caminos), se devuelve también el nombre
// oficial de municipio/departamento tal como lo escribe la DIAN, para guardar ese en vez del
// texto libre de la factura. Si nada calza con confianza, queda pendienteDesambiguar/sin mapear
// en vez de adivinar.
function mapearCodigoDane(departamento, municipio) {
  const vacio = { codigoMunicipio: null, codigoDepartamento: null, nombreMunicipio: null, nombreDepartamento: null, ambiguo: false };
  if (!municipio) return vacio;

  const municipioSinLimpiar = normalizarLugar(municipio);
  const departamentoNorm = departamento ? normalizarLugar(departamento) : null;
  const codigoDeptoEsperado = departamentoNorm ? DEPARTAMENTOS_POR_NOMBRE.get(departamentoNorm) : null;

  // "Localidad" es terminología exclusiva de la división administrativa de Bogotá — ningún otro
  // municipio de Colombia la usa para sus propias subdivisiones. Si el texto empieza así, es
  // Bogotá sin importar qué siga, aunque esa palabra coincida por casualidad con el nombre de un
  // municipio real en otro departamento (caso real: "Localidad Santa Bárbara" — "Santa Bárbara"
  // sí es un municipio real en Antioquia/Nariño/Santander, pero acá es un BARRIO de Bogotá mal
  // llamado "localidad", no ese municipio). Por eso este chequeo va ANTES de limpiarRuidoMunicipio
  // (que ya no toca el prefijo "Localidad") y del resto de la resolución por nombre.
  if (municipioSinLimpiar.startsWith('LOCALIDAD ') || LOCALIDADES_BOGOTA.has(municipioSinLimpiar) || municipioSinLimpiar === 'BOGOTA') {
    return { codigoMunicipio: CODIGO_BOGOTA, codigoDepartamento: '11', ...conNombres(CODIGO_BOGOTA), ambiguo: false };
  }

  const municipioNorm = limpiarRuidoMunicipio(municipioSinLimpiar);

  const candidatos = MUNICIPIOS_POR_NOMBRE.get(municipioNorm) ?? [];
  if (candidatos.length === 1) {
    const [codigo] = candidatos;
    return { codigoMunicipio: codigo, codigoDepartamento: codigo.slice(0, 2), ...conNombres(codigo), ambiguo: false };
  }
  if (candidatos.length > 1) {
    const match = codigoDeptoEsperado && candidatos.find((c) => c.startsWith(codigoDeptoEsperado));
    if (match) return { codigoMunicipio: match, codigoDepartamento: codigoDeptoEsperado, ...conNombres(match), ambiguo: false };
    return { ...vacio, ambiguo: true };
  }

  // Sin coincidencia exacta: se intenta por similitud, restringido al departamento si se
  // reconoció (así un tipeo en "Malambo" no puede terminar matcheando por casualidad un
  // municipio de otro departamento con nombre parecido).
  const pool = codigoDeptoEsperado
    ? MUNICIPIOS_NORMALIZADOS.filter(([c]) => c.startsWith(codigoDeptoEsperado))
    : MUNICIPIOS_NORMALIZADOS;
  const codigoFuzzy = mejorCoincidenciaFuzzy(municipioNorm, pool);
  if (codigoFuzzy) {
    return { codigoMunicipio: codigoFuzzy, codigoDepartamento: codigoFuzzy.slice(0, 2), ...conNombres(codigoFuzzy), ambiguo: false };
  }

  return vacio;
}

function conCodigoDane(p) {
  if (!p) return null;
  const { codigoMunicipio, codigoDepartamento, nombreMunicipio, nombreDepartamento, ambiguo } =
    mapearCodigoDane(p.departamento, p.municipio);
  return {
    nit: p.identificacion,
    razonSocial: limpiarParaDian(p.razonSocial, '&'),
    direccion: limpiarParaDian(normalizarDireccion(p.direccion)),
    // Si hubo coincidencia con el catálogo oficial, se guarda el nombre tal como lo escribe la
    // DIAN (pedido del usuario) — si no, se deja el texto de la factura tal cual, limpio.
    municipio: limpiarParaDian(nombreMunicipio ?? p.municipio),
    codigoMunicipioDane: codigoMunicipio,
    departamento: limpiarParaDian(nombreDepartamento ?? p.departamento),
    codigoDepartamentoDane: codigoDepartamento,
    pendienteDesambiguar: ambiguo,
  };
}

// Distingue "documento intencionalmente descartado" (nota crédito, documento soporte — el
// usuario pidió explícitamente no procesarlos) de un error real (PDF corrupto, layout
// inesperado). El controller usa esto para no listar cada nota crédito/documento soporte como
// si algo hubiera fallado — se resumen en un solo conteo (ver tercerosController.js).
class DocumentoNoFacturaError extends Error {}

// El título del documento va en las primeras líneas del PDF (confirmado contra una factura real
// de muestra: "FACTURA ELECTRÓNICA DE VENTA"). Se usa para descartar notas crédito y documentos
// soporte SIN intentar extraer nada — su layout no está verificado (a diferencia del de
// factura) y el usuario pidió explícitamente no procesarlos, no solo que fallen si no calzan.
function esFacturaDeVenta(texto) {
  return normalizarTexto(texto.slice(0, 300)).includes('FACTURA ELECTRONICA');
}

// Extrae Emisor y Adquiriente de una factura electrónica de venta generada por la DIAN. Notas
// crédito y documentos soporte se descartan explícitamente (ver esFacturaDeVenta) — solo
// interesan facturas.
async function extraerPartesDePdf(buffer) {
  const { text } = await pdfParse(buffer);

  if (!esFacturaDeVenta(text)) {
    throw new DocumentoNoFacturaError('No es una factura electrónica de venta (parece nota crédito, documento soporte u otro tipo) — no se procesa.');
  }

  const idxEmisor = text.indexOf('Datos del Emisor');
  const idxAdquiriente = text.indexOf('Datos del Adquiriente');
  if (idxEmisor === -1 || idxAdquiriente === -1) {
    throw new Error('El PDF no tiene el formato esperado de factura electrónica DIAN (no se encontraron las secciones de Emisor/Adquiriente).');
  }
  const idxDetalles = text.indexOf('Detalles de Productos');

  const textoEmisor = text.slice(idxEmisor, idxAdquiriente);
  const textoAdquiriente = text.slice(idxAdquiriente, idxDetalles !== -1 ? idxDetalles : undefined);

  return {
    emisor: conCodigoDane(extraerParte(textoEmisor)),
    adquiriente: conCodigoDane(extraerParte(textoAdquiriente)),
  };
}

// El "tercero" que interesa guardar depende de qué lado de la transacción es la propia empresa
// (mismo criterio que ya usan los formatos 1005/1006 — ver services/exogenas/formato1005.js y
// formato1006.js): en un documento de COMPRA la empresa es quien recibe/adquiere, así que el
// tercero es el Emisor (el proveedor/vendedor); en uno de VENTA la empresa es quien emite, así
// que el tercero es el Adquiriente (el cliente/comprador). Guardar los dos lados sin filtrar
// terminaría metiendo a la propia empresa como "tercero" de sí misma en cada factura de venta.
async function extraerTerceroDePdf(buffer, tipoOperacion) {
  const { emisor, adquiriente } = await extraerPartesDePdf(buffer);
  const contraparte = tipoOperacion === 'compras' ? emisor : adquiriente;
  if (!contraparte) {
    const lado = tipoOperacion === 'compras' ? 'del vendedor (Emisor)' : 'del comprador (Adquiriente)';
    throw new Error(`No se pudieron extraer los datos ${lado} de este PDF.`);
  }
  return contraparte;
}

module.exports = {
  extraerPartesDePdf, extraerTerceroDePdf, mapearCodigoDane, normalizarDireccion, limpiarParaDian,
  DocumentoNoFacturaError,
};
