const ExcelJS = require('exceljs');
const {
  normalizarTexto,
  limpiarIdentificacion,
  calcularDV,
  inferirTipoDocumento,
  esNotaCredito,
  separarNombrePersona,
} = require('../../src/services/exogenas/utils/dian');
const { encontrarFilaYColumnas, copiarEstiloFila } = require('../../src/services/exogenas/utils/plantillaExcel');
const { leerYAgrupar, llenarPlantilla } = require('../../src/services/exogenas/formato1005');

describe('utils/dian', () => {
  test('normalizarTexto quita acentos, pasa a mayúsculas y colapsa espacios', () => {
    expect(normalizarTexto('  Café   con Ñoño  ')).toBe('CAFE CON NONO');
  });

  test('limpiarIdentificacion deja solo dígitos', () => {
    expect(limpiarIdentificacion('900.123.456-7')).toBe('9001234567');
  });

  // Ejemplo público conocido del algoritmo módulo 11 de la DIAN.
  test('calcularDV reproduce el DV oficial de un NIT de referencia', () => {
    expect(calcularDV('800197268')).toBe(4);
  });

  test('calcularDV rellena con ceros identificaciones cortas (cédulas)', () => {
    expect(typeof calcularDV('12345678')).toBe('number');
  });

  test('inferirTipoDocumento detecta jurídica por palabra clave en el nombre', () => {
    expect(inferirTipoDocumento('900123456', 'ACME SAS')).toBe(31);
  });

  test('inferirTipoDocumento detecta jurídica por heurística de NIT (9+ dígitos, empieza en 8/9)', () => {
    expect(inferirTipoDocumento('912345678', 'SIN PALABRA CLAVE CONOCIDA')).toBe(31);
  });

  test('inferirTipoDocumento cae en persona natural por defecto', () => {
    expect(inferirTipoDocumento('80123456', 'JUAN PEREZ')).toBe(13);
  });

  test('esNotaCredito reconoce las variantes de nota crédito', () => {
    expect(esNotaCredito('Nota de crédito electrónica')).toBe(true);
    expect(esNotaCredito('Factura electrónica')).toBe(false);
  });

  describe('separarNombrePersona — primero nombres, luego apellidos', () => {
    test('4 palabras: 2 nombres + 2 apellidos', () => {
      expect(separarNombrePersona('Andrea del Pilar Ardila Cardenas')).toEqual({
        nom1: 'ANDREA', nom2: 'DEL', apl1: 'PILAR', apl2: 'ARDILA CARDENAS',
      });
    });

    test('3 palabras: 2 nombres + 1 apellido', () => {
      expect(separarNombrePersona('Juan Carlos Perez')).toEqual({
        nom1: 'JUAN', nom2: 'CARLOS', apl1: 'PEREZ', apl2: '',
      });
    });

    test('2 palabras: 1 nombre + 1 apellido', () => {
      expect(separarNombrePersona('Juan Perez')).toEqual({
        nom1: 'JUAN', nom2: '', apl1: 'PEREZ', apl2: '',
      });
    });

    test('1 palabra: todo en el primer nombre', () => {
      expect(separarNombrePersona('Cristancho')).toEqual({
        nom1: 'CRISTANCHO', nom2: '', apl1: '', apl2: '',
      });
    });
  });
});

describe('utils/plantillaExcel', () => {
  test('encontrarFilaYColumnas ubica la fila de encabezados sin importar en qué fila del rango esté', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    ws.addRow(['ruido']);
    ws.addRow(['más ruido']);
    ws.addRow(['A', 'B', 'C']);

    const { filaDatos, columnas } = encontrarFilaYColumnas(ws, ['A', 'B', 'C'], 10);
    expect(filaDatos).toBe(4);
    expect(columnas).toEqual({ A: 1, B: 2, C: 3 });
  });

  test('encontrarFilaYColumnas lanza error si falta algún encabezado en el rango', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    ws.addRow(['A', 'B']);
    expect(() => encontrarFilaYColumnas(ws, ['A', 'B', 'C'], 10)).toThrow(/no se encontró/i);
  });

  test('copiarEstiloFila copia numFmt y alto de una fila a otra', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Hoja1');
    const modelo = ws.getRow(1);
    modelo.getCell(1).numFmt = '#,##0.00';
    modelo.height = 22;

    copiarEstiloFila(ws, 1, 5);

    expect(ws.getRow(5).getCell(1).numFmt).toBe('#,##0.00');
    expect(ws.getRow(5).height).toBe(22);
  });
});

const COLUMNAS_TOKEN = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'IVA', 'Grupo'];
const COLUMNAS_DEV_VENTAS = ['NIT Receptor', 'Nombre Receptor', 'IVA'];

async function construirToken(filas, { nombreHoja = 'COMPRAS', devVentasFilas = null } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  ws.addRow(COLUMNAS_TOKEN);
  filas.forEach((f) => {
    ws.addRow([f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.iva ?? 0, f.grupo ?? 'Recibido']);
  });

  if (devVentasFilas) {
    const wsDev = wb.addWorksheet('DEV VENTAS');
    wsDev.addRow(COLUMNAS_DEV_VENTAS);
    devVentasFilas.forEach((f) => wsDev.addRow([f.nit, f.nombre, f.iva ?? 0]));
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

const HEADERS_1005 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Dígito de Verificación (DV)', 'Primer Apellido del informado (APL1)',
  'Segundo Apellido del informado (APL2)', 'Primer Nombre del informado (NOM1)',
  'Otros Nombres del informado (NOM2)', 'Razón Social del Informado (RAZ)',
  'Impuesto descontable (VIMP)', 'IVA resultante por devoluciones en ventas anuladas (IVADE)',
];

async function construirPlantilla({ nombreHoja = '1005', filaHeader = 7 } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  for (let i = 1; i < filaHeader; i++) ws.addRow([]);
  ws.addRow(HEADERS_1005);
  return { wb, ws };
}

describe('formato1005.leerYAgrupar', () => {
  test('agrupa por (tipoDocumento, identificacion), suma IVA y conserva el nombre más largo', async () => {
    const token = await construirToken([
      { nit: '900123456', nombre: 'ACME SAS', iva: 100 },
      { nit: '900.123.456', nombre: 'ACME SOCIEDAD ANONIMA SAS', iva: 50 },
    ]);
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({
      tipoDocumento: 31,
      identificacion: '900123456',
      razonSocial: 'ACME SOCIEDAD ANONIMA SAS',
      vimp: 150,
    });
    expect(registros[0].digitoVerificacion).toBe(calcularDV('900123456'));
  });

  test('descarta filas con Grupo distinto de Recibido, notas crédito e IVA en cero', async () => {
    const token = await construirToken([
      { nit: '900123456', nombre: 'ACME SAS', iva: 100, grupo: 'Emitido' },
      { nit: '900654321', nombre: 'OTRA SAS', iva: 100, tipo: 'Nota de crédito electrónica' },
      { nit: '900111222', nombre: 'SIN IVA SAS', iva: 0 },
    ]);
    const registros = await leerYAgrupar(token);
    expect(registros).toHaveLength(0);
  });

  test('lanza error si falta la hoja COMPRAS', async () => {
    const token = await construirToken([{ nit: '1', nombre: 'X', iva: 1 }], { nombreHoja: 'OTRA' });
    await expect(leerYAgrupar(token)).rejects.toThrow(/COMPRAS/);
  });

  test('DEV VENTAS (opcional): agrega clientes nuevos con IVADE, tomando el tercero del Receptor', async () => {
    const token = await construirToken(
      [{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }],
      { devVentasFilas: [{ nit: '80123456', nombre: 'Juan Perez', iva: 30 }] }
    );
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(2);
    const cliente = registros.find((r) => r.identificacion === '80123456');
    expect(cliente).toMatchObject({ tipoDocumento: 13, vimp: 0, ivade: 30 });
    const proveedor = registros.find((r) => r.identificacion === '900123456');
    expect(proveedor).toMatchObject({ vimp: 100, ivade: 0 });
  });

  test('DEV VENTAS: si el mismo NIT ya existe por COMPRAS, se fusiona en una sola fila (no se duplica el NID)', async () => {
    const token = await construirToken(
      [{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }],
      { devVentasFilas: [{ nit: '900123456', nombre: 'ACME SAS', iva: 30 }] }
    );
    const registros = await leerYAgrupar(token);

    expect(registros).toHaveLength(1);
    expect(registros[0]).toMatchObject({ identificacion: '900123456', vimp: 100, ivade: 30 });
  });

  test('sin hoja DEV VENTAS, ivade queda en 0 para todos los registros', async () => {
    const token = await construirToken([{ nit: '900123456', nombre: 'ACME SAS', iva: 100 }]);
    const registros = await leerYAgrupar(token);
    expect(registros[0].ivade).toBe(0);
  });
});

describe('formato1005.llenarPlantilla', () => {
  test('jurídica: escribe CPT fijo, TDOC/NID/DV, todo el nombre en RAZ, VIMP e IVADE', async () => {
    const { wb, ws } = await construirPlantilla();
    const registros = [
      { tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: 8, razonSocial: 'ACME SAS', vimp: 1234.56, ivade: 30 },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1005').getRow(8);
    expect(fila.getCell(1).value).toBe(5555); // CPT
    expect(fila.getCell(2).value).toBe(31);   // TDOC
    expect(fila.getCell(3).value).toBe(900123456); // NID
    expect(fila.getCell(4).value).toBe(8);    // DV
    expect(fila.getCell(9).value).toBe('ACME SAS'); // RAZ
    expect(fila.getCell(10).value).toBe(1234.56); // VIMP
    expect(fila.getCell(11).value).toBe(30);  // IVADE
    expect(ws).toBeDefined();
  });

  test('persona natural: separa el nombre en APL1/APL2/NOM1/NOM2 y deja RAZ vacío', async () => {
    const { wb } = await construirPlantilla();
    const registros = [
      { tipoDocumento: 13, identificacion: '80123456', digitoVerificacion: 3, razonSocial: 'Juan Carlos Perez Gomez', vimp: 100, ivade: 0 },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1005').getRow(8);
    // Orden de columnas en HEADERS_1005: 1 CPT, 2 TDOC, 3 NID, 4 DV, 5 APL1, 6 APL2, 7 NOM1, 8 NOM2, 9 RAZ, 10 VIMP, 11 IVADE
    expect(fila.getCell(5).value).toBe('PEREZ');  // APL1
    expect(fila.getCell(6).value).toBe('GOMEZ');  // APL2
    expect(fila.getCell(7).value).toBe('JUAN');   // NOM1
    expect(fila.getCell(8).value).toBe('CARLOS'); // NOM2
    expect(fila.getCell(9).value).toBeNull();     // RAZ vacío para persona natural
  });

  test('no toca columnas fuera de las 11 objetivo (IVAVCG no existe en esta plantilla de prueba)', async () => {
    const { wb } = await construirPlantilla();
    const wsAntes = wb.getWorksheet('1005');
    wsAntes.getCell('L1').value = 'no tocar';

    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [
      { tipoDocumento: 31, identificacion: '1', digitoVerificacion: 1, razonSocial: 'X', vimp: 1, ivade: 0 },
    ]);
    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    expect(wb2.getWorksheet('1005').getCell('L1').value).toBe('no tocar');
  });

  test('lanza error si la plantilla no tiene hoja 1005', async () => {
    const { wb } = await construirPlantilla({ nombreHoja: 'OTRA' });
    await expect(llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [])).rejects.toThrow(/"1005"/);
  });
});
