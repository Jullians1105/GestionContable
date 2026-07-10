const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const auditLog = require('../utils/auditLog');

const normalizePago = (row) => ({
  id:              row.id,
  empresaId:       row.empresa_id,
  anio:            row.anio,
  mes:             row.mes,
  estado:          row.estado,
  autorizado:      row.autorizado,
  fechaEnvio:      row.fecha_envio,
  fechaResolucion: row.fecha_resolucion,
  monto:           row.monto,
  registradoPor:   row.registrado_por,
  nota:            row.nota,
  createdAt:       row.created_at,
  updatedAt:       row.updated_at,
});

// Mora = registros posteriores al último aprobado con estado != 'aprobado'.
// Si nunca hubo un aprobado, COALESCE(last_aprobado, 0) hace que todos los registros cuenten.
const calcularMora = async (empresaId) => {
  const result = await db.query(
    `WITH last_aprobado AS (
       SELECT COALESCE(
         MAX(CASE WHEN estado = 'aprobado' THEN (anio * 100 + mes) END),
         0
       ) AS val
       FROM fondo_pagos
       WHERE empresa_id = $1
     )
     SELECT COUNT(*) AS mora
     FROM fondo_pagos, last_aprobado
     WHERE fondo_pagos.empresa_id = $1
       AND (fondo_pagos.anio * 100 + fondo_pagos.mes) > last_aprobado.val
       AND fondo_pagos.estado != 'aprobado'`,
    [empresaId]
  );
  return parseInt(result.rows[0]?.mora ?? 0, 10);
};

const getPagos = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);

    const [pagoResult, mora] = await Promise.all([
      db.query(
        'SELECT * FROM fondo_pagos WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
        [empresaId, anio, mes]
      ),
      calcularMora(empresaId),
    ]);

    const pago = pagoResult.rows.length > 0 ? normalizePago(pagoResult.rows[0]) : null;
    res.json({ pago, mora });
  } catch (err) {
    next(err);
  }
};

const listPagos = async (req, res, next) => {
  try {
    const { empresaId } = req.params;

    const [pagosResult, mora] = await Promise.all([
      db.query(
        'SELECT * FROM fondo_pagos WHERE empresa_id = $1 ORDER BY anio DESC, mes DESC',
        [empresaId]
      ),
      calcularMora(empresaId),
    ]);

    res.json({
      pagos: pagosResult.rows.map(normalizePago),
      mora,
    });
  } catch (err) {
    next(err);
  }
};

// Historial de pagos de TODAS las empresas en una sola consulta — evita el
// N+1 (una petición por empresa) que la página de Pagos hacía en cada carga.
const listPagosTodasEmpresas = async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM fondo_pagos ORDER BY empresa_id, anio DESC, mes DESC'
    );

    const porEmpresa = new Map();
    for (const row of result.rows) {
      const pago = normalizePago(row);
      if (!porEmpresa.has(pago.empresaId)) porEmpresa.set(pago.empresaId, []);
      porEmpresa.get(pago.empresaId).push(pago);
    }

    res.json(Array.from(porEmpresa.entries()).map(([empresaId, pagos]) => ({ empresaId, pagos })));
  } catch (err) {
    next(err);
  }
};

const createPago = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const { anio, mes } = req.body;

    // Snapshot de monthly_fee en el momento del registro
    const feeResult = await db.query(
      'SELECT monthly_fee FROM fondo_empresas WHERE id = $1',
      [empresaId]
    );
    if (feeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }
    const monto = feeResult.rows[0].monthly_fee ?? null;

    const result = await db.query(
      `INSERT INTO fondo_pagos
         (id, empresa_id, anio, mes, estado, monto, fecha_envio, registrado_por)
       VALUES ($1, $2, $3, $4, 'pendiente', $5, CURRENT_DATE, $6)
       ON CONFLICT (empresa_id, anio, mes) DO NOTHING
       RETURNING *`,
      [uuidv4(), empresaId, anio, mes, monto, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Ya existe un pago para esta empresa y período' });
    }

    await auditLog(req.user.userId, 'INSERT', 'fondo_pagos', result.rows[0].id, {
      empresaId, anio, mes, monto,
    });

    res.status(201).json(normalizePago(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// Autorización interna de envío — independiente de `estado` (el avance con la
// fiduciaria). Si el mes aún no tiene registro (pendiente virtual, sin fila
// en BD), se crea una en estado 'pendiente' solo para guardar el flag.
const updateAutorizado = async (req, res, next) => {
  try {
    const { empresaId } = req.params;
    const anio = parseInt(req.query.anio, 10);
    const mes  = parseInt(req.query.mes, 10);
    const { autorizado } = req.body;

    const existing = await db.query(
      'SELECT id FROM fondo_pagos WHERE empresa_id = $1 AND anio = $2 AND mes = $3',
      [empresaId, anio, mes]
    );

    let result;
    if (existing.rows.length > 0) {
      result = await db.query(
        'UPDATE fondo_pagos SET autorizado = $1 WHERE id = $2 RETURNING *',
        [autorizado, existing.rows[0].id]
      );
    } else {
      const feeResult = await db.query(
        'SELECT monthly_fee FROM fondo_empresas WHERE id = $1',
        [empresaId]
      );
      if (feeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Empresa no encontrada' });
      }
      const monto = feeResult.rows[0].monthly_fee ?? null;
      result = await db.query(
        `INSERT INTO fondo_pagos
           (id, empresa_id, anio, mes, estado, monto, autorizado, fecha_envio, registrado_por)
         VALUES ($1, $2, $3, $4, 'pendiente', $5, $6, CURRENT_DATE, $7)
         RETURNING *`,
        [uuidv4(), empresaId, anio, mes, monto, autorizado, req.user.userId]
      );
    }

    await auditLog(req.user.userId, 'UPDATE', 'fondo_pagos', result.rows[0].id, {
      empresaId, anio, mes, autorizado,
    });

    res.json(normalizePago(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

const updatePago = async (req, res, next) => {
  try {
    const { empresaId, pagoId } = req.params;
    const { estado, nota } = req.body;

    const result = await db.query(
      `UPDATE fondo_pagos
       SET estado           = COALESCE($1, estado),
           nota             = COALESCE($2, nota),
           fecha_resolucion = CASE
             WHEN $1 IN ('aprobado', 'rechazado') THEN CURRENT_DATE
             ELSE fecha_resolucion
           END
       WHERE id = $3 AND empresa_id = $4
       RETURNING *`,
      [estado ?? null, nota ?? null, pagoId, empresaId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pago no encontrado' });
    }

    await auditLog(req.user.userId, 'UPDATE', 'fondo_pagos', pagoId, {
      empresaId, estado, nota,
    });

    res.json(normalizePago(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// Mes habilitado — límite superior global de la grilla de pagos, controlado
// manualmente por las jefas (ver requireFondoAutorizarPagos) en vez de
// derivarse de la fecha del sistema, ya que los pagos son sobre mes vencido.
const getMesActual = async (req, res, next) => {
  try {
    const result = await db.query('SELECT anio, mes FROM fondo_pagos_mes_actual WHERE id = 1');
    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Mes actual de pagos no configurado' });
    }
    res.json({ anio: result.rows[0].anio, mes: result.rows[0].mes });
  } catch (err) {
    next(err);
  }
};

const avanzarMesActual = async (req, res, next) => {
  try {
    const result = await db.query(
      `UPDATE fondo_pagos_mes_actual
       SET anio = CASE WHEN mes = 12 THEN anio + 1 ELSE anio END,
           mes  = CASE WHEN mes = 12 THEN 1 ELSE mes + 1 END
       WHERE id = 1
       RETURNING anio, mes`
    );
    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Mes actual de pagos no configurado' });
    }

    await auditLog(req.user.userId, 'UPDATE', 'fondo_pagos_mes_actual', 1, {
      nuevoAnio: result.rows[0].anio, nuevoMes: result.rows[0].mes,
    });

    res.json({ anio: result.rows[0].anio, mes: result.rows[0].mes });
  } catch (err) {
    next(err);
  }
};

// Inicio del programa (febrero 2026) — mismo valor que START_YM en el frontend.
// Piso para retroceder: no tiene sentido deshabilitar meses de antes de que
// existiera el programa.
const INICIO_PROGRAMA_ANIO = 2026;
const INICIO_PROGRAMA_MES  = 2;

const retrocederMesActual = async (req, res, next) => {
  try {
    const current = await db.query('SELECT anio, mes FROM fondo_pagos_mes_actual WHERE id = 1');
    if (current.rows.length === 0) {
      return res.status(500).json({ error: 'Mes actual de pagos no configurado' });
    }
    const { anio, mes } = current.rows[0];
    if (anio * 100 + mes <= INICIO_PROGRAMA_ANIO * 100 + INICIO_PROGRAMA_MES) {
      return res.status(400).json({ error: 'No se puede retroceder antes del inicio del programa' });
    }

    const result = await db.query(
      `UPDATE fondo_pagos_mes_actual
       SET anio = CASE WHEN mes = 1 THEN anio - 1 ELSE anio END,
           mes  = CASE WHEN mes = 1 THEN 12 ELSE mes - 1 END
       WHERE id = 1
       RETURNING anio, mes`
    );

    await auditLog(req.user.userId, 'UPDATE', 'fondo_pagos_mes_actual', 1, {
      nuevoAnio: result.rows[0].anio, nuevoMes: result.rows[0].mes, accion: 'retroceder',
    });

    res.json({ anio: result.rows[0].anio, mes: result.rows[0].mes });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPagos, listPagos, listPagosTodasEmpresas, createPago, updatePago, updateAutorizado,
  getMesActual, avanzarMesActual, retrocederMesActual,
};
