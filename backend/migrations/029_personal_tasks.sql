-- Tareas pendientes personales — checklist privado por usuario
-- Migración 029
--
-- Espacio 100% personal, sin asignación a terceros ni vínculo con grupos.
-- Todo acceso se filtra siempre por user_id = usuario autenticado, tanto acá
-- (ON DELETE CASCADE si se borra el usuario) como en el controller (ninguna
-- query de personal_tasks/personal_task_items corre sin ese filtro).

CREATE TABLE IF NOT EXISTS personal_tasks (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL,
  completed  BOOLEAN      NOT NULL DEFAULT false,
  position   INTEGER      NOT NULL DEFAULT 0,
  due_date   DATE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_user ON personal_tasks(user_id);

CREATE TRIGGER personal_tasks_updated_at
  BEFORE UPDATE ON personal_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS personal_task_items (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  personal_task_id UUID         NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL,
  completed        BOOLEAN      NOT NULL DEFAULT false,
  position         INTEGER      NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_task_items_task ON personal_task_items(personal_task_id);
