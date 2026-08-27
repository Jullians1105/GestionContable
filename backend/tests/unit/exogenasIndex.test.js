const ExcelJS = require('exceljs');
const { getEstrategia, llenarPlantillaCombinada } = require('../../src/services/exogenas');

describe('getEstrategia', () => {
  test('devuelve la estrategia de un formato soportado', () => {
    expect(getEstrategia('1005')).toHaveProperty('leerYAgrupar');
    expect(getEstrategia('1006')).toHaveProperty('leerYAgrupar');
  });

  test('lanza error con los formatos disponibles si no existe', () => {
    expect(() => getEstrategia('9999')).toThrow(/no soportado.*1005.*1006/is);
  });
});

const HEADERS_1005 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Dígito de Verificación (DV)', 'Primer Apellido del informado (APL1)',
  'Segundo Apellido del informado (APL2)', 'Primer Nombre del informado (NOM1)',
  'Otros Nombres del informado (NOM2)', 'Razón Social del Informado (RAZ)',
  'Impuesto descontable (VIMP)', 'IVA resultante por devoluciones en ventas anuladas (IVADE)',
];
const HEADERS_1006 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Dígito de Verificación (DV)', 'Primer Apellido del informado (APL1)',
  'Segundo Apellido del informado (APL2)', 'Primer Nombre del informado (NOM1)',
  'Otros Nombres del informado (NOM2)', 'Razón Social del Informado (RAZ)',
  'Impuesto generado (IMP)', 'IVA Recuperado en devoluciones en compras anuladas rescindidas o resueltas (IVA)',
  'Impuesto nacional al consumo (ICON)',
];

async function construirPlantillaCombinada({ incluir1006 = true } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws1001 = wb.addWorksheet('1001');
  ws1001.getCell('A1').value = 'no tocar';

  const ws1005 = wb.addWorksheet('1005');
  for (let i = 1; i < 7; i++) ws1005.addRow([]);
  ws1005.addRow(HEADERS_1005);

  if (incluir1006) {
    const ws1006 = wb.addWorksheet('1006');
    for (let i = 1; i < 7; i++) ws1006.addRow([]);
    ws1006.addRow(HEADERS_1006);
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('llenarPlantillaCombinada', () => {
  test('llena la hoja de cada formato en el MISMO archivo, sin tocar las demás hojas', async () => {
    const plantilla = await construirPlantillaCombinada();
    const registrosPorFormato = {
      1005: [{ tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: 8, razonSocial: 'ACME SAS', vimp: 100, ivade: 0 }],
      1006: [{ tipoDocumento: 31, identificacion: '900654321', digitoVerificacion: 3, razonSocial: 'OTRA SAS', imp: 200, iva: 0, icon: 0 }],
    };

    const buffer = await llenarPlantillaCombinada(plantilla, registrosPorFormato);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.worksheets.map((w) => w.name)).toEqual(['1001', '1005', '1006']);

    const fila1005 = wb2.getWorksheet('1005').getRow(8);
    expect(fila1005.getCell(1).value).toBe(5555);
    expect(fila1005.getCell(9).value).toBe('ACME SAS');
    expect(fila1005.getCell(10).value).toBe(100);

    const fila1006 = wb2.getWorksheet('1006').getRow(8);
    expect(fila1006.getCell(1).value).toBe(6666);
    expect(fila1006.getCell(9).value).toBe('OTRA SAS');
    expect(fila1006.getCell(10).value).toBe(200);

    expect(wb2.getWorksheet('1001').getCell('A1').value).toBe('no tocar');
  });

  test('un solo formato en el mapa llena solo esa hoja', async () => {
    const plantilla = await construirPlantillaCombinada();
    const buffer = await llenarPlantillaCombinada(plantilla, {
      1005: [{ tipoDocumento: 13, identificacion: '80123456', digitoVerificacion: 3, razonSocial: 'Juan Perez', vimp: 50, ivade: 0 }],
    });
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.getWorksheet('1005').getRow(8).getCell(10).value).toBe(50);
    // La hoja 1006 de la plantilla queda intacta (nunca se tocó, no hay registros para ella).
    expect(wb2.getWorksheet('1006').getRow(8).getCell(10).value).toBeNull();
  });

  test('lanza el mensaje de negocio si la plantilla no tiene la hoja de alguno de los formatos pedidos', async () => {
    const plantillaSin1006 = await construirPlantillaCombinada({ incluir1006: false });
    await expect(
      llenarPlantillaCombinada(plantillaSin1006, {
        1005: [{ tipoDocumento: 31, identificacion: '1', digitoVerificacion: 1, razonSocial: 'X', vimp: 1, ivade: 0 }],
        1006: [{ tipoDocumento: 31, identificacion: '2', digitoVerificacion: 2, razonSocial: 'Y', imp: 1, iva: 0, icon: 0 }],
      })
    ).rejects.toThrow(/"1006"/);
  });
});
