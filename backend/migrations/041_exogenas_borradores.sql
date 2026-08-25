-- Módulo Exógenas — tabla de borradores (formatos 1005, 1001, 1006, 1007), expiran a los 14 días
-- Separada de calculo_borradores (módulo DIAN): dominio distinto, evoluciona distinto.
-- A diferencia de DIAN (un solo archivo de entrada), acá se guardan DOS archivos originales
-- (TOKEN de detalle + plantilla SIIGO) porque "generar" necesita reescribir la plantilla completa.
-- Migración 041

CREATE TABLE IF NOT EXISTS exogenas_borradores (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  formato             TEXT        NOT NULL CHECK (formato IN ('1005', '1001', '1006', '1007')),
  nombre_token        TEXT        NOT NULL,
  nombre_plantilla    TEXT        NOT NULL,
  creado_por          UUID        NOT NULL REFERENCES users(id),
  opciones            JSONB       NOT NULL DEFAULT '{}',
  registros           JSONB       NOT NULL,
  token_original      BYTEA       NOT NULL,
  plantilla_original  BYTEA       NOT NULL,
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exogenas_borradores_creado_por ON exogenas_borradores(creado_por);
CREATE INDEX idx_exogenas_borradores_expires_at ON exogenas_borradores(expires_at);
CREATE INDEX idx_exogenas_borradores_formato    ON exogenas_borradores(formato);

CREATE TRIGGER exogenas_borradores_updated_at
  BEFORE UPDATE ON exogenas_borradores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
