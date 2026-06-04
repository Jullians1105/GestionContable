-- TaskFlow Pro - Datos de prueba
-- Migración 002 (seed)
-- Contraseñas: admin123, leader123, member123, viewer123

INSERT INTO users (id, email, password_hash, name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'maria@empresa.com',
   '$2b$10$8K1p/a0dclxMFWe5KbMlhOGx9jNc1.B0xHcRuL3PZgvE9gCbGgCLK', 'María García', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'carlos@empresa.com',
   '$2b$10$LDnxWnGHcCb0qlw01Q4MVOOHkWj.cZrXfxfKR6FQfHpEyMjhvsMoO', 'Carlos López', 'leader'),
  ('00000000-0000-0000-0000-000000000003', 'ana@empresa.com',
   '$2b$10$lsImpkRiEuvh7ZG7UkM0m.Yqaz6xJilnSIQgSk.DG0OMFbXmFfVAu', 'Ana Martínez', 'member'),
  ('00000000-0000-0000-0000-000000000004', 'pedro@empresa.com',
   '$2b$10$lsImpkRiEuvh7ZG7UkM0m.Yqaz6xJilnSIQgSk.DG0OMFbXmFfVAu', 'Pedro Sánchez', 'member'),
  ('00000000-0000-0000-0000-000000000005', 'laura@empresa.com',
   '$2b$10$rCPHpAQ3Ihy4qdxbFzKexeHK1qN89bLLvvbOW6/9KE11tVY.V7I8u', 'Laura Torres', 'viewer')
ON CONFLICT (email) DO NOTHING;

INSERT INTO groups (id, leader_id, name, description, color) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
   'Desarrollo Backend', 'Equipo de desarrollo de APIs y servidores', '#004ac6'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
   'Diseño UX', 'Equipo de experiencia de usuario', '#10B981')
ON CONFLICT DO NOTHING;

INSERT INTO group_members (group_id, user_id) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;

INSERT INTO task_tags (id, name, color) VALUES
  ('20000000-0000-0000-0000-000000000001', 'bug', '#EF4444'),
  ('20000000-0000-0000-0000-000000000002', 'feature', '#10B981'),
  ('20000000-0000-0000-0000-000000000003', 'urgente', '#FBBF24'),
  ('20000000-0000-0000-0000-000000000004', 'documentación', '#6366f1')
ON CONFLICT (name) DO NOTHING;

INSERT INTO tasks (id, user_id, group_id, title, description, status, priority, assigned_to, due_date) VALUES
  ('30000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Implementar autenticación JWT',
   'Crear sistema de login con JWT, refresh tokens y logout seguro',
   'completed', 'high',
   '00000000-0000-0000-0000-000000000002',
   NOW() - INTERVAL '5 days'),
  ('30000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Migrar base de datos a PostgreSQL',
   'Crear esquema relacional, migraciones y scripts de seed',
   'in_progress', 'high',
   '00000000-0000-0000-0000-000000000003',
   NOW() + INTERVAL '3 days'),
  ('30000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Configurar WebSockets con Socket.io',
   'Reemplazar polling cada 3 segundos con comunicación en tiempo real',
   'pending', 'medium',
   '00000000-0000-0000-0000-000000000004',
   NOW() + INTERVAL '7 days'),
  ('30000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000001',
   NULL,
   'Escribir tests de integración',
   'Cobertura mínima del 80% para endpoints críticos',
   'pending', 'medium',
   '00000000-0000-0000-0000-000000000003',
   NOW() + INTERVAL '14 days'),
  ('30000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   'Diseñar mockups del dashboard',
   'Crear wireframes y prototipos de alta fidelidad',
   'completed', 'low',
   '00000000-0000-0000-0000-000000000005',
   NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

INSERT INTO task_tag_assignment (task_id, tag_id) VALUES
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000004')
ON CONFLICT DO NOTHING;

INSERT INTO task_subtasks (id, task_id, title, completed) VALUES
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Instalar jsonwebtoken y bcrypt', true),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'Crear endpoint /login', true),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'Crear middleware de autenticación', true),
  ('40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', 'Crear esquema PostgreSQL', true),
  ('40000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', 'Crear script de migraciones', false),
  ('40000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', 'Migrar datos existentes', false)
ON CONFLICT DO NOTHING;

INSERT INTO task_comments (id, task_id, user_id, text) VALUES
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002', 'Completado. JWT con expiración de 1h y refresh token de 7 días.'),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000003', 'Avanzando con el esquema. Las foreign keys están funcionando correctamente.')
ON CONFLICT DO NOTHING;
