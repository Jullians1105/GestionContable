-- Recordatorio opcional en tareas pendientes personales (Mis Pendientes).
-- Antes vivía en las tareas de equipo (custom_reminder_at, ver 033) — se movió acá
-- porque es un espacio 100% personal (ver 029) y el recordatorio también lo es.
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP;
ALTER TABLE personal_tasks ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;
