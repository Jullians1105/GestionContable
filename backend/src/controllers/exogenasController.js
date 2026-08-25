const db = require('../config/database');
const { getEstrategia } = require('../services/exogenas');

// Solo 1005 está en alcance de esta fase — 1001/1006/1007 se habilitan acá cuando les
// llegue su turno, reusando el mismo controller (la lógica específica vive en la estrategia).
const FORMATOS_SOPORTADOS = ['1005'];

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const sumarVimp = (registros) => round2(registros.reduce((s, r) => s + r.vimp, 0));

const uploadExogenas = async (req, res, next) => {
  try {
    const { formato } = req.body;
    if (!FORMATOS_SOPORTADOS.includes(formato)) {
      return res.status(400).json({ error: `Formato de Exógena no soportado: "${formato}".` });
    }

    const tokenFile = req.files?.token?.[0];
    const plantillaFile = req.files?.plantilla?.[0];
    if (!tokenFile) {
      return res.status(400).json({ error: 'Se requiere el archivo TOKEN (detalle de compras).' });
    }
    if (!plantillaFile) {
      return res.status(400).json({ error: 'Se requiere la plantilla SIIGO.' });
    }

    const estrategia = getEstrategia(formato);

    let registros;
    try {
      registros = await estrategia.leerYAgrupar(tokenFile.buffer);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    if (registros.length === 0) {
      return res.status(400).json({
        error: 'No se encontraron registros válidos para procesar. Revisa el archivo TOKEN.',
      });
    }

    const { rows } = await db.query(
      `INSERT INTO exogenas_borradores
         (formato, nombre_token, nombre_plantilla, creado_por, registros, token_original, plantilla_original)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        formato,
        tokenFile.originalname,
        plantillaFile.originalname,
        req.user.userId,
        JSON.stringify(registros),
        tokenFile.buffer,
        plantillaFile.buffer,
      ]
    );

    res.status(201).json({
      id: rows[0].id,
      formato,
      totalTerceros: registros.length,
      totalVimp: sumarVimp(registros),
      registros,
    });
  } catch (err) {
    next(err);
  }
};

const getExogenasBorrador = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT id, formato, nombre_token, nombre_plantilla, registros, created_at
       FROM exogenas_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const { registros, ...meta } = rows[0];
    res.json({
      ...meta,
      registros,
      totalTerceros: registros.length,
      totalVimp: sumarVimp(registros),
    });
  } catch (err) {
    next(err);
  }
};

const generarExogenas = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(
      `SELECT formato, registros, plantilla_original, nombre_plantilla
       FROM exogenas_borradores WHERE id = $1 AND creado_por = $2`,
      [id, req.user.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const { formato, registros, plantilla_original: plantillaBuffer, nombre_plantilla: nombrePlantilla } = rows[0];
    const estrategia = getEstrategia(formato);

    let buffer;
    try {
      buffer = await estrategia.llenarPlantilla(plantillaBuffer, registros);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const nombreSan = nombrePlantilla
      .replace(/\.xlsx?$/i, '')
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .slice(0, 60) || 'PLANTILLA';
    const filename = `${nombreSan} - ${formato} GENERADO.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(buffer));

    await db.query('DELETE FROM exogenas_borradores WHERE id = $1 AND creado_por = $2', [id, req.user.userId]);
  } catch (err) {
    next(err);
  }
};

module.exports = { uploadExogenas, getExogenasBorrador, generarExogenas, FORMATOS_SOPORTADOS };
