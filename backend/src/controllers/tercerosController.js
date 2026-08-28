const db = require('../config/database');
const { extraerTerceroDePdf, describirRegimenFiscal, DocumentoNoFacturaError } = require('../services/terceros');
const { limpiarIdentificacion } = require('../services/exogenas/utils/dian');

const TIPOS_OPERACION = ['compras', 'ventas'];

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
];

// Compara la fila antes/después del upsert y arma la lista de qué cambió — así el usuario puede
// ver si una factura vieja/desactualizada sobrescribió un dato bueno por uno peor, en vez de
// asumir a ciegas que "la más reciente siempre tiene razón".
function calcularCambios(antes, despues) {
  if (!antes) return [];
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

    for (const archivo of archivos) {
      try {
        const t = await extraerTerceroDePdf(archivo.buffer, tipoOperacion);

        const existente = await db.query('SELECT * FROM terceros WHERE nit = $1', [t.nit]);
        const antes = existente.rows[0] ?? null;

        const { rows } = await db.query(
          `INSERT INTO terceros
             (nit, razon_social, direccion, municipio, codigo_municipio_dane,
              departamento, codigo_departamento_dane, regimen_fiscal,
              responsabilidad_tributaria, telefono, correo, actualizado_por)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (nit) DO UPDATE SET
             razon_social                = EXCLUDED.razon_social,
             direccion                   = COALESCE(EXCLUDED.direccion, terceros.direccion),
             municipio                   = COALESCE(EXCLUDED.municipio, terceros.municipio),
             codigo_municipio_dane       = COALESCE(EXCLUDED.codigo_municipio_dane, terceros.codigo_municipio_dane),
             departamento                = COALESCE(EXCLUDED.departamento, terceros.departamento),
             codigo_departamento_dane    = COALESCE(EXCLUDED.codigo_departamento_dane, terceros.codigo_departamento_dane),
             regimen_fiscal              = COALESCE(EXCLUDED.regimen_fiscal, terceros.regimen_fiscal),
             responsabilidad_tributaria  = COALESCE(EXCLUDED.responsabilidad_tributaria, terceros.responsabilidad_tributaria),
             telefono                    = COALESCE(EXCLUDED.telefono, terceros.telefono),
             correo                      = COALESCE(EXCLUDED.correo, terceros.correo),
             actualizado_por             = EXCLUDED.actualizado_por
           RETURNING *`,
          [
            t.nit, t.razonSocial, t.direccion, t.municipio, t.codigoMunicipioDane,
            t.departamento, t.codigoDepartamentoDane, t.regimenFiscal,
            t.responsabilidadTributaria, t.telefono, t.correo, req.user.userId,
          ]
        );

        const cambios = calcularCambios(antes, rows[0]);
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
          errores.push({ archivo: archivo.originalname, error: err.message });
        }
      }
    }

    const actualizados = terceros.filter((t) => !t.esNuevo && t.cambios.length > 0);

    res.status(200).json({
      totalArchivos: archivos.length,
      procesados: terceros.length,
      terceros,
      errores,
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

    const { rows } = await db.query('SELECT * FROM terceros WHERE nit = $1', [nit]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'No hay ningún tercero guardado con ese documento.' });
    }

    res.status(200).json({
      ...rows[0],
      regimen_fiscal_descripcion: describirRegimenFiscal(rows[0].regimen_fiscal),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadTerceros, consultarTercero, TIPOS_OPERACION };
