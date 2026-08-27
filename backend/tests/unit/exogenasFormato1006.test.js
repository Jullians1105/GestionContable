const ExcelJS = require('exceljs');
const { calcularDV } = require('../../src/services/exogenas/utils/dian');
const { leerYAgrupar, llenarPlantilla } = require('../../src/services/exogenas/formato1006');

const COLUMNAS_VENTAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'IVA', 'INC', 'Grupo'];
const COLUMNAS_DEV_COMPRAS = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'IVA', 'Grupo'];

async function construirToken(filas, { nombreHoja = 'VENTAS', devComprasFilas = null } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  ws.addRow(COLUMNAS_VENTAS);
  filas.forEach((f) => {
    ws.addRow([f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.iva ?? 0, f.inc ?? 0, f.grupo ?? 'Emitido']);
  });

  if (devComprasFilas) {
    const wsDev = wb.addWorksheet('DEV COMPRAS');
    wsDev.addRow(COLUMNAS_DEV_COMPRAS);
    devComprasFilas.forEach((f) =>
      wsDev.addRow([f.tipo ?? 'Nota de crédito electrónica', f.nit, f.nombre, f.iva ?? 0, f.grupo ?? 'Recibido'])
    );
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS_1006 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Dígito de Verificación (DV)', 'Primer Apellido del informado (APL1)',
  'Segundo Apellido del informado (APL2)', 'Primer Nombre del informado (NOM1)',
  'Otros Nombres del informado (NOM2)', 'Razón Social del Informado (RAZ)',
  'Impuesto generado (IMP)', 'IVA Recuperado en devoluciones en compras anuladas rescindidas o resueltas (IVA)',
  'Impuesto nacional al consumo (ICON)',
];

async function construirPlantilla({ nombreHoja = '1006', filaHeader = 7 } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  for (let i = 1; i < filaHeader; i++) ws.addRow([]);
  ws.addRow(HEADERS_1006);
  return { wb, ws };
}

describe('formato1006.leerYAgrupar', () => {
  test('agrupa por (tipoDocumento, identificacion), suma IVA e INC de VENTAS en IMP/ICON', async () => {
    const token = await construirToken([
      { nit: '900123456', nombre: 'ACME SAS', iva: 100, inc: 10 },
      { nit: '900.123.456', nombre: 'ACME SOCIEDAD ANONIMA SAS', iva: 50, inc: 5 },
    ]);
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      tipoDocumento: 31,
      identificacion: '900123456',
      razonSocial: 'ACME SOCIEDAD ANONIMA SAS',
      imp: 150,
      icon: 15,
      iva: 0,
    });
    expect(registros[0].digitoVerificacion).toBe(calcularDV('900123456'));
  });

  test('descarta filas con Grupo distinto de Emitido, notas crédito, e IVA/INC ambos en cero', async () => {
    const token = await construirToken([
      { nit: '900123456', nombre: 'ACME SAS', iva: 100, grupo: 'Recibido' },
      { nit: '900654321', nombre: 'OTRA SAS', iva: 100, tipo: 'Nota de crédito electrónica' },
      { nit: '900111222', nombre: 'SIN IMPUESTOS SAS', iva: 0, inc: 0 },
    ]);
    const registros = await leerYAgrupar(token);
    expect(registros).toHaveLength(0);
  });

  test('conserva la fila si INC > 0 aunque IVA sea 0', async () => {
    const token = await construirToken([{ nit: '900123456', nombre: 'ACME SAS', iva: 0, inc: 20 }]);
    const registros = await leerYAgrupar(token);
    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ imp: 0, icon: 20 });
  });

  test('lanza error si falta la hoja VENTAS', async () => {
    const token = await construirToken([{ nit: '1', nombre: 'X', iva: 1 }], { nombreHoja: 'OTRA' });
    await expect(leerYAgrupar(token)).rejects.toThrow(/VENTAS/);
  });

  test('DEV COMPRAS (opcional): solo cuenta notas crédito recibidas, tercero del Emisor', async () => {
    const token = await construirToken(
      [{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }],
      { devComprasFilas: [{ nit: '900654321', nombre: 'PROVEEDOR SAS', iva: 30 }] }
    );
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(2);
    const proveedor = registros.find((r) => r.identificacion === '900654321');
    expect(proveedor).toMatchObject({ imp: 0, iva: 30 });
    const cliente = registros.find((r) => r.identificacion === '900123456');
    expect(cliente).toMatchObject({ imp: 100, iva: 0 });
  });

  test('DEV COMPRAS: ignora filas que no son nota crédito o que no son Grupo=Recibido', async () => {
    const token = await construirToken(
      [{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }],
      {
        devComprasFilas: [
          { nit: '900654321', nombre: 'PROVEEDOR SAS', iva: 30, tipo: 'Factura electrónica' },
          { nit: '900654321', nombre: 'PROVEEDOR SAS', iva: 30, grupo: 'Emitido' },
        ],
      }
    );
    const registros = await leerYAgrupar(token);
    expect(registros).toHaveLength(1);
    expect(registros[0].identificacion).toBe('900123456');
  });

  test('DEV COMPRAS: si el mismo NIT ya existe por VENTAS, se fusiona en una sola fila', async () => {
    const token = await construirToken(
      [{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }],
      { devComprasFilas: [{ nit: '900123456', nombre: 'ACME SAS', iva: 30 }] }
    );
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ identificacion: '900123456', imp: 100, iva: 30 });
  });

  test('sin hoja DEV COMPRAS, iva queda en 0 para todos los registros', async () => {
    const token = await construirToken([{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }]);
    const registros = await leerYAgrupar(token);
    expect(registros[0].iva).toBe(0);
  });
});

describe('formato1006.llenarPlantilla', () => {
  test('jurídica: escribe CPT fijo, TDOC/NID/DV, todo el nombre en RAZ, IMP/IVA/ICON', async () => {
    const { wb, ws } = await construirPlantilla();
    const registros = [
      { tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: 8, razonSocial: 'ACME SAS', imp: 1234.56, iva: 30, icon: 10 },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1006').getRow(8);
    expect(fila.getCell(1).value).toBe(6666); // CPT
    expect(fila.getCell(2).value).toBe(31);   // TDOC
    expect(fila.getCell(3).value).toBe(900123456); // NID
    expect(fila.getCell(4).value).toBe(8);    // DV
    expect(fila.getCell(9).value).toBe('ACME SAS'); // RAZ
    expect(fila.getCell(10).value).toBe(1234.56); // IMP
    expect(fila.getCell(11).value).toBe(30);  // IVA
    expect(fila.getCell(12).value).toBe(10);  // ICON
    expect(ws).toBeDefined();
  });

  test('persona natural: separa el nombre en APL1/APL2/NOM1/NOM2 y deja RAZ vacío', async () => {
    const { wb } = await construirPlantilla();
    const registros = [
      { tipoDocumento: 13, identificacion: '80123456', digitoVerificacion: 3, razonSocial: 'Juan Carlos Perez Gomez', imp: 100, iva: 0, icon: 0 },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1006').getRow(8);
    expect(fila.getCell(5).value).toBe('PEREZ');  // APL1
    expect(fila.getCell(6).value).toBe('GOMEZ');  // APL2
    expect(fila.getCell(7).value).toBe('JUAN');   // NOM1
    expect(fila.getCell(8).value).toBe('CARLOS'); // NOM2
    expect(fila.getCell(9).value).toBeNull();     // RAZ vacío para persona natural
  });

  test('no toca columnas fuera de las 12 objetivo', async () => {
    const { wb } = await construirPlantilla();
    const wsAntes = wb.getWorksheet('1006');
    wsAntes.getCell('M1').value = 'no tocar';

    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [
      { tipoDocumento: 31, identificacion: '1', digitoVerificacion: 1, razonSocial: 'X', imp: 1, iva: 0, icon: 0 },
    ]);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.getWorksheet('1006').getCell('M1').value).toBe('no tocar');
  });

  test('lanza error si la plantilla no tiene hoja 1006', async () => {
    const { wb } = await construirPlantilla({ nombreHoja: 'OTRA' });
    await expect(llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [])).rejects.toThrow(/"1006"/);
  });
});
