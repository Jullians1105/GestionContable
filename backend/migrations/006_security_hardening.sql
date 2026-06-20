-- Migración 006 — Hardening de seguridad OWASP
-- A01: columna is_active para desactivar cuentas sin borrarlas
-- A07: tabla login_attempts para detección de fuerza bruta

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Tabla de intentos de autenticación (éxitos y fallos)
CREATE TABLE IF NOT EXISTS login_attempts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       VARCHAR(255) NOT NULL,
  ip_address  VARCHAR(45),
  success     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time   ON login_attempts (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_success   ON login_attempts (email, success, created_at DESC);
