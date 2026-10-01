jest.mock('../../src/config/database');
jest.mock('../../src/services/pushService', () => ({ sendPushToUser: jest.fn() }));

const db = require('../../src/config/database');
const { sendPushToUser } = require('../../src/services/pushService');
const {
  avisarMesHabilitado, avisarPlazoProximo, avisarPlazoVencido, avisarConfigurarPlazo, contarPorResponsable,
} = require('../../src/services/nePlazoReminderService');

function mockIo() {
  const emit = jest.fn();
  return { io: { to: jest.fn(() => ({ emit })) }, emit };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// Fake timers solo para los 3 describes que necesitan fijar "hoy" (setSystemTime) —
// contarPorResponsable no toca fechas, se queda con timers reales.
function conFechaFija() {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
}

describe('avisarMesHabilitado', () => {
  conFechaFija()
  test('un día que no es 1: igual avisa si todavía no se envió este mes (el servidor se apaga de noche)', async () => {
    jest.setSystemTime(new Date('2026-10-05T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] }) // yaSeEnvioEsteMes -> no
      .mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-10-15' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { io } = mockIo();
    await avisarMesHabilitado(io);
    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO notifications'));
    expect(insertCall[1][3]).toMatch(/septiembre de 2026.*15 de octubre de 2026/);
  });

  test('día 1: avisa a quienes tienen acceso, con la fecha límite ya configurada', async () => {
    jest.setSystemTime(new Date('2026-10-01T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] }) // yaSeEnvioEsteMes -> no se ha enviado
      .mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-10-14' }] }) // getFechaLimite(2026, 9)
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }, { id: 'u2' }] }) // usuarios con acceso
      .mockResolvedValueOnce({ rows: [] }) // insert notif u1
      .mockResolvedValueOnce({ rows: [] }); // insert notif u2
    const { io, emit } = mockIo();

    await avisarMesHabilitado(io);

    // El mes habilitado el 1 de octubre es septiembre.
    const insertCalls = db.query.mock.calls.filter((c) => c[0].includes('INSERT INTO notifications'));
    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0][1][1]).toBe('u1');
    expect(insertCalls[0][1][2]).toBe('ne_mes_habilitado');
    expect(insertCalls[0][1][3]).toMatch(/septiembre de 2026/);
    expect(insertCalls[0][1][3]).toMatch(/14 de octubre de 2026/);
    expect(sendPushToUser).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  test('día 1 sin fecha límite configurada, el mensaje avisa que falta configurarla', async () => {
    jest.setSystemTime(new Date('2026-10-01T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ fecha_limite: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'u1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { io } = mockIo();

    await avisarMesHabilitado(io);

    const insertCall = db.query.mock.calls.find((c) => c[0].includes('INSERT INTO notifications'));
    expect(insertCall[1][3]).toMatch(/sin configurar todavía/);
  });

  test('ya se había enviado este mes — no reenvía (evita duplicados al reiniciar el backend)', async () => {
    jest.setSystemTime(new Date('2026-10-01T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }); // yaSeEnvioEsteMes -> ya existe
    const { io } = mockIo();

    await avisarMesHabilitado(io);

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('sin usuarios con acceso, no inserta ninguna notificación', async () => {
    jest.setSystemTime(new Date('2026-10-01T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-09-14' }] })
      .mockResolvedValueOnce({ rows: [] }); // sin usuarios
    const { io } = mockIo();

    await avisarMesHabilitado(io);

    expect(db.query).toHaveBeenCalledTimes(3);
  });
});

describe('avisarPlazoProximo', () => {
  conFechaFija()

  test('sin fecha límite configurada, no hace nada más', async () => {
    jest.setSystemTime(new Date('2026-09-21T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ fecha_limite: null }] });
    const { io } = mockIo();

    await avisarPlazoProximo(io);

    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('faltan 5 días exactos: avisa a cada responsable con sus propios conteos', async () => {
    // Fecha límite 2026-09-26, hoy 2026-09-21 -> exactamente 5 días.
    jest.setSystemTime(new Date('2026-09-21T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-09-26' }] }) // getFechaLimite
      .mockResolvedValueOnce({ rows: [] }) // yaSeEnvioHoy
      .mockResolvedValueOnce({
        rows: [
          { responsable_id: 'resp-1', pendientes: '3', por_revisar: '1' },
          { responsable_id: 'resp-2', pendientes: '0', por_revisar: '0' }, // se filtra, no le llega nada
        ],
      }) // contarPorResponsable
      .mockResolvedValueOnce({ rows: [] }); // insert notif resp-1
    const { io } = mockIo();

    await avisarPlazoProximo(io);

    const insertCalls = db.query.mock.calls.filter((c) => c[0].includes('INSERT INTO notifications'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1][1]).toBe('resp-1');
    expect(insertCalls[0][1][3]).toBe('Quedan 5 días para el plazo de Nómina Electrónica. Tienes 3 pendientes y 1 en espera.');
  });

  test('faltan más o menos de 5 días — no avisa', async () => {
    jest.setSystemTime(new Date('2026-09-21T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-10-01' }] }); // 10 días
    const { io } = mockIo();

    await avisarPlazoProximo(io);

    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('avisarPlazoVencido', () => {
  conFechaFija()

  test('hoy es la fecha límite: avisa a cada responsable', async () => {
    jest.setSystemTime(new Date('2026-09-26T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-09-26' }] })
      .mockResolvedValueOnce({ rows: [] }) // yaSeEnvioHoy
      .mockResolvedValueOnce({ rows: [{ responsable_id: 'resp-1', pendientes: '1', por_revisar: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    const { io } = mockIo();

    await avisarPlazoVencido(io);

    const insertCalls = db.query.mock.calls.filter((c) => c[0].includes('INSERT INTO notifications'));
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0][1][3]).toBe('Hoy vence el plazo de Nómina Electrónica. Tienes 1 pendiente y 0 en espera.');
  });

  test('hoy no es la fecha límite — no avisa', async () => {
    jest.setSystemTime(new Date('2026-09-21T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-09-26' }] });
    const { io } = mockIo();

    await avisarPlazoVencido(io);

    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('contarPorResponsable', () => {
  test('filtra a los responsables sin nada pendiente ni por revisar', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        { responsable_id: 'a', pendientes: '2', por_revisar: '0' },
        { responsable_id: 'b', pendientes: '0', por_revisar: '0' },
        { responsable_id: 'c', pendientes: '0', por_revisar: '3' },
      ],
    });

    const resultado = await contarPorResponsable(2026, 9);

    expect(resultado).toEqual([
      { responsableId: 'a', pendientes: 2, porRevisar: 0 },
      { responsableId: 'c', pendientes: 0, porRevisar: 3 },
    ]);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ne_meses'), [2026, 9]);
  });
});

describe('fecha límite por mes', () => {
  conFechaFija()

  test('el aviso consulta la fecha del mes habilitado (septiembre el 1 de octubre), no una global', async () => {
    jest.setSystemTime(new Date('2026-10-10T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-10-15' }] });
    const { io } = mockIo();
    await avisarPlazoProximo(io);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('ne_plazo_mes'), [2026, 9]);
  });
});

describe('avisarConfigurarPlazo', () => {
  conFechaFija()

  test('fuera de los últimos 3 días del mes no hace nada ni consulta la base', async () => {
    jest.setSystemTime(new Date('2026-10-20T08:00:00'));
    const { io } = mockIo();
    await avisarConfigurarPlazo(io);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('a 3 días del fin de mes y sin fecha del mes en curso: avisa a las dos cuentas', async () => {
    jest.setSystemTime(new Date('2026-10-28T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] }) // getFechaLimite(2026, 10) -> sin configurar
      .mockResolvedValueOnce({ rows: [] }) // yaSeEnvioHoy
      .mockResolvedValue({ rows: [] }); // inserts
    const { io } = mockIo();
    await avisarConfigurarPlazo(io);
    expect(db.query).toHaveBeenNthCalledWith(1, expect.stringContaining('ne_plazo_mes'), [2026, 10]);
    const inserts = db.query.mock.calls.filter((c) => c[0].includes('INSERT INTO notifications'));
    expect(inserts).toHaveLength(2);
    expect(inserts.map((c) => c[1][1]).sort()).toEqual([
      '5e0ee191-e15b-482f-a7ff-463f8dcfea38',
      'f2a82148-64d0-44a2-a0ac-37462ed43138',
    ]);
    expect(inserts[0][1][2]).toBe('ne_configurar_plazo');
    expect(inserts[0][1][3]).toMatch(/octubre de 2026/);
  });

  test('si el mes en curso ya tiene fecha, no molesta', async () => {
    jest.setSystemTime(new Date('2026-10-29T08:00:00'));
    db.query.mockResolvedValueOnce({ rows: [{ fecha_limite: '2026-11-13' }] });
    const { io } = mockIo();
    await avisarConfigurarPlazo(io);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('ya avisó hoy — no repite', async () => {
    jest.setSystemTime(new Date('2026-10-30T08:00:00'));
    db.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const { io } = mockIo();
    await avisarConfigurarPlazo(io);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
