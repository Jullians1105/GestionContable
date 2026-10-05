// Emparejamiento empresa <-> fila de los Excel de claves (services/dianDeudas/cruceClaves.js).
// Lo crítico: nunca asignar la clave de una empresa a otra, y no escoger a ciegas entre claves distintas.
const {
  variantesDocumento, compartenDocumento, normalizarNombre, similitud, emparejar, decidirClave, faltaIdentidad,
} = require('../../src/services/dianDeudas/cruceClaves');

const empresa = (o = {}) => ({ id: 'e1', name: 'ACME S.A.S', nit: '900123456', tipo_contribuyente: 'empresa', cedula_representante: '1000000001', ...o });
const fila = (o = {}) => ({ fuente: 'A', nombre: 'ACME', nit: '900123456', cedula: '1000000001', ingreso: 'x1', ...o });

describe('documentos', () => {
  it('el NIT con dígito de verificación equivale al NIT sin él', () => {
    expect(compartenDocumento('9001234561', '900123456')).toBe(true);
    expect(compartenDocumento('900.123.456-1', '900123456')).toBe(true);
    expect(compartenDocumento('900123457', '900123456')).toBe(false);
    expect(compartenDocumento('', '900123456')).toBe(false);
    expect([...variantesDocumento('9001234561')].sort()).toEqual(['900123456', '9001234561']);
  });
});

describe('normalizarNombre / similitud', () => {
  it('ignora tildes, formas legales y orden de palabras', () => {
    expect(normalizarNombre('Café El Lancero S.A.S')).toBe(normalizarNombre('EL LANCERO CAFE'));
    expect(normalizarNombre('CAPROVIVA SOCIEDAD POR ACCIONES SIMPLIFICADA')).toBe('CAPROVIVA');
  });
  it('mismo nombre = 1; nombres de empresas distintas quedan por debajo del umbral seguro', () => {
    expect(similitud(normalizarNombre('PANADERIA EJEMPLO'), normalizarNombre('PANADERIA EJEMPLO SAS'))).toBe(1);
    expect(similitud(normalizarNombre('GRANJA AVICOLA PARAISO REAL'), normalizarNombre('GRANJA AVICOLA GUADALUPE SAS'))).toBeLessThan(0.9);
    expect(similitud(normalizarNombre('GANADERIA F.M&L SAS'), normalizarNombre('A&G GANADERIA'))).toBeLessThan(0.9);
    expect(similitud('', 'X')).toBe(0);
  });
});

describe('emparejar', () => {
  it('por NIT', () => {
    const r = emparejar(empresa(), [fila(), fila({ nit: '900000001', nombre: 'OTRA' })]);
    expect(r.metodo).toBe('documento');
    expect(r.candidatas).toHaveLength(1);
  });
  it('persona natural: la fila sin NIT cuya cédula es el documento', () => {
    const e = empresa({ name: 'MARLEN PINTO', nit: '46674892', tipo_contribuyente: 'natural', cedula_representante: null });
    const r = emparejar(e, [fila({ nit: '', cedula: '46674892', nombre: 'MARLEN PINTO GRANADOS' }), fila({ nit: '', cedula: '111', nombre: 'OTRA' })]);
    expect(r.candidatas.map((f) => f.cedula)).toEqual(['46674892']);
  });
  it('mismo NIT con varias filas (representantes distintos): se queda con la de la misma cédula', () => {
    const r = emparejar(empresa({ cedula_representante: '222' }), [fila({ cedula: '111', ingreso: 'a' }), fila({ cedula: '222', ingreso: 'b' })]);
    expect(r.candidatas.map((f) => f.ingreso)).toEqual(['b']);
  });
  it('si ninguna fila trae la cédula del representante, avisa', () => {
    const r = emparejar(empresa({ cedula_representante: '999' }), [fila({ cedula: '111' })]);
    expect(r.alertas[0]).toMatch(/cédula del representante/);
  });
  it('por nombre casi idéntico cuando no hay documento', () => {
    const r = emparejar(empresa({ nit: '' , name: 'PANADERIA EJEMPLO' }), [fila({ nit: '', cedula: '', nombre: 'PANADERIA EJEMPLO S.A.S' })]);
    expect(r.metodo).toBe('nombre');
    expect(r.candidatas).toHaveLength(1);
  });
  it('mismo nombre pero OTRO NIT: no es la misma empresa', () => {
    const r = emparejar(empresa({ nit: '901111111', name: 'ACME' }), [fila({ nit: '900222222', nombre: 'ACME' })]);
    expect(r.candidatas).toHaveLength(0);
    expect(r.alertas[0]).toMatch(/otro NIT/);
  });
  it('sin nada parecido: sin candidatas', () => {
    expect(emparejar(empresa(), [fila({ nit: '1', nombre: 'ZZZ', cedula: '2' })]).candidatas).toHaveLength(0);
  });
});

describe('decidirClave', () => {
  it('una fila con clave -> segura', () => {
    expect(decidirClave(empresa(), [fila()])).toMatchObject({ estado: 'segura', clave: 'x1' });
  });
  it('varias filas con la MISMA clave -> segura', () => {
    expect(decidirClave(empresa(), [fila({ fuente: 'A' }), fila({ fuente: 'B' })])).toMatchObject({ estado: 'segura', clave: 'x1' });
  });
  it('claves distintas entre filas -> conflicto (no se escoge)', () => {
    const r = decidirClave(empresa(), [fila({ fuente: 'A', ingreso: 'x1' }), fila({ fuente: 'B', ingreso: 'x2' })]);
    expect(r.estado).toBe('conflicto');
    expect(r.clave).toBeUndefined();
    expect(r.motivo).toMatch(/2 claves distintas/);
  });
  it('fila sin INGRESO -> sin_clave', () => {
    expect(decidirClave(empresa(), [fila({ ingreso: '' })]).estado).toBe('sin_clave');
  });
  it('no aparece -> sin_clave', () => {
    expect(decidirClave(empresa(), []).estado).toBe('sin_clave');
  });
  it('cédula del representante distinta -> revisar, no segura', () => {
    expect(decidirClave(empresa({ cedula_representante: '999' }), [fila({ cedula: '111' })]).estado).toBe('revisar');
  });
  it('una fila con clave y otra sin clave -> usa la que tiene', () => {
    expect(decidirClave(empresa(), [fila({ ingreso: '' }), fila({ ingreso: 'x9' })])).toMatchObject({ estado: 'segura', clave: 'x9' });
  });
  it('nombre idéntico a dos empresas distintas -> revisar', () => {
    const e = empresa({ nit: '', name: 'LOGISTK' });
    const r = decidirClave(e, [fila({ nit: '', cedula: '1', nombre: 'LOGISTK', ingreso: 'a' }), fila({ nit: '', cedula: '2', nombre: 'LOGISTK', ingreso: 'a' })]);
    expect(r.estado).toBe('revisar');
  });
});

describe('faltaIdentidad', () => {
  it('detecta lo que impide ingresar a la DIAN', () => {
    expect(faltaIdentidad(empresa({ tipo_contribuyente: null }))).toMatch(/tipo/);
    expect(faltaIdentidad(empresa({ nit: '' }))).toMatch(/NIT/);
    expect(faltaIdentidad(empresa({ cedula_representante: null }))).toMatch(/cédula/);
    expect(faltaIdentidad(empresa({ tipo_contribuyente: 'natural', cedula_representante: null }))).toBeNull();
    expect(faltaIdentidad(empresa())).toBeNull();
  });
});
