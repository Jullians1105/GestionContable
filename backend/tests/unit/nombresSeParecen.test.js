const { palabrasSignificativas, nombresSeParecen } = require('../../src/utils/nombresSeParecen');

// Encontrado con datos reales del directorio maestro de empresas: "ASOCIACION" por sí sola no
// distingue una empresa de otra (como "SAS"/"LTDA"), así que dos asociaciones distintas no
// deberían salir sugeridas como posible duplicado solo por compartir esa palabra.
describe('palabrasSignificativas — figuras jurídicas genéricas', () => {
  test('"ASOCIACION" no cuenta como palabra significativa', () => {
    expect(palabrasSignificativas('ASOCIACION MUJERES EMPRENDEDORAS')).not.toContain('ASOCIACION');
  });

  test('"ASO" (abreviatura) tampoco cuenta', () => {
    expect(palabrasSignificativas('ASO. GANADERIA EL PORVENIR')).not.toContain('ASO');
  });

  test('"FUNDACION" tampoco cuenta', () => {
    expect(palabrasSignificativas('FUNDACION PLANETA 24/7')).not.toContain('FUNDACION');
  });

  test('dos asociaciones distintas ya no comparten ninguna palabra significativa', () => {
    const a = new Set(palabrasSignificativas('ASOCIACION MUJERES EMPRENDEDORAS'));
    const b = palabrasSignificativas('ASOCIACION GANADERIA EL PORVENIR');
    expect(b.some((p) => a.has(p))).toBe(false);
  });
});

describe('nombresSeParecen', () => {
  test('sigue detectando el caso real que sí es la misma empresa', () => {
    expect(nombresSeParecen('CATACAKES PASTELERIA', 'CATACAKES')).toBe(true);
  });

  test('dos asociaciones sin ninguna otra palabra en común no se parecen', () => {
    expect(nombresSeParecen('ASOCIACION MUJERES EMPRENDEDORAS', 'ASOCIACION GANADERIA EL PORVENIR')).toBe(false);
  });
});
