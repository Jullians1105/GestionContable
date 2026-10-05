// Reglas de negocio de Deudas vencidas DIAN (services/dianDeudas/logica.js) y cifrado de claves.
const {
  clasificarConcepto, parsearValor, describirPeriodo, cruzarConRecibos, estadoRevision,
  formatearPesos, armarCorreo, mesActualBogota,
} = require('../../src/services/dianDeudas/logica');
const { cifrar, descifrar, llaveConfigurada } = require('../../src/utils/secretos');

describe('clasificarConcepto', () => {
  it.each([
    ['Impuesto sobre las Ventas-IVA', 'iva'],
    ['Retención en la Fuente', 'rete_fte'],
    ['RETENCION ATITULO DE RENTA', 'rete_fte'],
    ['RETENCION A TITULO DE VENTAS', 'rete_fte'],
    ['RETENCION IMPUESTO NACIONAL AL CONSUMO DE BIENES MUEBLES', 'rete_fte'],
    ['VENTAS CUATRIMESTRAL', 'iva'],
    ['VENTAS', 'iva'],
    ['IMPUESTO AL CONSUMO', 'inc'],
    ['Impuesto Nacional al Consumo', 'inc'],
    ['RENTA', 'renta'],
    ['Impuesto sobre la Renta', 'renta'],
    ['SANCIONES', 'otro'],
    ['SANCION EXTEMPORANEIDAD DECLARACION ACTIVOS EN EL EXTERIOR', 'otro'],
    ['GRAVAMEN A LOS MOVIMIENTOS FINANCIEROS', 'otro'],
    [undefined, 'otro'],
  ])('%s -> %s', (texto, esperado) => {
    expect(clasificarConcepto(texto)).toBe(esperado);
  });
});

describe('parsearValor', () => {
  it('lee el formato colombiano', () => {
    expect(parsearValor('17.609.000,00')).toBe(17609000);
    expect(parsearValor('277.000')).toBe(277000);
    expect(parsearValor('$ 1.000')).toBe(1000);
    expect(parsearValor('0')).toBe(0);
  });
  it('devuelve null si no hay número', () => {
    expect(parsearValor('')).toBeNull();
    expect(parsearValor(null)).toBeNull();
    expect(parsearValor('abc')).toBeNull();
  });
});

describe('describirPeriodo', () => {
  it('retención es mensual', () => {
    expect(describirPeriodo({ concepto: 'rete_fte', anio: 2026, periodo: 7 })).toBe('Retención en la fuente del mes de julio de 2026');
  });
  it('IVA bimestral: periodo 2 = marzo-abril, 6 = noviembre-diciembre', () => {
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 2, ivaPeriodicidad: 'bimestral' })).toBe('IVA del bimestre marzo-abril de 2026');
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 6, ivaPeriodicidad: 'bimestral' })).toBe('IVA del bimestre noviembre-diciembre de 2026');
  });
  it('IVA cuatrimestral: 1 = enero-abril, 2 = mayo-agosto, 3 = septiembre-diciembre', () => {
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 1, ivaPeriodicidad: 'cuatrimestral' })).toBe('IVA del cuatrimestre enero-abril de 2026');
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 2, ivaPeriodicidad: 'cuatrimestral' })).toBe('IVA del cuatrimestre mayo-agosto de 2026');
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 3, ivaPeriodicidad: 'cuatrimestral' })).toBe('IVA del cuatrimestre septiembre-diciembre de 2026');
  });
  it('IVA sin periodicidad conocida deja el número (no inventa meses)', () => {
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 2 })).toBe('IVA del periodo 2 de 2026');
  });
  it('periodo fuera de rango no revienta', () => {
    expect(describirPeriodo({ concepto: 'iva', anio: 2026, periodo: 9, ivaPeriodicidad: 'bimestral' })).toBe('IVA del periodo 9 de 2026');
    expect(describirPeriodo({ concepto: 'rete_fte', anio: 2026, periodo: 13 })).toContain('periodo 13');
  });
  it('INC bimestral, renta por año, otros genérico', () => {
    expect(describirPeriodo({ concepto: 'inc', anio: 2023, periodo: 3 })).toBe('Impuesto al consumo del bimestre mayo-junio de 2023');
    expect(describirPeriodo({ concepto: 'renta', anio: 2025, periodo: 1 })).toBe('Impuesto de renta del año gravable 2025');
    expect(describirPeriodo({ concepto: 'otro', anio: 2025, periodo: 4 })).toBe('Obligación del año 2025, periodo 4');
  });
});

describe('liquidación menor que la tabla (anomalía, p. ej. régimen SIMPLE)', () => {
  const simple = { concepto: 'otro', tipoObligacion: 'Impuesto Unificado Bajo el Régimen Simple de Tributación', anio: 2025, periodo: 1, valorBase: 4651000, valorTotal: 87000 };

  it('pasa a "revisar" con una nota clara y no se avisa al cliente', () => {
    const [r] = cruzarConRecibos([simple], []);
    expect(r.estado).toBe('revisar');
    expect(r.nota).toContain('$87.000');
    expect(r.nota).toContain('$4.651.000');
    expect(armarCorreo({ empresa: 'X', detalle: [r] })).toBeNull();
  });
  it('un total IGUAL o mayor (lo normal, con intereses) sigue siendo vigente', () => {
    expect(cruzarConRecibos([{ ...simple, valorTotal: 4651000 }], [])[0].estado).toBe('vigente');
    expect(cruzarConRecibos([{ ...simple, valorTotal: 4800000 }], [])[0].estado).toBe('vigente');
  });
  it('sin valor base conocido no se puede comparar: sigue vigente', () => {
    expect(cruzarConRecibos([{ ...simple, valorBase: null }], [])[0].estado).toBe('vigente');
  });
});

describe('concepto sin texto propio (Impuesto Unificado, sanciones...)', () => {
  it('el correo usa el nombre que da la DIAN', () => {
    expect(describirPeriodo({ concepto: 'otro', tipoObligacion: 'Impuesto Unificado Bajo el Régimen Simple de Tributación', anio: 2025, periodo: 1 }))
      .toBe('Impuesto Unificado Bajo el Régimen Simple de Tributación del año 2025, periodo 1');
    expect(describirPeriodo({ concepto: 'otro', anio: 2025, periodo: 1 })).toBe('Obligación del año 2025, periodo 1');
  });
});

describe('cruzarConRecibos', () => {
  const deuda = (o = {}) => ({ concepto: 'rete_fte', tipoObligacion: 'Retención en la Fuente', anio: 2026, periodo: 7, valorBase: 277000, valorTotal: 285000, ...o });
  const recibo = (o = {}) => ({ numero: '4910514083361', concepto: 'RETENCION ATITULO DE RENTA', anio: 2026, periodo: 7, total: 285000, ...o });

  it('sin recibos del mismo periodo la deuda sigue vigente', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo({ anio: 2021, periodo: 8, total: 1000 })]);
    expect(r.estado).toBe('vigente');
  });
  it('mismo año, periodo, concepto y valor liquidado -> pagada', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo()]);
    expect(r.estado).toBe('pagada');
    expect(r.nota).toContain('4910514083361');
  });
  it('también cuenta si el recibo coincide con el valor sin intereses', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo({ total: 277000 })]);
    expect(r.estado).toBe('pagada');
  });
  it('mismo periodo pero valor distinto -> revisar (decide una persona)', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo({ total: 100000 })]);
    expect(r.estado).toBe('revisar');
    expect(r.nota).toContain('$100.000');
    expect(r.nota).toContain('$285.000');
  });
  it('si el recibo cubre al menos el valor sin intereses, la nota lo señala (sigue en revisar)', () => {
    const [r] = cruzarConRecibos([deuda({ valorBase: 332000, valorTotal: 342000 })], [recibo({ total: 339000 })]);
    expect(r.estado).toBe('revisar');
    expect(r.nota).toMatch(/probablemente ya está pagada/);
    const [menor] = cruzarConRecibos([deuda({ valorBase: 332000, valorTotal: 342000 })], [recibo({ total: 100000 })]);
    expect(menor.nota).not.toMatch(/probablemente/);
  });
  it('no mezcla familias: un recibo de IVA no paga una retención del mismo periodo', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo({ concepto: 'VENTAS', total: 285000 })]);
    expect(r.estado).toBe('vigente');
  });
  it('si hay varios recibos y uno coincide en valor, gana el que coincide', () => {
    const [r] = cruzarConRecibos([deuda()], [recibo({ total: 5000, numero: 'A' }), recibo({ numero: 'B' })]);
    expect(r.estado).toBe('pagada');
    expect(r.nota).toContain('B');
  });
  it('evalúa cada deuda por separado', () => {
    const res = cruzarConRecibos([deuda({ periodo: 7 }), deuda({ periodo: 8, valorBase: 780000, valorTotal: 789000 })], [recibo()]);
    expect(res.map((x) => x.estado)).toEqual(['pagada', 'vigente']);
  });
  it('sin deudas devuelve vacío', () => {
    expect(cruzarConRecibos([], [recibo()])).toEqual([]);
  });
});

describe('estadoRevision', () => {
  it('con_deuda si queda algo vigente o por revisar', () => {
    expect(estadoRevision([{ estado: 'pagada' }, { estado: 'vigente' }])).toBe('con_deuda');
    expect(estadoRevision([{ estado: 'revisar' }])).toBe('con_deuda');
  });
  it('al_dia si todo resultó pagado o no hay nada', () => {
    expect(estadoRevision([{ estado: 'pagada' }])).toBe('al_dia');
    expect(estadoRevision([])).toBe('al_dia');
  });
});

describe('formatearPesos', () => {
  it('separa miles con punto', () => {
    expect(formatearPesos(273000)).toBe('$273.000');
    expect(formatearPesos(17609000)).toBe('$17.609.000');
    expect(formatearPesos(999)).toBe('$999');
    expect(formatearPesos(0)).toBe('$0');
    expect(formatearPesos(null)).toBe('$0');
  });
});

describe('armarCorreo', () => {
  const retencion = (periodo, valorTotal, estado = 'vigente') => ({ concepto: 'rete_fte', anio: 2026, periodo, valorTotal, estado });

  it('arma el correo con la redacción de la oficina (retención julio y agosto)', () => {
    const c = armarCorreo({ empresa: 'EMPRESA EJEMPLO S.A.S', detalle: [retencion(7, 273000), retencion(8, 157000)] });
    expect(c.asunto).toBe('DEUDAS VENCIDAS DIAN');
    expect(c.texto).toContain('la empresa EMPRESA EJEMPLO S.A.S debe pagar los siguientes impuestos:');
    expect(c.texto).toContain('- Retención en la fuente del mes de julio de 2026 por un valor de $273.000');
    expect(c.texto).toContain('- Retención en la fuente del mes de agosto de 2026 por un valor de $157.000');
    expect(c.texto).toContain('artículo 580-1');
    expect(c.texto.startsWith('Buen día, espero que se encuentren bien')).toBe(true);
    expect(c.texto.endsWith('Quedo atenta para generar el respectivo recibo de pago.')).toBe(true);
  });
  it('el párrafo del 580-1 solo va si hay retención', () => {
    const c = armarCorreo({
      empresa: 'ACME', ivaPeriodicidad: 'bimestral',
      detalle: [{ concepto: 'iva', anio: 2026, periodo: 2, valorTotal: 17609000, estado: 'vigente' }],
    });
    expect(c.texto).toContain('IVA del bimestre marzo-abril de 2026 por un valor de $17.609.000');
    expect(c.texto).not.toContain('580-1');
  });
  it('no incluye lo pagado ni lo que está por revisar', () => {
    const c = armarCorreo({ empresa: 'ACME', detalle: [retencion(7, 285000, 'pagada'), retencion(8, 789000, 'revisar'), retencion(9, 100000)] });
    expect(c.texto).not.toContain('julio');
    expect(c.texto).not.toContain('agosto');
    expect(c.texto).toContain('septiembre');
  });
  describe('deuda NO vencida', () => {
    const noVencida = (periodo, valorTotal) => ({ concepto: 'rete_fte', anio: 2026, periodo, valorTotal, estado: 'vigente', vencida: false });

    it('con vencidas y no vencidas: las no vencidas van en un bloque aparte, sin hablar de intereses de lo vencido', () => {
      const c = armarCorreo({ empresa: 'EMPRESA EJEMPLO', detalle: [retencion(7, 342000), noVencida(9, 112000)] });
      expect(c.texto).toContain('debe pagar los siguientes impuestos:\n\n- Retención en la fuente del mes de julio de 2026 por un valor de $342.000');
      expect(c.texto).toContain('Adicionalmente, en la página de la DIAN figuran las siguientes obligaciones pendientes de pago que aún no están vencidas:\n\n- Retención en la fuente del mes de septiembre de 2026 por un valor de $112.000');
      expect(c.texto).toContain('dentro del plazo establecido');
      // lo vencido y lo no vencido no se mezclan en la misma lista
      const vencidasTxt = c.texto.split('Adicionalmente')[0];
      expect(vencidasTxt).not.toContain('septiembre');
    });
    it('solo no vencidas: otra introducción (no dice que "debe" algo vencido) y sin párrafo de intereses/580-1', () => {
      const c = armarCorreo({ empresa: 'EMPRESA EJEMPLO', detalle: [noVencida(9, 112000)] });
      expect(c.texto).toContain('tiene las siguientes obligaciones pendientes de pago, que aún no están vencidas:');
      expect(c.texto).not.toContain('revisando las deudas vencidas');
      expect(c.texto).not.toContain('580-1');
      expect(c.texto).not.toContain('se cobran intereses');
    });
    it('una no vencida ya pagada o por revisar no se avisa', () => {
      expect(armarCorreo({ empresa: 'X', detalle: [{ ...noVencida(9, 1), estado: 'pagada' }, { ...noVencida(10, 1), estado: 'revisar' }] })).toBeNull();
    });
    it('datos antiguos sin el campo "vencida" se tratan como vencidas', () => {
      const c = armarCorreo({ empresa: 'X', detalle: [retencion(7, 1000)] });
      expect(c.texto).toContain('debe pagar los siguientes impuestos');
      expect(c.texto).not.toContain('Adicionalmente');
    });
  });

  it('null si no hay nada que cobrar', () => {
    expect(armarCorreo({ empresa: 'ACME', detalle: [retencion(7, 285000, 'pagada')] })).toBeNull();
    expect(armarCorreo({ empresa: 'ACME', detalle: [] })).toBeNull();
  });
});

describe('mesActualBogota', () => {
  it('usa la zona horaria de Bogotá, no la del servidor', () => {
    // 1 de noviembre 02:00 UTC = 31 de octubre 21:00 en Bogotá (UTC-5)
    expect(mesActualBogota(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10-01');
    expect(mesActualBogota(new Date('2026-11-01T06:00:00Z'))).toBe('2026-11-01');
    expect(mesActualBogota(new Date('2026-10-05T15:00:00Z'))).toBe('2026-10-01');
  });
});

describe('secretos (cifrado de claves DIAN)', () => {
  const llaveOriginal = process.env.DIAN_CLAVES_KEY;
  afterEach(() => {
    if (llaveOriginal === undefined) delete process.env.DIAN_CLAVES_KEY; else process.env.DIAN_CLAVES_KEY = llaveOriginal;
  });

  it('cifra y descifra (ida y vuelta) y no deja la clave en claro', () => {
    process.env.DIAN_CLAVES_KEY = 'a'.repeat(64);
    const guardado = cifrar('Clave123*');
    expect(guardado).not.toContain('Clave123');
    expect(guardado.startsWith('v1:')).toBe(true);
    expect(descifrar(guardado)).toBe('Clave123*');
  });
  it('cada cifrado es distinto (IV aleatorio)', () => {
    process.env.DIAN_CLAVES_KEY = 'b'.repeat(64);
    expect(cifrar('misma')).not.toBe(cifrar('misma'));
  });
  it('acepta la llave en base64', () => {
    process.env.DIAN_CLAVES_KEY = Buffer.alloc(32, 7).toString('base64');
    expect(descifrar(cifrar('hola'))).toBe('hola');
  });
  it('sin llave falla claro y nunca guarda en claro', () => {
    delete process.env.DIAN_CLAVES_KEY;
    expect(llaveConfigurada()).toBe(false);
    expect(() => cifrar('x')).toThrow(/DIAN_CLAVES_KEY/);
  });
  it('rechaza una llave de tamaño incorrecto', () => {
    process.env.DIAN_CLAVES_KEY = 'corta';
    expect(() => cifrar('x')).toThrow(/32 bytes/);
  });
  it('con otra llave no descifra', () => {
    process.env.DIAN_CLAVES_KEY = 'c'.repeat(64);
    const guardado = cifrar('secreto');
    process.env.DIAN_CLAVES_KEY = 'd'.repeat(64);
    expect(() => descifrar(guardado)).toThrow(/No se pudo descifrar/);
  });
  it('detecta manipulación del texto cifrado', () => {
    process.env.DIAN_CLAVES_KEY = 'e'.repeat(64);
    const partes = cifrar('secreto').split(':');
    partes[3] = Buffer.from('otro-contenido').toString('base64');
    expect(() => descifrar(partes.join(':'))).toThrow(/No se pudo descifrar/);
  });
  it('rechaza formatos desconocidos y vacío', () => {
    process.env.DIAN_CLAVES_KEY = 'f'.repeat(64);
    expect(() => descifrar('texto-plano')).toThrow(/Formato/);
    expect(() => cifrar('')).toThrow();
  });
});
