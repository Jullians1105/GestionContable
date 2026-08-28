const ExcelJS = require('exceljs');
const { leerYAgrupar } = require('../../src/services/exogenas/formato1007');
const { verificarIngresos1007 } = require('../../src/controllers/exogenasController');

const COLUMNAS_VENTAS = ['Tipo de documento', 'NIT Receptor', 'Nombre Receptor', 'Total', 'IVA', 'INC', 'Grupo'];
const COLUMNAS_DEV_VENTAS = ['NIT Receptor', 'Nombre Receptor', 'Total', 'IVA'];

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
    devVentasFilas.forEach((f) => wsDev.addRow([f.nit, f.nombre, f.total ?? 0, f.iva ?? 0]));
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

  test('ignora filas con subtotal en cero', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'X', total: 19000, iva: 19000 }, // subtotal 0
    ]);
    const registros = await leerYAgrupar(buffer);
    expect(registros).toHaveLength(0);
  });

  test('lanza error si falta la hoja VENTAS', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('OTRA');
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(leerYAgrupar(buffer)).rejects.toThrow(/VENTAS/);
  });
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

describe('verificarIngresos1007 (controller)', () => {
  test('rechaza si no se envió el archivo TOKEN', async () => {
    const req = { file: null };
    const res = mockRes();
    await verificarIngresos1007(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('devuelve totales de IBRU/DEV', async () => {
    const buffer = await construirToken(
      [{ nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 119000, iva: 19000 }],
      { devVentasFilas: [{ nit: '900123456', nombre: 'CLIENTE UNO SAS', total: 11900, iva: 1900 }] }
    );
    const req = { file: { buffer } };
    const res = mockRes();
    await verificarIngresos1007(req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.totalTerceros).toBe(1);
    expect(body.totalIbru).toBe(100000);
    expect(body.totalDev).toBe(10000);
  });
});
