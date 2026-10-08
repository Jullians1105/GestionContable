const db = require('../config/database');
const { extraerTerceroDePdf, describirRegimenFiscal, DocumentoNoFacturaError, FormatoNoReconocidoError } = require('../services/terceros');
const { limpiarIdentificacion } = require('../services/exogenas/utils/dian');
const { consultarRues, clasificarEstado, fechaActualizacionFuente } = require('../services/terceros/ruesService');
const { nombresSeParecen } = require('../utils/nombresSeParecen');
const logger = require('../utils/logger');
const auditLog = require('../utils/auditLog');

const TIPOS_OPERACION = ['compras', 'ventas'];

// Pasado este tiempo desde la última verificación contra el RUES se vuelve a consultar (en la
// subida de PDFs y en el repaso por lote) — el estado de una matrícula cambia poco.
const DIAS_REVERIFICACION = 30;
// Tope por llamada del repaso por lote: ~19 s por cada 861 documentos medido en producción.
const MAX_LOTE_VERIFICACION = 2000;
let verificacionLoteEnCurso = false;
// En la búsqueda hay una persona esperando: por intento se espera menos que en los procesos en
// segundo plano (que esperan hasta 10 s). El servicio de datos abiertos (datos.gov.co) falla de forma
// INTERMITENTE (el 2026-10-02: ~1 de cada 10 consultas daba 503 o se colgaba), así que se reintenta
// una vez tras una pausa corta: un 503 responde en < 0,5 s, el reintento casi no se nota. Peor caso
// ≈ 4 s + 0,3 s + 4 s. Si aun así no responde, se muestra lo último guardado con el aviso.
const OPCIONES_BUSQUEDA = { timeoutMs: 4000, reintentos: 1, pausaMs: 300 };

const necesitaVerificacion = (fila) =>
  !fila.rues_consultado_at
  || Date.now() - new Date(fila.rues_consultado_at).getTime() > DIAS_REVERIFICACION * 86400000;

// De dónde salen los datos de un tercero: 'pdf' (solo factura), 'rues' (creado desde el RUES,
// sin factura) o 'ambos'. Se calcula, no se guarda, para que no se desincronice.
function origenDe(fila) {
  const hayRues = fila.rues_consulta === 'encontrado';
  if (hayRues && fila.tiene_pdf) return 'ambos';
  if (hayRues) return 'rues';
  return 'pdf';
}

// Avisos para mostrar junto al tercero. `nivel`: 'rojo' (revisar), 'ambar' (atención), 'gris'
// (informativo). No bloquean nada, solo señalan.
function calcularAlertas(fila, anioActual = new Date().getFullYear()) {
  const alertas = [];
  if (fila.rues_consulta === 'no_encontrado') {
    alertas.push({
      codigo: 'no_en_rues', nivel: 'gris',
      mensaje: 'No aparece en el RUES (puede ser persona natural sin matrícula mercantil o extranjero).',
    });
    return alertas;
  }
  if (fila.rues_consulta !== 'encontrado') return alertas;

  const clase = clasificarEstado(fila.rues_estado);
  if (clase === 'cancelada') {
    alertas.push({
      codigo: 'matricula_cancelada', nivel: 'rojo',
      mensaje: `La matrícula mercantil figura como "${fila.rues_estado}" en el RUES.`,
    });
  } else if (clase === 'activa' && fila.rues_ultimo_ano_renovado && fila.rues_ultimo_ano_renovado < anioActual - 1) {
    alertas.push({
      codigo: 'sin_renovar', nivel: 'ambar',
      mensaje: `Matrícula activa, pero la última renovación registrada es de ${fila.rues_ultimo_ano_renovado}.`,
    });
  }
  if (fila.tiene_pdf && !nombresSeParecen(fila.razon_social, fila.rues_razon_social)) {
    alertas.push({
      codigo: 'nombre_distinto', nivel: 'ambar',
      mensaje: 'El nombre en la factura no coincide con el del RUES (puede ser un nombre comercial o un error de la factura).',
    });
  }
  return alertas;
}

// Respuesta de "Consulta Tercero": todo lo guardado + el origen de los datos + avisos. El nombre
// "oficial" es el del RUES si existe (registro oficial); el de la factura queda aparte.
function armarRespuestaTercero(fila, { guardado = true } = {}) {
  const hayRues = fila.rues_consulta === 'encontrado';
  return {
    ...fila,
    guardado,
    origen: origenDe(fila),
    razon_social_oficial: hayRues ? fila.rues_razon_social : fila.razon_social,
    razon_social_factura: fila.tiene_pdf ? fila.razon_social : null,
    regimen_fiscal_descripcion: describirRegimenFiscal(fila.regimen_fiscal),
    alertas: calcularAlertas(fila),
  };
}

// Fila "virtual" (sin guardar) construida a partir de una consulta en vivo al RUES.
function filaDesdeRues(nit, datos) {
  return {
    nit,
    razon_social: datos.razonSocial,
    tiene_pdf: false,
    rues_consulta: 'encontrado',
    rues_consultado_at: new Date().toISOString(),
    rues_razon_social: datos.razonSocial,
    rues_estado: datos.estado,
    rues_ciiu: datos.ciiu,
    rues_representante_legal: datos.representanteLegal,
    rues_representante_documento: datos.representanteDocumento,
    rues_representante_tipo_documento: datos.representanteTipoDocumento,
    rues_organizacion_juridica: datos.organizacionJuridica,
    rues_ultimo_ano_renovado: datos.ultimoAnoRenovado,
  };
}

// Guarda en un tercero YA existente el resultado de la consulta al RUES. Los errores de red no
// se guardan: así no se pisa un dato bueno anterior y el tercero queda pendiente de reintento.
async function guardarVerificacion(nit, resultado) {
  if (resultado.consulta === 'encontrado') {
    const d = resultado.datos;
    const { rows } = await db.query(
      `UPDATE terceros SET
         rues_consulta = 'encontrado', rues_consultado_at = NOW(),
         rues_razon_social = $2, rues_estado = $3, rues_ciiu = $4,
         rues_representante_legal = $5, rues_organizacion_juridica = $6,
         rues_ultimo_ano_renovado = $7,
         rues_representante_documento = $8, rues_representante_tipo_documento = $9
       WHERE nit = $1 RETURNING *`,
      [nit, d.razonSocial, d.estado, d.ciiu, d.representanteLegal, d.organizacionJuridica, d.ultimoAnoRenovado,
        d.representanteDocumento, d.representanteTipoDocumento]
    );
    return rows[0] ?? null;
  }
  const { rows } = await db.query(
    `UPDATE terceros SET
       rues_consulta = 'no_encontrado', rues_consultado_at = NOW(),
       rues_razon_social = NULL, rues_estado = NULL, rues_ciiu = NULL,
       rues_representante_legal = NULL, rues_organizacion_juridica = NULL,
       rues_ultimo_ano_renovado = NULL,
       rues_representante_documento = NULL, rues_representante_tipo_documento = NULL
     WHERE nit = $1 RETURNING *`,
    [nit]
  );
  return rows[0] ?? null;
}

// Consulta el RUES para una lista de documentos de terceros ya guardados y guarda el resultado.
async function verificarYGuardar(nits) {
  const resultados = await consultarRues(nits);
  const conteo = { verificados: 0, noEncontrados: 0, errores: 0, omitidos: new Set(nits).size - resultados.size };
  for (const [nit, resultado] of resultados) {
    if (resultado.consulta === 'error') { conteo.errores += 1; continue; }
    const fila = await guardarVerificacion(nit, resultado);
    if (!fila) continue;
    if (resultado.consulta === 'encontrado') conteo.verificados += 1; else conteo.noEncontrados += 1;
  }
  return conteo;
}

// Columnas que le importan al usuario para saber "qué cambió" cuando un NIT ya existía — no se
// incluyen created_at/updated_at/actualizado_por, que siempre "cambian" y no dicen nada útil.
// Tampoco régimen fiscal/responsabilidad tributaria/teléfono/correo (sí se guardan, sí se
// devuelven en `rows[0]`, pero a propósito no entran acá): el usuario pidió que esos 4 campos
// solo aparezcan en la Consulta Tercero, nunca en el resumen de la pantalla de subida.
const CAMPOS_COMPARABLES = [
  { columna: 'razon_social', etiqueta: 'Razón social' },
  { columna: 'direccion', etiqueta: 'Dirección' },
  { columna: 'municipio', etiqueta: 'Municipio' },
  { columna: 'codigo_municipio_dane', etiqueta: 'Código municipio' },
  { columna: 'departamento', etiqueta: 'Departamento' },
  { columna: 'codigo_departamento_dane', etiqueta: 'Código departamento' },
  { columna: 'pais', etiqueta: 'País' },
  { columna: 'codigo_pais_dian', etiqueta: 'Código país' },
];

// Compara la fila antes/después del upsert y arma la lista de qué cambió — así el usuario puede
// ver si una factura vieja/desactualizada sobrescribió un dato bueno por uno peor, en vez de
// asumir a ciegas que "la más reciente siempre tiene razón".
function calcularCambios(antes, despues) {
  // Si el tercero venía solo del RUES (sin factura), la primera factura no "cambia" nada: es la
  // primera vez que se tienen datos de factura.
  if (!antes || antes.tiene_pdf === false) return [];
  const cambios = [];
  for (const { columna, etiqueta } of CAMPOS_COMPARABLES) {
    if (antes[columna] !== despues[columna]) {
      cambios.push({ campo: etiqueta, antes: antes[columna], despues: despues[columna] });
    }
  }
  return cambios;
}

// Sube uno o varios PDFs de documento electrónico DIAN (factura, nota crédito, documento
// soporte) y hace upsert en `terceros` por NIT. `tipoOperacion` decide qué lado de la
// transacción es el tercero a guardar: 'compras' -> el Emisor (vendedor/proveedor), 'ventas' ->
// el Adquiriente (comprador/cliente) — ver services/terceros/index.js#extraerTerceroDePdf.
// No bloquea el lote completo si un PDF individual falla — se reporta por archivo. Las notas
// crédito/documentos soporte (DocumentoNoFacturaError) no son un "error" en el sentido de que
// algo falló — el usuario pidió explícitamente descartarlos — así que se cuentan aparte en vez
// de listarse uno por uno junto a fallos reales.
const uploadTerceros = async (req, res, next) => {
  try {
    const { tipoOperacion } = req.body;
    if (!TIPOS_OPERACION.includes(tipoOperacion)) {
      return res.status(400).json({ error: `"tipoOperacion" debe ser uno de: ${TIPOS_OPERACION.join(', ')}.` });
    }

    const archivos = req.files;
    if (!archivos || archivos.length === 0) {
      return res.status(400).json({ error: 'Se requiere al menos un archivo PDF.' });
    }

    const terceros = [];
    const errores = [];
    let omitidosNoFactura = 0;
    const nitsPorVerificar = new Set();

    for (const archivo of archivos) {
      try {
        const t = await extraerTerceroDePdf(archivo.buffer, tipoOperacion);

        const existente = await db.query('SELECT * FROM terceros WHERE nit = $1', [t.nit]);
        const antes = existente.rows[0] ?? null;

        const { rows } = await db.query(
          `INSERT INTO terceros
             (nit, razon_social, direccion, municipio, codigo_municipio_dane,
              departamento, codigo_departamento_dane, pais, codigo_pais_dian, regimen_fiscal,
              responsabilidad_tributaria, telefono, correo, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (nit) DO UPDATE SET
             razon_social                = EXCLUDED.razon_social,
             direccion                   = COALESCE(EXCLUDED.direccion, terceros.direccion),
             municipio                   = COALESCE(EXCLUDED.municipio, terceros.municipio),
             codigo_municipio_dane       = COALESCE(EXCLUDED.codigo_municipio_dane, terceros.codigo_municipio_dane),
             departamento                = COALESCE(EXCLUDED.departamento, terceros.departamento),
             codigo_departamento_dane    = COALESCE(EXCLUDED.codigo_departamento_dane, terceros.codigo_departamento_dane),
             pais                        = COALESCE(EXCLUDED.pais, terceros.pais),
             codigo_pais_dian            = COALESCE(EXCLUDED.codigo_pais_dian, terceros.codigo_pais_dian),
             regimen_fiscal              = COALESCE(EXCLUDED.regimen_fiscal, terceros.regimen_fiscal),
             responsabilidad_tributaria  = COALESCE(EXCLUDED.responsabilidad_tributaria, terceros.responsabilidad_tributaria),
             telefono                    = COALESCE(EXCLUDED.telefono, terceros.telefono),
             correo                      = COALESCE(EXCLUDED.correo, terceros.correo),
             actualizado_por             = EXCLUDED.actualizado_por,
             tiene_pdf                   = TRUE
           RETURNING *`,
          [
            t.nit, t.razonSocial, t.direccion, t.municipio, t.codigoMunicipioDane,
            t.departamento, t.codigoDepartamentoDane, t.pais, t.codigoPaisDian, t.regimenFiscal,
            t.responsabilidadTributaria, t.telefono, t.correo, req.user.userId,
          ]
        );

        const cambios = calcularCambios(antes, rows[0]);
        if (necesitaVerificacion(rows[0])) nitsPorVerificar.add(rows[0].nit);
        terceros.push({
          ...rows[0],
          archivo: archivo.originalname,
          pendienteDesambiguar: t.pendienteDesambiguar,
          esNuevo: !antes,
          cambios,
        });
      } catch (err) {
        if (err instanceof DocumentoNoFacturaError) {
          omitidosNoFactura += 1;
        } else {
          errores.push({
            archivo: archivo.originalname,
            error: err.message,
            formatoNoReconocido: err instanceof FormatoNoReconocidoError,
          });
        }
      }
    }

    // Verificación contra el RUES en segundo plano: no alarga la respuesta de la subida, y si el
    // servicio del RUES falla, la subida no se ve afectada (el tercero queda pendiente de reintento).
    if (nitsPorVerificar.size > 0) {
      verificarYGuardar([...nitsPorVerificar]).catch((err) =>
        logger.warn({ err: err.message }, 'Verificación RUES en segundo plano falló'));
    }

    const actualizados = terceros.filter((t) => !t.esNuevo && t.cambios.length > 0);
    // Si el layout de la DIAN cambió de verdad, esto se dispara para varios archivos del mismo
    // lote a la vez — el frontend usa este conteo para mostrar un aviso aparte, más visible que
    // la lista genérica de errores por archivo (pedido explícito del usuario, 2026-09-28).
    const erroresFormato = errores.filter((e) => e.formatoNoReconocido).length;

    await auditLog(req.user.userId, 'CREATE', 'terceros_importacion', 'lote');

    res.status(200).json({
      totalArchivos: archivos.length,
      procesados: terceros.length,
      terceros,
      errores,
      erroresFormato,
      omitidosNoFactura,
      actualizados: actualizados.length,
    });
  } catch (err) {
    next(err);
  }
};

// "Consulta Tercero": busca un tercero ya guardado por NIT/documento. A diferencia del resumen
// de subida, acá SÍ se devuelven régimen fiscal, responsabilidad tributaria, teléfono y correo
// (pedido explícito del usuario) — es la única pantalla donde se muestran.
const consultarTercero = async (req, res, next) => {
  try {
    const nit = limpiarIdentificacion(req.params.nit);
    if (!nit) {
      return res.status(400).json({ error: 'Documento inválido.' });
    }
    // Esta pantalla muestra datos personales (régimen, teléfono, correo): queda constancia de quién consultó qué documento.
    await auditLog(req.user.userId, 'READ', 'terceros_consulta', nit, { documento: nit });

    const { rows } = await db.query('SELECT * FROM terceros WHERE nit = $1', [nit]);
    if (rows.length > 0) {
      // Ya guardado: se consulta el RUES en cada búsqueda para mostrar siempre la última versión, y
      // se actualiza la fila (solo las columnas rues_*, nunca los datos de factura). Si el RUES no
      // responde, se muestra lo último guardado y se avisa que puede estar desactualizado.
      let fila = rows[0];
      let ruesDesactualizado = false;
      // La fecha de la última "foto" del RUES se pregunta en paralelo (y se recuerda una hora): sirve
      // para mostrar qué tan al día está el dato, que NO es "de hoy" sino el de esa foto.
      const [consultas, fuente] = await Promise.all([consultarRues([nit], OPCIONES_BUSQUEDA), fechaActualizacionFuente()]);
      const resultadoRues = consultas.get(nit);
      if (resultadoRues?.consulta === 'error') {
        ruesDesactualizado = true;
      } else if (resultadoRues) {
        fila = (await guardarVerificacion(nit, resultadoRues)) ?? fila;
      }
      return res.status(200).json({
        ...armarRespuestaTercero(fila), ruesDesactualizado, ruesFuenteActualizadaAl: fuente ? fuente.toISOString() : null,
      });
    }

    // No está guardado (nunca llegó una factura suya): se consulta el RUES en vivo y, si
    // aparece, se muestra marcado como "solo RUES" y SIN guardar — a propósito no hay forma de
    // guardar un tercero sin factura: sin dirección/país el registro no sirve para la exógena.
    // Los terceros se crean al subir una factura (y ahí se verifican solos).
    const [consultasVivo, fuenteVivo] = await Promise.all([consultarRues([nit], OPCIONES_BUSQUEDA), fechaActualizacionFuente()]);
    const resultado = consultasVivo.get(nit);
    if (resultado?.consulta === 'encontrado') {
      return res.status(200).json({
        ...armarRespuestaTercero(filaDesdeRues(nit, resultado.datos), { guardado: false }),
        ruesFuenteActualizadaAl: fuenteVivo ? fuenteVivo.toISOString() : null,
      });
    }
    return res.status(404).json({
      error: resultado?.consulta === 'error'
        ? 'No hay ningún tercero guardado con ese documento y el RUES no respondió.'
        : 'No hay ningún tercero guardado con ese documento, y tampoco aparece en el RUES.',
      ruesNoDisponible: resultado?.consulta === 'error',
    });
  } catch (err) {
    next(err);
  }
};

// Repaso por lote: verifica contra el RUES los terceros guardados que nunca se verificaron o cuya
// verificación tiene más de DIAS_REVERIFICACION días (o todos, con `forzar`). Solo admin/líder.
const verificarRuesLote = async (req, res, next) => {
  if (verificacionLoteEnCurso) {
    return res.status(409).json({ error: 'Ya hay una verificación en curso. Espera a que termine.' });
  }
  verificacionLoteEnCurso = true;
  try {
    const forzar = req.body?.forzar === true;
    const { rows } = await db.query(
      `SELECT nit FROM terceros
       WHERE $1::boolean OR rues_consultado_at IS NULL
          OR rues_consultado_at < NOW() - make_interval(days => $2)
       ORDER BY rues_consultado_at NULLS FIRST
       LIMIT $3`,
      [forzar, DIAS_REVERIFICACION, MAX_LOTE_VERIFICACION]
    );
    const conteo = await verificarYGuardar(rows.map((r) => r.nit));
    await auditLog(req.user.userId, 'UPDATE', 'terceros_rues', 'lote');
    res.status(200).json({ pendientes: rows.length, ...conteo });
  } catch (err) {
    next(err);
  } finally {
    verificacionLoteEnCurso = false;
  }
};

module.exports = {
  uploadTerceros, consultarTercero, verificarRuesLote, TIPOS_OPERACION,
  calcularAlertas, origenDe, armarRespuestaTercero,
};
