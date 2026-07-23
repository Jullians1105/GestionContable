-- Recordatorio personalizado por tarea: fecha/hora específica elegida al crear/editar,
-- independiente del vencimiento (due_date/due_time). TIMESTAMP sin zona horaria, mismo
-- criterio que due_date/due_time: hora local de oficina tal cual, sin conversión de zona.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_reminder_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS custom_reminder_sent_at TIMESTAMPTZ;
