// Factory explícita: pdf-parse@1.1.1 corre un bloque de auto-test en su index.js cuando
// `!module.parent` (busca un PDF de ejemplo en su propio paquete) — bajo Jest eso siempre da
// true y revienta el require. Con la factory, Jest nunca carga el módulo real.
jest.mock('pdf-parse', () => jest.fn());
jest.mock('../../src/config/database');

const pdfParse = require('pdf-parse');
const db = require('../../src/config/database');
const { extraerPartesDePdf, extraerTerceroDePdf, mapearCodigoDane, mapearCodigoPais, normalizarDireccion, limpiarParaDian } = require('../../src/services/terceros');
const { uploadTerceros, consultarTercero } = require('../../src/controllers/tercerosController');

// Texto real extraído (pdf-parse) de docs/PDF-901939874-AAC2.pdf — factura de muestra de
// "ASOCIACION AVICOLA CHICAMOCHA" generada por la DIAN. No se referencia el PDF binario porque
// docs/*.pdf está en .gitignore (trae datos financieros reales de la empresa).
const TEXTO_FACTURA_MUESTRA = `

$$$$
FACTURA ELECTRÓNICA DE VENTA
Representación Gráfica

Datos del Documento
Código Único de Factura - CUFE :
98ce4793dfff887cfbeaa2b2433acf9eaae404188046ea90a1304f2c9d273e89c2d384aeb233e45df12fca883f5a0486
Número de Factura:   AAC-2Forma de pago:   Contado
Fecha de Emisión:   31/07/2026Medio de Pago:   Efectivo
Fecha de Vencimiento:   31/07/2026Orden de pedido:
Tipo de Operación:   10 - EstándarFecha de orden de pedido:
Datos del Emisor / Vendedor
Razón Social:   ASOCIACION AVICOLA CHICAMOCHA
Nombre Comercial:   ASOCIACION AVICOLA CHICAMOCHA
Nit del Emisor:   901939874País:   Colombia
Tipo de Contribuyente:   Persona JurídicaDepartamento:   Boyacá
Régimen Fiscal:R-99-PNMunicipio / Ciudad:   Socha
Responsabilidad tributaria:   01 - IVA
Dirección:   VDA SAGRA ABAJO SEC COTAMO FCA EL
ENCERRADO
Actividad Económica:   9499Teléfono / Móvil:   3208176645
Correo:   MERYVEGAT98@GMAIL.COM
Datos del Adquiriente / Comprador
Nombre o Razón Social:   CONSUMIDOR FINAL
Tipo de Documento:   NITPaís:   Colombia
Número Documento:   222222222Departamento:   Bogotá
Tipo de Contribuyente:   Persona JurídicaMunicipio / Ciudad:   Bogotá, D.c.
Régimen fiscal:   R-99-PNDirección:   Calle 000
Responsabilidad tributaria:   ZZ - No aplicaTeléfono / Móvil:   0000000
Correo:   meryvegat98@gmail.com
Detalles de Productos

IMPUESTOS
Precio unitario
de venta
Nro.CódigoDescripciónU/MCantidadPrecio unitarioDescuento detalleRecargo detalleIVA%INC%
1HV1
Huevo semicriollo Cubeta
por 30 unidades
NIU94,0013.000,000,000,00    1.222.000,00

Notas Finales
Linea de negocio:
Hoja 1 de 2`;

describe('mapearCodigoDane', () => {
  test('mapea un municipio sin ambigüedad a su código DANE y su nombre oficial', () => {
    expect(mapearCodigoDane('Boyacá', 'Socha')).toEqual({
      codigoMunicipio: '15757', codigoDepartamento: '15',
      nombreMunicipio: 'SOCHA', nombreDepartamento: 'Boyacá', ambiguo: false,
    });
  });

  test('ignora tildes/mayúsculas al comparar', () => {
    expect(mapearCodigoDane('BOYACA', 'SOCHA').codigoMunicipio).toBe('15757');
  });

  test('un municipio sin ambigüedad se resuelve aunque el departamento no coincida (el nombre ya es único)', () => {
    expect(mapearCodigoDane('Otro Departamento', 'Socha').codigoMunicipio).toBe('15757');
  });

  test('desambigua un nombre de municipio repetido usando el departamento de la factura', () => {
    expect(mapearCodigoDane('Quindío', 'Armenia').codigoMunicipio).toBe('63001');
    expect(mapearCodigoDane('Antioquia', 'Armenia').codigoMunicipio).toBe('05059');
  });

  test('queda ambiguo si el departamento no viene o no coincide con ningún candidato', () => {
    expect(mapearCodigoDane(null, 'Armenia').ambiguo).toBe(true);
    expect(mapearCodigoDane('Departamento Inexistente', 'Armenia').ambiguo).toBe(true);
  });

  test('municipio no encontrado ni por similitud', () => {
    const r = mapearCodigoDane('Boyacá', 'Ciudad Que No Existe En Ningún Lado');
    expect(r).toEqual({ codigoMunicipio: null, codigoDepartamento: null, nombreMunicipio: null, nombreDepartamento: null, ambiguo: false });
  });

  test('sin municipio no intenta mapear', () => {
    expect(mapearCodigoDane('Boyacá', null).codigoMunicipio).toBeNull();
  });

  test('reconoce "Bogotá" con o sin sufijo D.C., con o sin coma', () => {
    for (const texto of ['Bogotá', 'Bogotá D.C.', 'Bogotá, D.C.', 'BOGOTA DC']) {
      expect(mapearCodigoDane(null, texto)).toEqual({
        codigoMunicipio: '11001', codigoDepartamento: '11',
        nombreMunicipio: 'BOGOTÁ, D.C.', nombreDepartamento: 'Bogotá D.C.', ambiguo: false,
      });
    }
  });

  test('reconoce una localidad de Bogotá (no es un municipio propio) y la resuelve a Bogotá', () => {
    expect(mapearCodigoDane(null, 'Kennedy').codigoMunicipio).toBe('11001');
    expect(mapearCodigoDane('Bogotá', 'Suba').codigoMunicipio).toBe('11001');
  });

  test('reconoce una localidad de Bogotá aunque venga con el prefijo "Localidad" (caso real)', () => {
    expect(mapearCodigoDane('Bogotá D.C.', 'Localidad Kennedy').codigoMunicipio).toBe('11001');
  });

  test('"Localidad X" siempre es Bogotá aunque X coincida por casualidad con un municipio real de otro departamento (caso real)', () => {
    // "Santa Bárbara" es municipio real en Antioquia/Nariño/Santander, pero acá es un barrio de
    // Bogotá mal llamado "localidad" — sin este caso especial, quedaría "ambiguo" en vez de
    // resolver a Bogotá.
    expect(mapearCodigoDane('Bogotá D.C.', 'Localidad Santa Bárbara')).toEqual({
      codigoMunicipio: '11001', codigoDepartamento: '11',
      nombreMunicipio: 'BOGOTÁ, D.C.', nombreDepartamento: 'Bogotá D.C.', ambiguo: false,
    });
  });

  test('reconoce el nombre completo/ceremonial de un municipio (caso real: Cúcuta)', () => {
    expect(mapearCodigoDane('Norte de Santander', 'San José de Cúcuta').codigoMunicipio).toBe('54001');
  });

  test('quita el nombre del departamento pegado al final del municipio (caso real)', () => {
    // La factura traía "Madrid Cundinamarca" en el campo Municipio, y "Bogotá" (mal
    // diligenciado) en el campo Departamento — se resuelve igual a Madrid, Cundinamarca.
    expect(mapearCodigoDane('Bogotá', 'Madrid Cundinamarca').codigoMunicipio).toBe('25430');
  });

  test('tolera un error de tipeo por similitud, restringido al departamento cuando se conoce', () => {
    // "Malambo" (Atlántico, 08433) con una letra de más
    expect(mapearCodigoDane('Atlántico', 'Malamboo').codigoMunicipio).toBe('08433');
  });

  test('no adivina si hay dos candidatos igual de parecidos (empate) o el texto es demasiado distinto', () => {
    // Nombre muy corto y genérico — con muchos candidatos posibles a 1 edición de distancia no
    // debería resolver con confianza a nivel nacional (sin departamento para acotar).
    const r = mapearCodigoDane(null, 'Xyzabc123');
    expect(r.codigoMunicipio).toBeNull();
  });
});

describe('mapearCodigoPais', () => {
  test('resuelve un país conocido ignorando tildes/mayúsculas', () => {
    expect(mapearCodigoPais('Colombia')).toEqual({ codigoPais: '169', nombrePais: 'COLOMBIA' });
    expect(mapearCodigoPais('estados unidos')).toEqual({ codigoPais: '249', nombrePais: 'ESTADOS UNIDOS' });
  });

  test('sin país no intenta mapear', () => {
    expect(mapearCodigoPais(null)).toEqual({ codigoPais: null, nombrePais: null });
  });

  test('país no reconocido queda sin mapear (no adivina)', () => {
    expect(mapearCodigoPais('Narnia')).toEqual({ codigoPais: null, nombrePais: null });
  });
});

describe('normalizarDireccion', () => {
  test('reemplaza palabras completas de la tabla oficial por su código', () => {
    expect(normalizarDireccion('Calle 15 # 8-32 Barrio El Prado')).toBe('CL 15 # 8-32 BRR EL PRADO');
  });

  test('reconoce frases de varias palabras antes que la palabra suelta (Avenida Calle -> AC, no AV + CL)', () => {
    expect(normalizarDireccion('Avenida Calle 26 # 10-20')).toBe('AC 26 # 10-20');
  });

  test('reconoce alias comunes no oficiales (Vda, Cra, Trans)', () => {
    expect(normalizarDireccion('Vda Sagra Abajo')).toBe('VRD SAGRA ABAJO');
    expect(normalizarDireccion('Cra 5A No 12-45')).toBe('CR 5A NO 12-45');
    expect(normalizarDireccion('Trans 20 # 5-10')).toBe('TV 20 # 5-10');
  });

  test('deja intactas (solo en mayúscula) las palabras que no reconoce', () => {
    expect(normalizarDireccion('Sector raro sin nomenclatura 123')).toBe('SEC RARO SIN NOMENCLATURA 123');
  });

  test('es idempotente: una dirección ya en nomenclatura DIAN no cambia', () => {
    expect(normalizarDireccion('CL 15 8 32')).toBe('CL 15 8 32');
  });

  test('sin dirección no hace nada', () => {
    expect(normalizarDireccion(null)).toBeNull();
    expect(normalizarDireccion('')).toBe('');
  });
});

describe('limpiarParaDian', () => {
  test('quita tildes y Ñ', () => {
    expect(limpiarParaDian('Bogotá Muñoz Peña')).toBe('BOGOTA MUNOZ PENA');
  });

  test('reemplaza símbolos no permitidos por espacio, sin pegar números', () => {
    expect(limpiarParaDian('CL 15 # 8-32')).toBe('CL 15 8 32');
    expect(limpiarParaDian('50% Empresa & Cía S.A.S.')).toBe('50 EMPRESA CIA S.A.S.');
  });

  test('deja puntos y comas tal cual', () => {
    expect(limpiarParaDian('Cra. 5, Bogotá D.C.')).toBe('CRA. 5, BOGOTA D.C.');
  });

  test('sin texto no hace nada', () => {
    expect(limpiarParaDian(null)).toBeNull();
  });

  test('permite caracteres extra cuando se pasan explícitamente (ej. "&" en razón social)', () => {
    expect(limpiarParaDian('García & Asociados S.A.S.', '&')).toBe('GARCIA & ASOCIADOS S.A.S.');
    expect(limpiarParaDian('García & Asociados S.A.S.')).toBe('GARCIA ASOCIADOS S.A.S.');
  });
});

describe('extraerPartesDePdf', () => {
  beforeEach(() => pdfParse.mockReset());

  test('extrae Emisor y Adquiriente de una factura DIAN real', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });

    const { emisor, adquiriente } = await extraerPartesDePdf(Buffer.from('fake-pdf'));

    expect(emisor).toEqual({
      nit: '901939874',
      razonSocial: 'ASOCIACION AVICOLA CHICAMOCHA',
      direccion: 'VRD SAGRA ABAJO SEC COTAMO FCA EL ENCERRADO', // "VDA" -> alias de Vereda
      pais: 'COLOMBIA',
      codigoPaisDian: '169',
      municipio: 'SOCHA', // nombre oficial DIAN, no el texto de la factura
      codigoMunicipioDane: '15757',
      departamento: 'BOYACA', // sin tilde — regla DIAN de caracteres
      codigoDepartamentoDane: '15',
      pendienteDesambiguar: false,
      regimenFiscal: 'R-99-PN',
      responsabilidadTributaria: '01 - IVA',
      telefono: '3208176645',
      correo: 'meryvegat98@gmail.com', // pasado a minúsculas (venía en mayúsculas en la factura)
    });
    expect(adquiriente).toEqual({
      nit: '222222222',
      razonSocial: 'CONSUMIDOR FINAL',
      direccion: 'CL 000',
      pais: 'COLOMBIA',
      codigoPaisDian: '169',
      municipio: 'BOGOTA, D.C.', // "Bogotá, D.c." de la factura -> nombre oficial, sin tilde
      codigoMunicipioDane: '11001',
      departamento: 'BOGOTA D.C.',
      codigoDepartamentoDane: '11',
      pendienteDesambiguar: false,
      regimenFiscal: 'R-99-PN',
      responsabilidadTributaria: 'ZZ - No aplica',
      telefono: '0000000',
      correo: 'meryvegat98@gmail.com',
    });
  });

  test('lanza error si dice ser factura pero no tiene las secciones esperadas', async () => {
    pdfParse.mockResolvedValue({ text: 'FACTURA ELECTRÓNICA DE VENTA\nun PDF sin las secciones esperadas' });
    await expect(extraerPartesDePdf(Buffer.from('fake-pdf')))
      .rejects.toThrow(/formato esperado/);
  });

  test('descarta notas crédito y documentos soporte sin intentar extraer nada (pedido explícito del usuario)', async () => {
    pdfParse.mockResolvedValue({ text: 'NOTA CRÉDITO ELECTRÓNICA\nRepresentación Gráfica\nDatos del Emisor / Vendedor' });
    await expect(extraerPartesDePdf(Buffer.from('fake-pdf')))
      .rejects.toThrow(/no se procesa/);
  });
});

describe('extraerTerceroDePdf', () => {
  beforeEach(() => pdfParse.mockReset());

  test('en compras devuelve el Emisor (vendedor)', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    const t = await extraerTerceroDePdf(Buffer.from('fake-pdf'), 'compras');
    expect(t.nit).toBe('901939874');
    expect(t.razonSocial).toBe('ASOCIACION AVICOLA CHICAMOCHA');
  });

  test('en ventas devuelve el Adquiriente (comprador)', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    const t = await extraerTerceroDePdf(Buffer.from('fake-pdf'), 'ventas');
    expect(t.nit).toBe('222222222');
    expect(t.razonSocial).toBe('CONSUMIDOR FINAL');
  });
});

function mockRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
}

// El controller hace SELECT (para saber si el NIT ya existía) y después INSERT ... ON CONFLICT
// RETURNING * — este mock distingue ambas por el texto del SQL. `existentesPorNit` simula filas
// que ya estaban en la tabla antes del upload (para probar detección de actualización).
function mockDbSelectThenUpsert(existentesPorNit = {}) {
  db.query.mockImplementation((sql, params) => {
    if (sql.trim().startsWith('SELECT')) {
      const fila = existentesPorNit[params[0]];
      return Promise.resolve({ rows: fila ? [fila] : [] });
    }
    const [nit, razon_social, direccion, municipio, codigo_municipio_dane, departamento, codigo_departamento_dane] = params;
    return Promise.resolve({ rows: [{ nit, razon_social, direccion, municipio, codigo_municipio_dane, departamento, codigo_departamento_dane }] });
  });
}

describe('uploadTerceros', () => {
  beforeEach(() => {
    pdfParse.mockReset();
    db.query.mockReset();
  });

  test('rechaza un tipoOperacion inválido o ausente', async () => {
    const req = { body: {}, files: [{ originalname: 'x.pdf', buffer: Buffer.from('x') }], user: { userId: 'usuario-1' } };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rechaza si no se envió ningún archivo', async () => {
    const req = { body: { tipoOperacion: 'compras' }, files: [], user: { userId: 'usuario-1' } };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('en compras guarda solo el Emisor (vendedor), no el Adquiriente', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert();

    const req = {
      body: { tipoOperacion: 'compras' },
      files: [{ originalname: 'factura.pdf', buffer: Buffer.from('fake-pdf') }],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    expect(db.query).toHaveBeenCalledTimes(2); // SELECT + INSERT
    expect(db.query.mock.calls[0][1][0]).toBe('901939874'); // NIT del Emisor, no del Adquiriente
    expect(res.status).toHaveBeenCalledWith(200);
    const body = res.json.mock.calls[0][0];
    expect(body.procesados).toBe(1);
    expect(body.errores).toEqual([]);
    expect(body.terceros[0].esNuevo).toBe(true);
    expect(body.actualizados).toBe(0);
  });

  test('en ventas guarda solo el Adquiriente (comprador), no el Emisor', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert();

    const req = {
      body: { tipoOperacion: 'ventas' },
      files: [{ originalname: 'factura.pdf', buffer: Buffer.from('fake-pdf') }],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    expect(db.query).toHaveBeenCalledTimes(2); // SELECT + INSERT
    expect(db.query.mock.calls[0][1][0]).toBe('222222222'); // NIT del Adquiriente, no del Emisor
  });

  test('reporta el error por archivo sin tumbar el resto del lote', async () => {
    pdfParse
      .mockResolvedValueOnce({ text: 'FACTURA ELECTRÓNICA DE VENTA\nsin las secciones esperadas' })
      .mockResolvedValueOnce({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert();

    const req = {
      body: { tipoOperacion: 'compras' },
      files: [
        { originalname: 'malo.pdf', buffer: Buffer.from('fake-pdf-1') },
        { originalname: 'bueno.pdf', buffer: Buffer.from('fake-pdf-2') },
      ],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.errores).toEqual([{ archivo: 'malo.pdf', error: expect.stringMatching(/formato esperado/) }]);
    expect(body.procesados).toBe(1);
    expect(body.omitidosNoFactura).toBe(0);
  });

  test('notas crédito/documentos soporte no aparecen como error — se cuentan aparte', async () => {
    pdfParse
      .mockResolvedValueOnce({ text: 'NOTA CRÉDITO ELECTRÓNICA\nno se procesa' })
      .mockResolvedValueOnce({ text: 'DOCUMENTO SOPORTE ELECTRÓNICO\nno se procesa' })
      .mockResolvedValueOnce({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert();

    const req = {
      body: { tipoOperacion: 'compras' },
      files: [
        { originalname: 'nota-credito.pdf', buffer: Buffer.from('fake-pdf-1') },
        { originalname: 'documento-soporte.pdf', buffer: Buffer.from('fake-pdf-2') },
        { originalname: 'factura.pdf', buffer: Buffer.from('fake-pdf-3') },
      ],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.errores).toEqual([]);
    expect(body.omitidosNoFactura).toBe(2);
    expect(body.procesados).toBe(1);
  });

  test('si el NIT ya existía, marca esNuevo=false y reporta qué campos cambiaron', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert({
      '901939874': {
        nit: '901939874',
        razon_social: 'ASOCIACION AVICOLA CHICAMOCHA',
        direccion: 'DIRECCION VIEJA DESACTUALIZADA', // distinta a la que trae esta factura
        municipio: 'SOCHA',
        codigo_municipio_dane: '15757',
        departamento: 'BOYACA',
        codigo_departamento_dane: '15',
      },
    });

    const req = {
      body: { tipoOperacion: 'compras' },
      files: [{ originalname: 'factura.pdf', buffer: Buffer.from('fake-pdf') }],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.terceros[0].esNuevo).toBe(false);
    expect(body.terceros[0].cambios).toEqual([
      { campo: 'Dirección', antes: 'DIRECCION VIEJA DESACTUALIZADA', despues: 'VRD SAGRA ABAJO SEC COTAMO FCA EL ENCERRADO' },
    ]);
    expect(body.actualizados).toBe(1);
  });

  test('si el NIT ya existía pero no cambió nada, no cuenta como actualizado', async () => {
    pdfParse.mockResolvedValue({ text: TEXTO_FACTURA_MUESTRA });
    mockDbSelectThenUpsert({
      '901939874': {
        nit: '901939874',
        razon_social: 'ASOCIACION AVICOLA CHICAMOCHA',
        direccion: 'VRD SAGRA ABAJO SEC COTAMO FCA EL ENCERRADO',
        municipio: 'SOCHA',
        codigo_municipio_dane: '15757',
        departamento: 'BOYACA',
        codigo_departamento_dane: '15',
      },
    });

    const req = {
      body: { tipoOperacion: 'compras' },
      files: [{ originalname: 'factura.pdf', buffer: Buffer.from('fake-pdf') }],
      user: { userId: 'usuario-1' },
    };
    const res = mockRes();
    await uploadTerceros(req, res, jest.fn());

    const body = res.json.mock.calls[0][0];
    expect(body.terceros[0].esNuevo).toBe(false);
    expect(body.terceros[0].cambios).toEqual([]);
    expect(body.actualizados).toBe(0);
  });
});

describe('consultarTercero', () => {
  beforeEach(() => db.query.mockReset());

  test('devuelve el tercero, incluyendo régimen fiscal/responsabilidad/teléfono/correo', async () => {
    const fila = {
      nit: '901939874',
      razon_social: 'ASOCIACION AVICOLA CHICAMOCHA',
      direccion: 'VRD SAGRA ABAJO SEC COTAMO FCA EL ENCERRADO',
      municipio: 'SOCHA',
      codigo_municipio_dane: '15757',
      departamento: 'BOYACA',
      codigo_departamento_dane: '15',
      regimen_fiscal: 'R-99-PN',
      responsabilidad_tributaria: '01 - IVA',
      telefono: '3208176645',
      correo: 'meryvegat98@gmail.com',
    };
    db.query.mockResolvedValue({ rows: [fila] });

    const req = { params: { nit: '901.939.874-0' } }; // con puntos/guion, como lo pegaría el usuario
    const res = mockRes();
    await consultarTercero(req, res, jest.fn());

    expect(db.query.mock.calls[0][1][0]).toBe('9019398740'); // limpiarIdentificacion solo quita no-dígitos
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ ...fila, regimen_fiscal_descripcion: 'No responsable' });
  });

  test('describe el régimen fiscal con la tabla de códigos DIAN, o null si no se reconoce', async () => {
    db.query.mockResolvedValue({ rows: [{ nit: '111', regimen_fiscal: 'R-99-PN' }] });
    const res1 = mockRes();
    await consultarTercero({ params: { nit: '111' } }, res1, jest.fn());
    expect(res1.json.mock.calls[0][0].regimen_fiscal_descripcion).toBe('No responsable');

    db.query.mockResolvedValue({ rows: [{ nit: '222', regimen_fiscal: 'CODIGO-DESCONOCIDO' }] });
    const res2 = mockRes();
    await consultarTercero({ params: { nit: '222' } }, res2, jest.fn());
    expect(res2.json.mock.calls[0][0].regimen_fiscal_descripcion).toBeNull();
  });

  test('responde 404 si no hay ningún tercero con ese documento', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const req = { params: { nit: '999999999' } };
    const res = mockRes();
    await consultarTercero(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  test('responde 400 si el documento queda vacío tras limpiar', async () => {
    const req = { params: { nit: '---' } };
    const res = mockRes();
    await consultarTercero(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});
