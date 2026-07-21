/**
 * Tests de integración para autenticación.
 * Requieren una base de datos PostgreSQL de prueba configurada.
 * Ejecutar con: DB_TEST_NAME=gestcon_test npm test
 *
 * Para correr sin BD: estos tests se saltan automáticamente si DB no está disponible.
 */

const request = require('supertest');

let app, server;
let skipTests = false;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  try {
    const module = require('../../src/index');
    app = module.app;
    server = module.server;
    // Verify DB connection
    const db = require('../../src/config/database');
    await db.query('SELECT 1');
  } catch {
    skipTests = true;
    console.warn('⚠️  BD no disponible, saltando tests de integración');
  }
});

afterAll(async () => {
  if (server) server.close();
});

const testUser = {
  email: `test_${Date.now()}@test.com`,
  password: 'Testpassword1',
  name: 'Test User',
};
let authToken;
let refreshToken;

describe('POST /api/auth/register', () => {
  test('registra usuario nuevo correctamente', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user).not.toHaveProperty('password_hash');
    authToken = res.body.token;
    refreshToken = res.body.refreshToken;
  });

  test('rechaza email duplicado', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/register').send(testUser);
    expect(res.status).toBe(409);
  });

  test('rechaza contraseña corta', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/register').send({ ...testUser, password: '123' });
    expect(res.status).toBe(400);
  });

  test('rechaza email inválido', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/register').send({ ...testUser, email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  test('login exitoso con credenciales correctas', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: testUser.password,
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(testUser.email);
  });

  test('rechaza contraseña incorrecta', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: 'wrongpassword',
    });
    expect(res.status).toBe(401);
  });

  test('rechaza email no registrado', async () => {
    if (skipTests) return;
    const res = await request(app).post('/api/auth/login').send({
      email: 'noexiste@test.com',
      password: 'cualquier123',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('retorna el usuario autenticado', async () => {
    if (skipTests || !authToken) return;
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(testUser.email);
  });

  test('rechaza request sin token', async () => {
    if (skipTests) return;
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/auth/me', () => {
  test('actualiza nombre y email del usuario autenticado', async () => {
    if (skipTests || !authToken) return;
    const newName = 'Test User Updated';
    const newEmail = `updated_${Date.now()}@test.com`;
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: newName, email: newEmail });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe(newName);
    expect(res.body.user.email).toBe(newEmail);
    expect(res.body.user).not.toHaveProperty('password_hash');
    testUser.email = newEmail;
  });

  test('rechaza cambio de contraseña sin indicar la contraseña actual', async () => {
    if (skipTests || !authToken) return;
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ newPassword: 'newpassword123' });
    expect(res.status).toBe(400);
  });

  test('rechaza cambio de contraseña con la contraseña actual incorrecta', async () => {
    if (skipTests || !authToken) return;
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'wrongpassword', newPassword: 'newpassword123' });
    expect(res.status).toBe(401);
  });

  test('actualiza la contraseña con la contraseña actual correcta', async () => {
    if (skipTests || !authToken) return;
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: testUser.password, newPassword: 'newpassword123' });
    expect(res.status).toBe(200);

    const loginRes = await request(app).post('/api/auth/login').send({
      email: testUser.email,
      password: 'newpassword123',
    });
    expect(loginRes.status).toBe(200);
  });

  test('rechaza request sin token', async () => {
    if (skipTests) return;
    const res = await request(app).put('/api/auth/me').send({ name: 'Nope' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  test('genera nuevo token con refresh token válido', async () => {
    if (skipTests || !refreshToken) return;
    const res = await request(app).post('/api/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('refreshToken');
  });
});

describe('POST /api/auth/logout', () => {
  test('invalida el token correctamente', async () => {
    if (skipTests || !authToken) return;
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // El token ya no debe ser válido
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    expect(meRes.status).toBe(401);
  });
});

describe('GET /api/health', () => {
  test('health check responde OK', async () => {
    if (skipTests) return;
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('OK');
  });
});
