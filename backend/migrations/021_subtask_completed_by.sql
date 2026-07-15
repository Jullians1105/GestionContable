-- Registra quién completó cada subtarea y cuándo. Aditiva/idempotente.
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE task_subtasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill best-effort: subtareas ya completadas usan su updated_at como fecha aproximada;
-- no hay forma de reconstruir quién las completó retroactivamente (completed_by queda NULL).
UPDATE task_subtasks SET completed_at = updated_at WHERE completed = true AND completed_at IS NULL;
