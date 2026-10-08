jest.mock('../../src/config/database');

const db = require('../../src/config/database');
const { describirEvento, clasificarEvento } = require('../../src/utils/actividadDescripcion');
const { getActividad } = require('../../src/controllers/actividadController');

const E1 = '7bd9f4c5-de9c-4f5e-82e1-c5d61bbc4b6e';
const nombres = { contabEmp: { [E1]: 'ACME SAS' } };
const fila = (table, changes, action = 'CREATE') => ({ action, table_name: table, record_id: 'x', changes });

describe('Contabilidad y Gestión Tributaria: frases', () => {
  test.each([
    ['contab_reporte', { empresaId: E1, totalFilas: 312 }, 'Contabilidad', 'Subió el reporte DIAN de ACME SAS (312 filas)'],
    ['contab_reporte', { empresaId: null, totalFilas: 5 }, 'Contabilidad', 'Subió el reporte DIAN de una empresa sin asignar (5 filas)'],
    ['contab_exportacion', { empresaId: E1, periodo: '2026-09' }, 'Contabilidad', 'Exportó el Excel de contabilidad de ACME SAS (septiembre 2026)'],
    ['exogenas_archivo', { formato: '1001', contabEmpresaId: E1, anio: 2025, totalTerceros: 87 }, 'Exógenas', 'Analizó la exógena 1001 de ACME SAS (2025) — 87 terceros'],
    ['exogenas_archivo', { formato: '1005', totalTerceros: 10 }, 'Exógenas', 'Analizó la exógena 1005 — 10 terceros'],
    ['exogenas_generado', { formatos: ['1001', '1005'] }, 'Exógenas', 'Generó el Excel de exógenas (1001, 1005)'],
    ['terceros_importacion', { archivos: 12, nuevos: 5, actualizados: 3, errores: 1 }, 'Terceros', 'Importó terceros: 12 archivos, 5 nuevos, 3 actualizados, 1 con error'],
    ['terceros_importacion', { archivos: 1, nuevos: 0, actualizados: 0, errores: 0 }, 'Terceros', 'Importó terceros: 1 archivo, 0 nuevos, 0 actualizados'],
    ['terceros_rues', { pendientes: 40, forzar: true }, 'Terceros', 'Verificó terceros en el RUES (40 pendientes) — forzando a todos'],
    ['empresas_rues', { forzar: false, pendientes: 20, verificadas: 18, noEncontradas: 1, errores: 1 }, 'Directorio', 'Actualizó la matrícula mercantil de las empresas en el RUES — 18 verificadas, 1 no encontradas, 1 con error'],
    ['terceros_consulta', { documento: '901939874' }, 'Terceros', 'Consultó el tercero 901939874'],
    ['contab_consolidado_exportacion', { empresaId: E1, periodo: '2026-C2' }, 'Consolidado', 'Exportó el consolidado de ACME SAS (cuatrimestre 2 de 2026)'],
    ['contab_consolidado_exportacion', { empresaId: E1, periodo: '2026' }, 'Consolidado', 'Exportó el consolidado de ACME SAS (2026)'],
  ])('%s', (tabla, cambios, area, texto) => {
    const r = describirEvento(fila(tabla, cambios), nombres);
    expect(r.area).toBe(area);
    expect(r.texto).toBe(texto);
  });

  test('en el resumen cuentan como acciones con su empresa y sin estado', () => {
    expect(clasificarEvento(fila('contab_reporte', { empresaId: E1 }), nombres)).toMatchObject({ item: 'Subir reporte DIAN', empresa: 'ACME SAS', estadoClave: null });
    expect(clasificarEvento(fila('terceros_importacion', {}), nombres)).toMatchObject({ item: 'Importar terceros', empresa: null });
    expect(clasificarEvento(fila('exogenas_generado', {}), nombres).item).toBe('Generar Excel de exógenas');
  });
});

describe('getActividad traduce las empresas de Contabilidad', () => {
  test('consulta contab_empresas con los ids que aparecen en los registros', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM audit_log')) {
        return { rows: [
          { id: '1', user_id: 'u1', user_name: 'Laura', action: 'CREATE', table_name: 'contab_reporte', record_id: 'b1', changes: { empresaId: E1, totalFilas: 40 }, created_at: '2026-10-08T15:00:00Z' },
          { id: '2', user_id: 'u1', user_name: 'Laura', action: 'CREATE', table_name: 'exogenas_archivo', record_id: 'b2', changes: { formato: '1001', contabEmpresaId: E1, anio: 2025, totalTerceros: 3 }, created_at: '2026-10-08T14:00:00Z' },
        ] };
      }
      if (sql.includes('FROM contab_empresas')) return { rows: [{ id: E1, name: 'ACME SAS' }] };
      return { rows: [] };
    });
    const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
    await getActividad({ query: { fecha: '2026-10-08' } }, res, jest.fn());

    const laura = res.json.mock.calls[0][0].usuarios[0];
    expect(laura.eventos.map((e) => e.texto)).toEqual([
      'Subió el reporte DIAN de ACME SAS (40 filas)',
      'Analizó la exógena 1001 de ACME SAS (2025) — 3 terceros',
    ]);
    expect(laura.resumen.empresas).toBe(1);
    expect(laura.resumen.items.map((i) => i.item).sort()).toEqual(['Analizar exógenas', 'Subir reporte DIAN']);
  });
});
