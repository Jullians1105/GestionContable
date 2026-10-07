// Un usuario con rol 'viewer' es de solo lectura: toda ruta que escribe debe pasar por canEdit
// (o por un filtro más estricto como roleMiddleware/require*Access). Este test fija las rutas que
// antes se quedaron sin la guarda, para que nadie la quite sin querer.
jest.mock('../../src/config/database');

const { canEdit } = require('../../src/middleware/auth');

const RUTAS = {
  contabEmpresas: [['put', '/:id']],
  dian: [
    ['post', '/upload'],
    ['patch', '/borradores/:id'],
    ['patch', '/borradores/:id/aplicar-clasificacion-rapida'],
    ['patch', '/borradores/:id/nomina'],
    ['patch', '/borradores/:id/revisar-anomalia'],
  ],
  empresasMaestro: [['post', '/:id/generar-token-dian']],
  exogenas: [
    ['post', '/upload'],
    ['post', '/borradores/:id/generar'],
    ['post', '/generar-combinado'],
  ],
  fondoLinks: [
    ['post', '/:id/fondo-link'],
    ['delete', '/:id/fondo-link'],
  ],
  tags: [['post', '/']],
  terceros: [['post', '/upload']],
};

describe('rutas de escritura bloquean al viewer (canEdit)', () => {
  for (const [archivo, rutas] of Object.entries(RUTAS)) {
    const router = require(`../../src/routes/${archivo}`);
    test.each(rutas)(`${archivo}: %s %s`, (metodo, ruta) => {
      const capa = router.stack.find((l) => l.route && l.route.path === ruta && l.route.methods[metodo]);
      expect(capa).toBeDefined();
      expect(capa.route.stack.some((h) => h.handle === canEdit)).toBe(true);
    });
  }

  test('canEdit responde 403 a un viewer y deja pasar al resto', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    canEdit({ user: { userId: 'u', role: 'viewer' }, path: '/x', method: 'POST' }, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();

    const next2 = jest.fn();
    canEdit({ user: { userId: 'u', role: 'member' } }, res, next2);
    expect(next2).toHaveBeenCalled();
  });
});
