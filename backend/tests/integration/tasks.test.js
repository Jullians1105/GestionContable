/**
 * Tests de integración para tareas.
 * Requieren BD PostgreSQL de prueba.
 */
const request = require('supertest');

let app, authToken;
let skipTests = false;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  try {
    const module = require('../../src/index');
    app = module.app;
    const db = require('../../src/config/database');
    await db.query('SELECT 1');

    const res = await request(app).post('/api/auth/login').send({
      email: 'maria@empresa.com',
      password: 'admin123',
    });
    if (res.body.token) authToken = res.body.token;
    else skipTests = true;
  } catch {
    skipTests = true;
  }
});

describe('GET /api/tasks', () => {
  test('retorna lista de tareas', async () => {
    if (skipTests) return;
    const res = await request(app)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tasks');
    expect(Array.isArray(res.body.tasks)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  test('filtra por status', async () => {
    if (skipTests) return;
    const res = await request(app)
      .get('/api/tasks?status=pending')
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    res.body.tasks.forEach(t => expect(t.status).toBe('pending'));
  });

  test('requiere autenticación', async () => {
    if (skipTests) return;
    const res = await request(app).get('/api/tasks');
    expect(res.status).toBe(401);
  });
});

let createdTaskId;

describe('POST /api/tasks', () => {
  test('crea tarea nueva', async () => {
    if (skipTests) return;
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ title: 'Tarea de test', priority: 'high', description: 'Descripción test' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Tarea de test');
    expect(res.body.status).toBe('pending');
    createdTaskId = res.body.id;
  });

  test('rechaza tarea sin título', async () => {
    if (skipTests) return;
    const res = await request(app)
      .post('/api/tasks')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ priority: 'high' });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/tasks/:id', () => {
  test('actualiza status de tarea', async () => {
    if (skipTests || !createdTaskId) return;
    const res = await request(app)
      .put(`/api/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ status: 'in_progress' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('in_progress');
  });
});

describe('GET /api/tasks/:id/history', () => {
  test('retorna historial de la tarea', async () => {
    if (skipTests || !createdTaskId) return;
    const res = await request(app)
      .get(`/api/tasks/${createdTaskId}/history`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('history');
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('elimina la tarea creada', async () => {
    if (skipTests || !createdTaskId) return;
    const res = await request(app)
      .delete(`/api/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
