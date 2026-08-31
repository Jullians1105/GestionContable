jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const { calcularDV } = require('../../src/services/exogenas/utils/dian');
const { leerYAgrupar, enriquecerConPais, llenarPlantilla } = require('../../src/services/exogenas/formato1007');

const COLUMNAS_VENTAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total', 'IVA', 'INC', 'Grupo'];
const COLUMNAS_DEV_VENTAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total', 'IVA'];

async function construirToken(filas, { devVentasFilas = null } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VENTAS');
  ws.addRow(COLUMNAS_VENTAS);
  filas.forEach((f) => {
    ws.addRow([
      f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.total ?? 0, f.iva ?? 0, f.inc ?? 0, f.grupo ?? 'Emitido',
    ]);
  });

  if (devVentasFilas) {
    const wsDev = wb.addWorksheet('DEV VENTAS');
    wsDev.addRow(COLUMNAS_DEV_VENTAS);
    devVentasFilas.forEach((f) => wsDev.addRow([f.tipo ?? 'Nota de crédito electrónica', f.nit, f.nombre, f.total ?? 0, f.iva ?? 0]));
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('formato1007 — leerYAgrupar', () => {
  test('resta IVA e INC del Total para obtener IBRU', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 119000, iva: 19000, inc: 0 },
    ]);
    const [r] = await leerYAgrupar(buffer);
    expect(r.identificacion).toBe('900123456');
    expect(r.ibru).toBe(100000);
    expect(r.dev).toBe(0);
  });

  test('resta solo los impuestos que existan como columna en el archivo (ICA no está en este TOKEN)', async () => {
    // Este TOKEN no trae columna "ICA" — si existiera un valor de ICA no declarado como columna,
    // no debe descontarse (no puede leerse lo que no está mapeado).
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 100000, iva: 0, inc: 0 },
    ]);
    const [r] = await leerYAgrupar(buffer);
    expect(r.ibru).toBe(100000);
  });

  test('acumula varias filas del mismo NIT y agrupa DEV VENTAS aparte', async () => {
    const buffer = await construirToken(
      [
        { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 119000, iva: 19000 },
        { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 238000, iva: 38000 },
      ],
      { devVentasFilas: [{ nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 11900, iva: 1900 }] }
    );
    const [r] = await leerYAgrupar(buffer);
    expect(r.ibru).toBe(300000); // 100000 + 200000
    expect(r.dev).toBe(10000);
  });

  test('excluye Grupo distinto de Emitido y notas crédito en VENTAS', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'X', total: 119000, iva: 19000, grupo: 'Recibido' },
      { nit: '800654321', nombre: 'Y', total: 119000, iva: 19000, tipo: 'Nota de crédito electrónica' },
    ]);
    const registros = await leerYAgrupar(buffer);
    expect(registros).toHaveLength(0);
  });

  test('en DEV VENTAS solo suma filas que sean nota crédito, ignora otros tipos de documento', async () => {
    const buffer = await construirToken(
      [{ nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 119000, iva: 19000 }],
      {
        devVentasFilas: [
          { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 11900, iva: 1900, tipo: 'Nota de crédito electrónica' },
          { nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 50000, iva: 0, tipo: 'Factura electrónica' },
        ],
      }
    );
    const [r] = await leerYAgrupar(buffer);
    expect(r.dev).toBe(10000); // solo la nota crédito (11900 - 1900), no los 50000 de la factura
  });

  test('ignora filas con subtotal en cero', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'X', total: 19000, iva: 19000 }, // subtotal 0
    ]);
    const registros = await leerYAgrupar(buffer);
    expect(registros).toHaveLength(0);
  });

  test('ignora filas ocultas por un filtro (AutoFilter) en VENTAS y en DEV VENTAS', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('VENTAS');
    ws.addRow(COLUMNAS_VENTAS);
    ws.addRow(['Factura electrónica', '900123456', 'CLIENTE UNO SAS', 119000, 19000, 0, 'Emitido']);
    const filaOculta = ws.addRow(['Factura electrónica', '800654321', 'OTRO CLIENTE', 238000, 38000, 0, 'Emitido']);
    filaOculta.hidden = true;

    const wsDev = wb.addWorksheet('DEV VENTAS');
    wsDev.addRow(COLUMNAS_DEV_VENTAS);
    const filaDevOculta = wsDev.addRow(['Nota de crédito electrónica', '900123456', 'CLIENTE UNO SAS', 11900, 1900]);
    filaDevOculta.hidden = true;

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const registros = await leerYAgrupar(buffer);

    expect(registros).toHaveLength(1); // el NIT 800654321 quedó completamente oculto, no genera registro
    expect(registros[0].identificacion).toBe('900123456');
    expect(registros[0].ibru).toBe(100000);
    expect(registros[0].dev).toBe(0); // la única fila de DEV VENTAS estaba oculta
  });

  test('lanza error si falta la hoja VENTAS', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('OTRA');
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(leerYAgrupar(buffer)).rejects.toThrow(/VENTAS/);
  });
});

describe('formato1007 — enriquecerConPais', () => {
  beforeEach(() => db.query.mockReset());

  test('marca tienePais cuando el NIT existe en terceros con codigo_pais_dian', async () => {
    db.query.mockResolvedValue({
      rows: [{ nit: '900123456', pais: 'COLOMBIA', codigo_pais_dian: '169' }],
    });
    const [r] = await enriquecerConPais([{ identificacion: '900123456', ibru: 100, dev: 0 }]);
    expect(r.tienePais).toBe(true);
    expect(r.pais).toBe('COLOMBIA');
    expect(r.codigoPaisDian).toBe('169');
  });

  test('tienePais en false si el NIT no existe en terceros', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const [r] = await enriquecerConPais([{ identificacion: '999999999', ibru: 100, dev: 0 }]);
    expect(r.tienePais).toBe(false);
    expect(r.pais).toBeNull();
    expect(r.codigoPaisDian).toBeNull();
  });

  test('sin registros no consulta la base', async () => {
    const resultado = await enriquecerConPais([]);
    expect(resultado).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

const HEADERS_1007 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Primer Apellido del informado (APL1)', 'Segundo Apellido del informado (APL2)',
  'Primer Nombre del informado (NOM1)', 'Otros Nombres del informado (NOM2)',
  'Razón Social del Informado (RAZ)', 'País de Residencia o domicilio (PAIS)',
  'Ingresos brutos recibidos (IBRU)', 'Devoluciones rebajas y descuentos (DEV)',
];

async function construirPlantilla({ nombreHoja = '1007', filaHeader = 7 } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  for (let i = 1; i < filaHeader; i++) ws.addRow([]);
  ws.addRow(HEADERS_1007);
  return wb;
}

describe('formato1007.llenarPlantilla', () => {
  test('jurídica: TDOC/NID, todo el nombre en RAZ, PAIS/IBRU/DEV — CPT y DV no se tocan (1007 no tiene DV)', async () => {
    const wb = await construirPlantilla();
    const registros = [
      { tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: calcularDV('900123456'), razonSocial: 'ACME SAS', ibru: 1234.56, dev: 30, codigoPaisDian: '169' },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1007').getRow(8);
    expect(fila.getCell(1).value).toBeNull();     // CPT queda en blanco (concepto sin definir)
    expect(fila.getCell(2).value).toBe(31);        // TDOC
    expect(fila.getCell(3).value).toBe(900123456); // NID
    expect(fila.getCell(8).value).toBe('ACME SAS'); // RAZ
    expect(fila.getCell(9).value).toBe(169);        // PAIS
    expect(fila.getCell(10).value).toBe(1234.56);   // IBRU
    expect(fila.getCell(11).value).toBe(30);        // DEV
  });

  test('persona natural: separa el nombre en APL1/APL2/NOM1/NOM2 y deja RAZ vacío', async () => {
    const wb = await construirPlantilla();
    const registros = [
      { tipoDocumento: 13, identificacion: '80123456', digitoVerificacion: 3, razonSocial: 'Juan Carlos Perez Gomez', ibru: 100, dev: 0, codigoPaisDian: null },
    ];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1007').getRow(8);
    // Orden en HEADERS_1007: 1 CPT, 2 TDOC, 3 NID, 4 APL1, 5 APL2, 6 NOM1, 7 NOM2, 8 RAZ, 9 PAIS, 10 IBRU, 11 DEV
    expect(fila.getCell(4).value).toBe('PEREZ');  // APL1
    expect(fila.getCell(5).value).toBe('GOMEZ');  // APL2
    expect(fila.getCell(6).value).toBe('JUAN');   // NOM1
    expect(fila.getCell(7).value).toBe('CARLOS'); // NOM2
    expect(fila.getCell(8).value).toBeNull();     // RAZ vacío para persona natural
    expect(fila.getCell(9).value).toBeNull();     // PAIS vacío: no había codigoPaisDian
  });

  test('lanza error si la plantilla no tiene hoja 1007', async () => {
    const wb = await construirPlantilla({ nombreHoja: 'OTRA' });
    await expect(llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [])).rejects.toThrow(/"1007"/);
  });
});
