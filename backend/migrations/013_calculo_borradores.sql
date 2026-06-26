-- Módulo DIAN — tabla de borradores de cálculo (expiran a los 14 días)
-- Migración 013

CREATE TABLE IF NOT EXISTS calculo_borradores (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  nombre_archivo  TEXT        NOT NULL,
  creado_por      UUID        NOT NULL REFERENCES users(id),
  datos           JSONB       NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calculo_borradores_creado_por ON calculo_borradores(creado_por);
CREATE INDEX idx_calculo_borradores_expires_at ON calculo_borradores(expires_at);

CREATE TRIGGER calculo_borradores_updated_at
  BEFORE UPDATE ON calculo_borradores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
