-- El recordatorio personalizado de las tareas de equipo se movió a Mis Pendientes (ver 034).
-- reminder_sent_at (016) no se toca: es del aviso automático de vencimiento, algo distinto.
ALTER TABLE tasks DROP COLUMN IF EXISTS custom_reminder_at;
ALTER TABLE tasks DROP COLUMN IF EXISTS custom_reminder_sent_at;
