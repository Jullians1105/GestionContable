// Consulta del RUES (Registro Único Empresarial y Social, Cámaras de Comercio) a través del
// conjunto de datos abierto que publica Confecámaras en datos.gov.co (API SODA/Socrata).
// Es solo lectura, sin credenciales; con un app token (SOCRATA_APP_TOKEN) Socrata da un cupo de
// consultas propio en vez del compartido por IP, pero funciona sin él.
//
// Lo que sale hacia afuera son únicamente números de NIT/documento — se validan como solo
// dígitos ANTES de armar la consulta (el filtro `$where` es texto SoQL, así que un valor sin
// validar podría alterar la consulta). Lo que vuelve se trata siempre como texto.
//
// No lanza excepciones por fallos de red: cada documento queda como 'encontrado',
// 'no_encontrado' o 'error', para que Gestcon siga funcionando si el servicio está caído.
const env = require('../../config/env');
const logger = require('../../utils/logger');

const RUES_URL = 'https://www.datos.gov.co/resource/c82u-588k.json';
const TAMANO_LOTE = 100;
const TIMEOUT_MS = 10000;
const REINTENTOS = 1;
const CAMPOS = [
  'numero_identificacion', 'razon_social', 'estado_matricula', 'codigo_categoria_matricula',
  'ultimo_ano_renovado', 'cod_ciiu_act_econ_pri', 'organizacion_juridica', 'representante_legal',
  'num_identificacion_representante_legal', 'clase_identificacion_rl',
];

// El conjunto trae cientos de miles de filas con documento "0000000000000" (sin dato): consultar
// por eso devolvería basura. Tampoco tiene sentido consultar documentos demasiado cortos/largos.
function normalizarDocumento(valor) {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.length < 5 || digitos.length > 15) return null;
  if (/^0+$/.test(digitos)) return null;
  return digitos;
}

// 'activa' | 'cancelada' | 'otro'. "Constitución por traslado" es la matrícula nueva en la
// cámara de destino (está viva); "cancelada por traslado de domicilio" es la vieja, que dejó de
// aplicar porque la empresa cambió de cámara — no es un problema para el tercero, por eso no
// cuenta como cancelada.
function clasificarEstado(estado) {
  const e = String(estado ?? '').toUpperCase();
  if (e === 'ACTIVA' || /CONSTITUCI.N POR TRASLADO/.test(e)) return 'activa';
  if (/TRASLADO/.test(e)) return 'otro';
  if (/CANCELADA/.test(e)) return 'cancelada';
  return 'otro';
}

// Un mismo documento puede tener varias matrículas (sucursales, canceladas, traslados). Se queda
// la activa y principal; si no hay, la activa; si no, la renovada más recientemente.
function elegirRegistro(registros) {
  const puntaje = (r) => {
    const activa = clasificarEstado(r.estado_matricula) === 'activa';
    return (activa ? 2 : 0) + (activa && r.codigo_categoria_matricula === '01' ? 1 : 0);
  };
  const anio = (r) => Number(r.ultimo_ano_renovado) || 0;
  return [...registros]
    .filter((r) => r.razon_social)
    .sort((a, b) => puntaje(b) - puntaje(a) || anio(b) - anio(a))[0] ?? null;
}

const documentoRepresentante = (valor) => {
  const digitos = String(valor ?? '').replace(/\D/g, '');
  return digitos && !/^0+$/.test(digitos) ? digitos : null;
};

function aDatos(registro) {
  const anio = Number(registro.ultimo_ano_renovado);
  return {
    razonSocial: String(registro.razon_social).trim(),
    estado: registro.estado_matricula ?? null,
    ciiu: registro.cod_ciiu_act_econ_pri || null,
    representanteLegal: registro.representante_legal ? String(registro.representante_legal).trim() : null,
    // Documento del representante legal: puede venir vacío o con ceros cuando el RUES no lo tiene.
    representanteDocumento: documentoRepresentante(registro.num_identificacion_representante_legal),
    representanteTipoDocumento: registro.clase_identificacion_rl ? String(registro.clase_identificacion_rl).trim() : null,
    organizacionJuridica: registro.organizacion_juridica ?? null,
    ultimoAnoRenovado: anio > 0 ? anio : null,
  };
}

async function pedirLote(documentos, { timeoutMs = TIMEOUT_MS, reintentos = REINTENTOS } = {}) {
  const lista = documentos.map((d) => `'${d}'`).join(',');
  const params = new URLSearchParams({
    $select: CAMPOS.join(','),
    $where: `numero_identificacion in(${lista})`,
    $limit: '5000',
  });
  const headers = { Accept: 'application/json' };
  if (env.SOCRATA_APP_TOKEN) headers['X-App-Token'] = env.SOCRATA_APP_TOKEN;

  let ultimoError;
  for (let intento = 0; intento <= reintentos; intento += 1) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const res = await fetch(`${RUES_URL}?${params}`, { headers, signal: controlador.signal });
      if (res.ok) {
        const cuerpo = await res.json();
        if (!Array.isArray(cuerpo)) throw new Error('Respuesta del RUES con formato inesperado');
        return cuerpo;
      }
      // 4xx distintos de 429 no mejoran reintentando.
      ultimoError = new Error(`RUES respondió ${res.status}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (err) {
      ultimoError = err;
    } finally {
      clearTimeout(temporizador);
    }
  }
  throw ultimoError;
}

// Recibe documentos (NIT/cédula, con o sin formato) y devuelve un Map documento -> resultado:
//   { consulta: 'encontrado', datos } | { consulta: 'no_encontrado' } | { consulta: 'error' }
// Los documentos inválidos (vacíos, ceros) se omiten del Map: no se pueden consultar.
// `opciones` ({ timeoutMs, reintentos }) permite una consulta más impaciente cuando hay una persona
// esperando en pantalla (la búsqueda), frente a los procesos en segundo plano.
async function consultarRues(documentos, opciones) {
  const unicos = [...new Set(documentos.map(normalizarDocumento).filter(Boolean))];
  const resultados = new Map();

  for (let i = 0; i < unicos.length; i += TAMANO_LOTE) {
    const lote = unicos.slice(i, i + TAMANO_LOTE);
    try {
      const filas = await pedirLote(lote, opciones);
      const porDocumento = new Map();
      for (const fila of filas) {
        const doc = String(fila.numero_identificacion ?? '');
        if (!porDocumento.has(doc)) porDocumento.set(doc, []);
        porDocumento.get(doc).push(fila);
      }
      for (const doc of lote) {
        const elegido = elegirRegistro(porDocumento.get(doc) ?? []);
        resultados.set(doc, elegido
          ? { consulta: 'encontrado', datos: aDatos(elegido) }
          : { consulta: 'no_encontrado' });
      }
    } catch (err) {
      logger.warn({ err: err.message, documentos: lote.length }, 'No se pudo consultar el RUES');
      for (const doc of lote) resultados.set(doc, { consulta: 'error' });
    }
  }
  return resultados;
}

module.exports = { consultarRues, normalizarDocumento, clasificarEstado, elegirRegistro, TAMANO_LOTE };
