const { nombresCortos } = require('../../src/utils/nombreCorto');

const corto = (usuarios) => Object.fromEntries(nombresCortos(usuarios));

describe('nombresCortos', () => {
  test('usa solo el nombre de pila', () => {
    expect(corto([{ id: 1, name: 'Laura Gómez' }, { id: 2, name: 'Daniela Ruiz' }, { id: 3, name: 'Jullians' }])).toEqual({ 1: 'Laura', 2: 'Daniela', 3: 'Jullians' });
  });

  test('si dos comparten nombre de pila agrega la inicial del apellido', () => {
    expect(corto([{ id: 1, name: 'Mauricio Amado' }, { id: 2, name: 'Mauricio Gutierrez' }, { id: 3, name: 'Karen Salcedo' }]))
      .toEqual({ 1: 'Mauricio A.', 2: 'Mauricio G.', 3: 'Karen' });
  });

  test('si aun con la inicial coinciden, usa el primer apellido completo', () => {
    expect(corto([{ id: 1, name: 'Ana Gómez' }, { id: 2, name: 'Ana García' }, { id: 3, name: 'Ana Gil' }]))
      .toEqual({ 1: 'Ana Gómez', 2: 'Ana García', 3: 'Ana Gil' });
  });

  test('ignora mayúsculas, espacios sobrantes y nombres vacíos sin fallar', () => {
    expect(corto([{ id: 1, name: '  laura  Gómez ' }, { id: 2, name: 'LAURA Pérez' }, { id: 3, name: '' }, { id: 4, name: null }]))
      .toEqual({ 1: 'laura G.', 2: 'LAURA P.', 3: '', 4: '' });
  });
});
