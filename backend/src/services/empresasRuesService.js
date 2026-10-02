// Estado de la matrícula mercantil de las empresas del directorio maestro (tabla `empresas`),
// según el RUES (ver migración 064 y services/terceros/ruesService.js). Sirve para vigilar a los
// PROPIOS clientes de la firma: matrícula cancelada o sin renovar. Solo se escriben las columnas
// `rues_*`; la identidad de la empresa (nombre, NIT, tipo) nunca se toca desde acá.
//
// Cuándo se consulta:
//   - al arrancar el backend y todos los días a las 6 am (Bogotá), pero SOLO si hay algo nuevo. El
//     RUES publica sus datos como una "foto" de vez en cuando (no a diario; ver ruesService.js
//     #fechaActualizacionFuente), así que cada corrida pregunta primero la fecha de esa foto
//     (una consulta de 2,6 KB) y vuelve a consultar solo a las empresas nunca verificadas o
//     verificadas ANTES de esa fecha. Si la foto no cambió, no se consulta nada. Si no se puede
//     saber la fecha, se cae al criterio de DIAS_SIN_FUENTE días;
//   - cuando se crea una empresa o se le cambia el NIT/cédula (en segundo plano);
//   - a mano, con "Actualizar matrícula" en la pantalla Empresas (POST /api/empresas/verificar-matricula).
//
// Un fallo del RUES nunca se guarda: así no se pisa un dato bueno anterior y la empresa queda
// pendiente de reintento.
const cron = require('node-cron');
const db = require('../config/database');
const logger = require('../utils/logger');
const { consultarRues, normalizarDocumento, fechaActualizacionFuente } = require('./terceros/ruesService');

// Solo cuando no se puede saber la fecha de la última foto del RUES: se re-verifica lo que lleve
// más de estos días.
const DIAS_SIN_FUENTE = 7;
let enCurso = false;

const estaEnCurso = () => enCurso;

// ids: limita a esas empresas (null = todas). forzar: ignora la fecha de la última verificación.
// Devuelve conteos. Lanza un error con `codigo: 'EN_CURSO'` si ya hay otra verificación corriendo.
async function verificarEmpresas({ ids = null, forzar = false } = {}) {
  if (enCurso) {
    const err = new Error('Ya hay una verificación de matrículas en curso.');
    err.codigo = 'EN_CURSO';
    throw err;
  }
  enCurso = true;
  try {
    // Una empresa está al día si se verificó DESPUÉS de la última foto del RUES: volver a preguntar
    // devolvería lo mismo. Con `forzar` no hace falta saber la fecha.
    const fuente = forzar ? null : await fechaActualizacionFuente();
    const limite = fuente ?? new Date(Date.now() - DIAS_SIN_FUENTE * 24 * 60 * 60 * 1000);
    const { rows } = await db.query(
      `SELECT id, nit FROM empresas
       WHERE activa AND nit IS NOT NULL AND nit <> ''
         AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
         AND ($2::boolean OR rues_consultado_at IS NULL OR rues_consultado_at < $3::timestamptz)`,
      [ids, forzar, limite]
    );

    // Una misma persona/empresa puede estar duplicada con el mismo documento: se consulta una vez
    // y se actualizan todas las filas.
    const idsPorDocumento = new Map();
    let sinDocumento = 0;
    for (const { id, nit } of rows) {
      const doc = normalizarDocumento(nit);
      if (!doc) { sinDocumento += 1; continue; }
      if (!idsPorDocumento.has(doc)) idsPorDocumento.set(doc, []);
      idsPorDocumento.get(doc).push(id);
    }

    const conteo = {
      pendientes: rows.length, verificadas: 0, noEncontradas: 0, errores: 0, sinDocumento,
      fuenteActualizadaAl: fuente ? fuente.toISOString() : null,
    };
    if (idsPorDocumento.size === 0) return conteo;

    const resultados = await consultarRues([...idsPorDocumento.keys()]);
    for (const [doc, resultado] of resultados) {
      const idsEmpresa = idsPorDocumento.get(doc) ?? [];
      if (resultado.consulta === 'error') { conteo.errores += idsEmpresa.length; continue; }

      if (resultado.consulta === 'encontrado') {
        const d = resultado.datos;
        await db.query(
          `UPDATE empresas SET
             rues_consulta = 'encontrado', rues_consultado_at = NOW(), rues_estado = $2,
             rues_ultimo_ano_renovado = $3, rues_fecha_renovacion = $4
           WHERE id = ANY($1::uuid[])`,
          [idsEmpresa, d.estado, d.ultimoAnoRenovado, d.fechaRenovacion]
        );
        conteo.verificadas += idsEmpresa.length;
      } else {
        await db.query(
          `UPDATE empresas SET
             rues_consulta = 'no_encontrado', rues_consultado_at = NOW(), rues_estado = NULL,
             rues_ultimo_ano_renovado = NULL, rues_fecha_renovacion = NULL
           WHERE id = ANY($1::uuid[])`,
          [idsEmpresa]
        );
        conteo.noEncontradas += idsEmpresa.length;
      }
    }
    return conteo;
  } finally {
    enCurso = false;
  }
}

// Para los procesos en segundo plano: no lanza ni bloquea a quien llama; si ya hay una corrida en
// curso simplemente se omite (la del cron de la mañana recoge lo que quede pendiente).
function verificarEnSegundoPlano(opciones) {
  verificarEmpresas(opciones).catch((err) => {
    if (err.codigo === 'EN_CURSO') {
      logger.debug('Verificación de matrículas omitida: ya hay una en curso');
    } else {
      logger.warn({ err: err.message }, 'Verificación de matrículas (RUES) en segundo plano falló');
    }
  });
}

function initEmpresasRuesCron() {
  const correr = () => {
    verificarEmpresas()
      .then((r) => {
        if (r.pendientes > 0) logger.info(r, 'Matrículas de empresas verificadas contra el RUES');
      })
      .catch((err) => {
        if (err.codigo !== 'EN_CURSO') logger.warn({ err: err.message }, 'Cron de matrículas (RUES) falló');
      });
  };
  correr(); // al arrancar: cubre cualquier horario real de encendido/deploy
  cron.schedule('0 6 * * *', correr, { timezone: 'America/Bogota' });
  logger.info('Cron de matrículas de empresas (RUES) inicializado (al arrancar + diario 6am Bogotá)');
}

module.exports = {
  verificarEmpresas, verificarEnSegundoPlano, initEmpresasRuesCron, estaEnCurso, DIAS_SIN_FUENTE,
};
