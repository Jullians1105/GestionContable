module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/index.js',
    '!src/controllers/fondo*.js',
    '!src/routes/fondo*.js',
    '!src/middleware/fondoAccess.js',
    // Mismo criterio que fondo* arriba: controllers/rutas pesados en SQL con
    // sus propios tests dedicados (ver tests/unit/ext*.test.js), pero no
    // cuentan para el umbral global de cobertura.
    '!src/controllers/ext*.js',
    '!src/routes/ext*.js',
    '!src/middleware/externasAccess.js',
    '!src/services/pushService.js',
    '!src/services/recurringTaskService.js',
    '!src/services/reminderService.js',
    // El camino feliz de exportarBorrador (~500 líneas de funciones build* que arman el
    // .xlsx) hace `await import('../../../shared/calcularNomina.js')` — ESM real, y Jest
    // no puede interceptar un import() nativo sin --experimental-vm-modules. No es
    // testeable de forma estable con la config actual, así que se excluye del cálculo de
    // cobertura en vez de forzar el número — ver tests/unit/dianController.test.js para
    // el detalle y lo que sí se cubre ahí (validaciones, aplicarClasificacionRapida,
    // marcarAnomaliaRevisada, calcularAnomalias, calcularDocumentosNoContabilizados).
    '!src/controllers/dianController.js',
    // dianTokenService.js maneja un Chrome real via CDP contra el sitio real de la DIAN
    // (catalogo-vpfe.dian.gov.co) — mockear Playwright hasta el punto de que un test
    // signifique algo implicaria reescribir toda su logica de espera/reintento en el mock,
    // sin ganar confianza real (la unica verificacion que importa es contra el sitio real,
    // ver docs/ESTADO_EMPRESAS_DIRECTORIO.md). Mismo criterio que dianController.js arriba.
    '!src/services/dianTokenService.js',
  ],
  coverageThreshold: { global: { lines: 70, functions: 70 } },
  maxWorkers: 1,
};
