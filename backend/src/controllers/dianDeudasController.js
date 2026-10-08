// Deudas vencidas DIAN — endpoints (ver services/dianDeudasService.js y migración 065).
// La clave DIAN nunca sale por la API: solo se informa si hay una guardada y si la DIAN la aceptó.
const db = require('../config/database');
const auditLog = require('../utils/auditLog');
const { llaveConfigurada } = require('../utils/secretos');
const servicio = require('../services/dianDeudasService');
const { armarCorreo, describirPeriodo, estadoRevision, mesActualBogota } = require('../services/dianDeudas/logica');

const { ErrorDeudas } = servicio;

// Errores de negocio del servicio -> su código HTTP; cualquier otro error al manejador general.
function responderError(err, res, next) {
  if (err instanceof ErrorDeudas) return res.status(err.status).json({ error: err.message, codigo: err.codigo });
  return next(err);
}

const mesDeQuery = (valor) => {
  if (valor === undefined) return mesActualBogota();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? `${valor}-01` : null;
};

// Estado que ve la pantalla: el de la revisión del mes o, si aún no hay, por qué todavía no se puede.
function estadoVista(fila) {
  if (fila.estado) return fila.estado;
  // Una clave RECHAZADA por la DIAN no se guarda, así que "invalida" aparece sin clave guardada: se mira primero.
  if (fila.dian_clave_estado === 'invalida') return 'clave';
  if (!fila.tiene_clave) return 'sin_clave';
  return 'pendiente';
}

// Todas las empresas activas con el resultado de su revisión del mes (?mes=YYYY-MM, por defecto el actual).
const listar = async (req, res, next) => {
  try {
    const mes = mesDeQuery(req.query.mes);
    if (!mes) return res.status(400).json({ error: 'mes debe tener el formato YYYY-MM' });

    const { rows } = await db.query(
      `SELECT e.id, e.name, e.nit, e.tipo_contribuyente, e.cedula_representante, e.iva_periodicidad,
              (e.dian_clave_cifrada IS NOT NULL) AS tiene_clave, e.dian_clave_estado, e.dian_clave_verificada_at,
              r.id AS revision_id, r.estado, r.mensaje, r.revisado_at, r.correo_enviado_at,
              u.name AS revisado_por,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'id', d.id, 'concepto', d.concepto, 'tipoObligacion', d.tipo_obligacion, 'anio', d.anio,
                  'periodo', d.periodo, 'obligacion', d.obligacion, 'valorBase', d.valor_base,
                  'valorTotal', d.valor_total, 'estado', d.estado, 'nota', d.nota, 'vencida', d.vencida
                ) ORDER BY d.vencida DESC, d.anio, d.periodo, d.concepto)
                FROM dian_deudas_detalle d WHERE d.revision_id = r.id
              ), '[]'::json) AS detalle
       FROM empresas e
       LEFT JOIN dian_deudas_revisiones r ON r.empresa_id = e.id AND r.mes = $1
       LEFT JOIN users u ON u.id = r.revisado_por
       WHERE e.activa
       ORDER BY e.name`,
      [mes]
    );

    res.json({
      mes: mes.slice(0, 7),
      llaveConfigurada: llaveConfigurada(),
      empresas: rows.map((f) => ({
        id: f.id,
        name: f.name,
        nit: f.nit,
        tipoContribuyente: f.tipo_contribuyente,
        cedulaRepresentante: f.cedula_representante ?? null,
        ivaPeriodicidad: f.iva_periodicidad,
        tieneClave: f.tiene_clave,
        claveEstado: f.dian_clave_estado,
        claveVerificadaAt: f.dian_clave_verificada_at,
        estado: estadoVista(f),
        revisionId: f.revision_id,
        mensaje: f.mensaje,
        revisadoAt: f.revisado_at,
        revisadoPor: f.revisado_por,
        correoEnviadoAt: f.correo_enviado_at,
        detalle: f.detalle.map((d) => ({
          ...d, descripcion: describirPeriodo({ concepto: d.concepto, anio: d.anio, periodo: d.periodo, ivaPeriodicidad: f.iva_periodicidad, tipoObligacion: d.tipoObligacion }),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
};

const progreso = (_req, res) => res.json(servicio.getProgreso());

// Claves DIAN guardadas, para mostrarlas/copiarlas en la pantalla (presentación manual). Decisión del usuario: las ve
// quien entra a la página (hoy están en un Excel abierto a toda la oficina), salvo los "viewer" (ver rutas). Queda una
// línea en la auditoría por consulta (quién la hizo, nunca las claves); si ese registro falla, no impide la respuesta.
// Respuesta sin caché.
const claves = async (req, res, next) => {
  try {
    const resultado = await servicio.claves();
    await auditLog(req.user.userId, 'READ', 'dian_clave', 'todas');
    res.set('Cache-Control', 'no-store');
    res.json(resultado);
  } catch (err) {
    next(err);
  }
};

const revisar = async (req, res, next) => {
  try {
    const { id } = req.params;
    const resultado = await servicio.revisarEmpresa(id, { userId: req.user.userId });
    await auditLog(req.user.userId, 'CREATE', 'dian_deudas_revision', id, { estado: resultado.estado });
    req.io?.emit('dianDeudas:revisada', { empresaId: id, estado: resultado.estado });
    res.json(resultado);
  } catch (err) {
    responderError(err, res, next);
  }
};

const revisarTodas = async (req, res, next) => {
  try {
    const resumen = await servicio.revisarTodas({
      userId: req.user.userId, soloPendientes: req.body?.soloPendientes !== false, io: req.io,
    });
    await auditLog(req.user.userId, 'CREATE', 'dian_deudas_lote', 'lote');
    res.status(202).json(resumen);
  } catch (err) {
    responderError(err, res, next);
  }
};

// Guarda (cifrada) la clave DIAN tras verificarla con un login real. Un solo intento por llamada.
const guardarClave = async (req, res, next) => {
  try {
    if (!llaveConfigurada()) {
      return res.status(503).json({ error: 'El servidor no tiene configurada la llave de cifrado (DIAN_CLAVES_KEY). Avisar al administrador.', codigo: 'SIN_LLAVE' });
    }
    await servicio.guardarClave(req.params.id, req.body.clave);
    await auditLog(req.user.userId, 'UPDATE', 'dian_clave', req.params.id, { accion: 'guardar' }); // nunca la clave
    res.json({ ok: true });
  } catch (err) {
    responderError(err, res, next);
  }
};

const quitarClave = async (req, res, next) => {
  try {
    await servicio.quitarClave(req.params.id);
    await auditLog(req.user.userId, 'DELETE', 'dian_clave', req.params.id, { accion: 'quitar' });
    res.status(204).end();
  } catch (err) {
    responderError(err, res, next);
  }
};

// Periodicidad del IVA: hace falta para escribir "bimestre marzo-abril" en vez de "periodo 2".
const actualizarConfig = async (req, res, next) => {
  try {
    const { ivaPeriodicidad } = req.body;
    const { rowCount } = await db.query('UPDATE empresas SET iva_periodicidad = $2 WHERE id = $1', [req.params.id, ivaPeriodicidad ?? null]);
    if (rowCount === 0) return res.status(404).json({ error: 'Empresa no encontrada' });
    await auditLog(req.user.userId, 'UPDATE', 'empresas', req.params.id, { ivaPeriodicidad: ivaPeriodicidad ?? null });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Texto del correo al cliente (asunto + cuerpo) a partir de lo que de verdad se debe.
const correo = async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT r.id, e.name, e.iva_periodicidad,
              COALESCE((SELECT json_agg(json_build_object(
                'concepto', d.concepto, 'tipoObligacion', d.tipo_obligacion, 'anio', d.anio, 'periodo', d.periodo, 'valorTotal', d.valor_total, 'estado', d.estado, 'vencida', d.vencida
              ) ORDER BY d.vencida DESC, d.anio, d.periodo, d.concepto) FROM dian_deudas_detalle d WHERE d.revision_id = r.id), '[]'::json) AS detalle
       FROM dian_deudas_revisiones r JOIN empresas e ON e.id = r.empresa_id WHERE r.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Revisión no encontrada' });
    const texto = armarCorreo({ empresa: rows[0].name, detalle: rows[0].detalle, ivaPeriodicidad: rows[0].iva_periodicidad });
    if (!texto) return res.status(404).json({ error: 'No hay deudas vigentes para informar en esta revisión.' });
    res.json(texto);
  } catch (err) {
    next(err);
  }
};

// Anota (o quita) que el correo ya se envió — el equivalente a "se anota en el Excel y se envía".
const marcarCorreo = async (req, res, next) => {
  try {
    const enviado = req.body.enviado !== false;
    const { rowCount } = await db.query(
      enviado
        ? 'UPDATE dian_deudas_revisiones SET correo_enviado_at = NOW(), correo_enviado_por = $2 WHERE id = $1'
        : 'UPDATE dian_deudas_revisiones SET correo_enviado_at = NULL, correo_enviado_por = NULL WHERE id = $1',
      enviado ? [req.params.id, req.user.userId] : [req.params.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Revisión no encontrada' });
    await auditLog(req.user.userId, 'UPDATE', 'dian_deudas_revision', req.params.id, { correoEnviado: enviado });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};

// Una persona resuelve una obligación marcada "revisar" (o corrige un cruce): la pasa a pagada/vigente.
// Después se recalcula el estado de la revisión (con_deuda / al_dia).
const resolverDetalle = async (req, res, next) => {
  try {
    const { estado, nota } = req.body;
    const { rows } = await db.query(
      `UPDATE dian_deudas_detalle SET estado = $2, nota = COALESCE($3, nota) WHERE id = $1 RETURNING revision_id`,
      [req.params.id, estado, nota ?? null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Obligación no encontrada' });

    const { revision_id: revisionId } = rows[0];
    const { rows: estados } = await db.query('SELECT estado FROM dian_deudas_detalle WHERE revision_id = $1', [revisionId]);
    const nuevo = estadoRevision(estados);
    await db.query(`UPDATE dian_deudas_revisiones SET estado = $2 WHERE id = $1 AND estado IN ('al_dia', 'con_deuda')`, [revisionId, nuevo]);
    await auditLog(req.user.userId, 'UPDATE', 'dian_deudas_detalle', req.params.id, { estado });
    res.json({ ok: true, estadoRevision: nuevo });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listar, progreso, claves, revisar, revisarTodas, guardarClave, quitarClave, actualizarConfig, correo, marcarCorreo, resolverDetalle,
};
