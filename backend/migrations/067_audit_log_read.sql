-- Auditoría: se permite la acción 'READ' para dejar constancia de quién VIO una clave DIAN (copiar clave desde
-- Deudas DIAN / Directorio). Hasta ahora solo había CREATE/UPDATE/DELETE.
-- Migración 067
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'READ'));
