jest.mock('../../src/config/database');

const ExcelJS = require('exceljs');
const db = require('../../src/config/database');
const { calcularDV } = require('../../src/services/exogenas/utils/dian');
const { leerYAgrupar, enriquecerConTerceros, llenarPlantilla } = require('../../src/services/exogenas/formato1001');

const COLUMNAS_TOKEN = ['Tipo de documento', 'NIT Emisor', 'Nombre Emisor', 'Grupo'];

async function construirToken(filas, { nombreHoja = 'COMPRAS' } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  ws.addRow(COLUMNAS_TOKEN);
  filas.forEach((f) => {
    ws.addRow([f.tipo ?? 'Factura electrónica', f.nit, f.nombre, f.grupo ?? 'Recibido']);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('formato1001 — leerYAgrupar', () => {
  test('agrupa por NIT, ignora filas sin Grupo=Recibido y deduplica', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS' },
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS' }, // duplicado, no debe repetirse
      { nit: '800654321', nombre: 'PROVEEDOR DOS SAS' },
      { nit: '111111111', nombre: 'NO CUENTA', grupo: 'Emitido' }, // no es compra
    ]);

    const registros = await leerYAgrupar(buffer);

    expect(registros).toHaveLength(2);
    expect(registros.map((r) => r.identificacion).sort()).toEqual(['800654321', '900123456']);
  });

  test('incluye notas crédito (a diferencia de 1005) — acá solo interesa quién podría aparecer', async () => {
    const buffer = await construirToken([
      { nit: '900123456', nombre: 'PROVEEDOR UNO SAS', tipo: 'Nota de crédito electrónica' },
    ]);
    const registros = await leerYAgrupar(buffer);
    expect(registros).toHaveLength(1);
  });

  test('lanza error si falta la hoja COMPRAS', async () => {
    const buffer = await construirToken([{ nit: '1', nombre: 'X' }], { nombreHoja: 'OTRA' });
    await expect(leerYAgrupar(buffer)).rejects.toThrow(/COMPRAS/);
  });

  test('ignora filas ocultas por un filtro (AutoFilter) — el contador copia el TOKEN completo y filtra lo que necesita', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('COMPRAS');
    ws.addRow(COLUMNAS_TOKEN);
    ws.addRow(['Factura electrónica', '900123456', 'PROVEEDOR UNO SAS', 'Recibido']);
    const filaOculta = ws.addRow(['Factura electrónica', '800654321', 'PROVEEDOR DOS SAS', 'Recibido']);
    filaOculta.hidden = true;

    const registros = await leerYAgrupar(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(registros).toHaveLength(1);
    expect(registros[0].identificacion).toBe('900123456');
  });
});

describe('formato1001 — enriquecerConTerceros', () => {
  beforeEach(() => db.query.mockReset());

  test('marca completo un tercero con direccion + ambos codigos DANE', async () => {
    db.query.mockResolvedValue({
      rows: [{
        nit: '900123456', direccion: 'CL 1 2 3', municipio: 'BOGOTA', codigo_municipio_dane: '11001',
        departamento: 'BOGOTA D.C.', codigo_departamento_dane: '11', pais: 'COLOMBIA', codigo_pais_dian: '169',
      }],
    });

    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '900123456', razonSocial: 'X' }]);

    expect(r.tieneTercero).toBe(true);
    expect(r.tieneDatosCompletos).toBe(true);
    expect(r.direccion).toBe('CL 1 2 3');
    expect(r.codigoPaisDian).toBe('169');
  });

  test('marca incompleto un tercero guardado pero sin codigo de municipio', async () => {
    db.query.mockResolvedValue({
      rows: [{ nit: '900123456', direccion: 'CL 1 2 3', codigo_municipio_dane: null, codigo_departamento_dane: null }],
    });
    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '900123456', razonSocial: 'X' }]);
    expect(r.tieneTercero).toBe(true);
    expect(r.tieneDatosCompletos).toBe(false);
  });

  test('marca sin tercero un NIT que no existe en la tabla', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const [r] = await enriquecerConTerceros([{ tipoDocumento: 31, identificacion: '999999999', razonSocial: 'X' }]);
    expect(r.tieneTercero).toBe(false);
    expect(r.tieneDatosCompletos).toBe(false);
  });

  test('sin registros no consulta la base', async () => {
    const resultado = await enriquecerConTerceros([]);
    expect(resultado).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

const HEADERS_1001 = [
  'Concepto (CPT)', 'Tipo de Documento (TDOC)', 'Número de Identificacion (NID)',
  'Primer Apellido del informado (APL1)', 'Segundo Apellido del informado (APL2)',
  'Primer Nombre del informado (NOM1)', 'Otros Nombres del informado (NOM2)',
  'Razón Social del Informado (RAZ)', 'Dirección (DIR)', 'Código del Departamento (DPTO)',
  'Código del Municipio (MUN)', 'País de Residencia o domicilio (PAIS)',
  'Pago o Abono en cuenta (PAGO)', 'Pago o abono en cuenta NO deducible (PNDED)',
  'IVA mayor valor del costo o gasto deducible (IDED)',
  'IVA mayor valor del costo o gasto no deducible (INDED)',
  'Retención en la fuente practicada Renta (RETP)', 'Retención en la fuente practicada Renta (RETA)',
  'Retención en la fuente practicada IVA a responsables del IVA (COMUN)',
  'Retención en la fuente practicada IVA a no residentes o no domiciliados (NDOM)',
];

async function construirPlantilla({ nombreHoja = '1001', filaHeader = 7 } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(nombreHoja);
  for (let i = 1; i < filaHeader; i++) ws.addRow([]);
  ws.addRow(HEADERS_1001);
  return wb;
}

describe('formato1001.llenarPlantilla', () => {
  test('jurídica: TDOC/NID, todo el nombre en RAZ, DIR/DPTO/MUN/PAIS — CPT y montos quedan en blanco', async () => {
    const wb = await construirPlantilla();
    const registros = [{
      tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: calcularDV('900123456'),
      razonSocial: 'ACME SAS', direccion: 'CL 1 2 3', codigoDepartamentoDane: '11',
      codigoMunicipioDane: '11001', codigoPaisDian: '169',
    }];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1001').getRow(8);
    expect(fila.getCell(1).value).toBeNull();     // CPT en blanco (concepto sin definir)
    expect(fila.getCell(2).value).toBe(31);        // TDOC
    expect(fila.getCell(3).value).toBe(900123456); // NID
    expect(fila.getCell(8).value).toBe('ACME SAS'); // RAZ
    expect(fila.getCell(9).value).toBe('CL 1 2 3'); // DIR
    expect(fila.getCell(10).value).toBe('11');      // DPTO
    expect(fila.getCell(11).value).toBe('001');     // MUN: últimos 3 dígitos del código DANE completo
    expect(fila.getCell(12).value).toBe(169);       // PAIS
    expect(fila.getCell(13).value).toBeNull();      // PAGO en blanco (columnas de dinero sin definir)
  });

  test('sin datos de terceros (NIT no está en `terceros`), DIR/DPTO/MUN/PAIS quedan en blanco', async () => {
    const wb = await construirPlantilla();
    const registros = [{
      tipoDocumento: 31, identificacion: '900123456', digitoVerificacion: 8, razonSocial: 'ACME SAS',
      direccion: null, codigoDepartamentoDane: null, codigoMunicipioDane: null, codigoPaisDian: null,
    }];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1001').getRow(8);
    expect(fila.getCell(9).value).toBeNull();  // DIR
    expect(fila.getCell(10).value).toBeNull(); // DPTO
    expect(fila.getCell(11).value).toBeNull(); // MUN
    expect(fila.getCell(12).value).toBeNull(); // PAIS
  });

  test('persona natural: separa el nombre en APL1/APL2/NOM1/NOM2 y deja RAZ vacío', async () => {
    const wb = await construirPlantilla();
    const registros = [{
      tipoDocumento: 13, identificacion: '80123456', digitoVerificacion: 3, razonSocial: 'Juan Carlos Perez Gomez',
    }];
    const buffer = await llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), registros);

    const wb2 = new ExcelJS.Workbook();
    await wb2.xlsx.load(buffer);
    const fila = wb2.getWorksheet('1001').getRow(8);
    // Orden en HEADERS_1001: 1 CPT, 2 TDOC, 3 NID, 4 APL1, 5 APL2, 6 NOM1, 7 NOM2, 8 RAZ, ...
    expect(fila.getCell(4).value).toBe('PEREZ');  // APL1
    expect(fila.getCell(5).value).toBe('GOMEZ');  // APL2
    expect(fila.getCell(6).value).toBe('JUAN');   // NOM1
    expect(fila.getCell(7).value).toBe('CARLOS'); // NOM2
    expect(fila.getCell(8).value).toBeNull();     // RAZ vacío para persona natural
  });

  test('lanza error si la plantilla no tiene hoja 1001', async () => {
    const wb = await construirPlantilla({ nombreHoja: 'OTRA' });
    await expect(llenarPlantilla(Buffer.from(await wb.xlsx.writeBuffer()), [])).rejects.toThrow(/"1001"/);
  });
});
