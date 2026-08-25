const { normalizarTexto } = require('./dian');

// Extrae el valor primitivo de una celda de exceljs (maneja fórmulas y texto enriquecido).
function getCellText(cell) {
  const val = cell.value;
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && 'result' in val) return String(val.result ?? '');
  if (typeof val === 'object' && val.richText) {
    return val.richText.map((r) => r.text).join('');
  }
  return String(val);
}

// Busca dinámicamente, dentro de las primeras `maxFilas` filas de la hoja, la fila que
// contenga (como substring normalizado) cada uno de los encabezados objetivo. Hace la
// plantilla resiliente a que SIIGO cambie ligeramente el layout de fila/columna entre años,
// siempre que los textos de encabezado se mantengan. Puerto de encontrar_fila_y_columnas_1005
// (docs/arqExogena.md §6.6), generalizado para reusarse en 1001/1006/1007.
function encontrarFilaYColumnas(ws, headersObjetivo, maxFilas = 40) {
  const objetivosNorm = headersObjetivo.map(normalizarTexto);
  const limite = Math.min(maxFilas, ws.rowCount);

  for (let r = 1; r <= limite; r++) {
    const columnas = {};
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const norm = normalizarTexto(getCellText(cell));
      if (!norm) return;
      const idx = objetivosNorm.findIndex((obj) => norm.includes(obj));
      if (idx !== -1 && !(headersObjetivo[idx] in columnas)) {
        columnas[headersObjetivo[idx]] = colNumber;
      }
    });
    if (Object.keys(columnas).length === headersObjetivo.length) {
      return { filaDatos: r + 1, columnas };
    }
  }

  throw new Error(
    `No se encontró en las primeras ${maxFilas} filas una fila de encabezados que contenga: ${headersObjetivo.join(', ')}.`
  );
}

// Copia estilo completo (font, fill, border, alignment, numFmt, protection) y alto de fila,
// de una fila modelo a una fila destino. Puerto de copiar_estilo_fila (arqExogena.md §6.7).
function copiarEstiloFila(ws, filaModeloNum, filaDestinoNum) {
  const modelo = ws.getRow(filaModeloNum);
  const destino = ws.getRow(filaDestinoNum);
  modelo.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    destino.getCell(colNumber).style = JSON.parse(JSON.stringify(cell.style));
  });
  if (modelo.height) destino.height = modelo.height;
}

module.exports = { getCellText, encontrarFilaYColumnas, copiarEstiloFila };
