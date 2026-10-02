-- Terceros — verificación contra el RUES (registro mercantil de las Cámaras de Comercio)
-- Migración 063
--
-- El conjunto de datos abierto del RUES (datos.gov.co, publicado por Confecámaras) aporta la
-- razón social oficial, el estado de la matrícula, la actividad CIIU y el representante legal por
-- NIT/documento. NO trae dirección ni país, así que esos siguen saliendo de la factura (PDF).
-- Las columnas son aparte de las que ya existen: `razon_social` sigue siendo el nombre de la
-- factura (lo que usa la exógena hoy) y el nombre del RUES vive en `rues_razon_social`.
--
-- `tiene_pdf` distingue un tercero que vino de una factura de uno creado solo desde el RUES
-- (para mostrar el origen en pantalla). Los terceros que ya existen salieron todos de PDFs.

ALTER TABLE terceros
  ADD COLUMN IF NOT EXISTS tiene_pdf                  BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rues_consulta              TEXT,
  ADD COLUMN IF NOT EXISTS rues_consultado_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rues_razon_social          TEXT,
  ADD COLUMN IF NOT EXISTS rues_estado                TEXT,
  ADD COLUMN IF NOT EXISTS rues_ciiu                  TEXT,
  ADD COLUMN IF NOT EXISTS rues_representante_legal   TEXT,
  ADD COLUMN IF NOT EXISTS rues_representante_documento      TEXT,
  ADD COLUMN IF NOT EXISTS rues_representante_tipo_documento TEXT,
  ADD COLUMN IF NOT EXISTS rues_organizacion_juridica TEXT,
  ADD COLUMN IF NOT EXISTS rues_ultimo_ano_renovado   SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terceros_rues_consulta_check'
  ) THEN
    ALTER TABLE terceros
      ADD CONSTRAINT terceros_rues_consulta_check
      CHECK (rues_consulta IS NULL OR rues_consulta IN ('encontrado', 'no_encontrado'));
  END IF;
END $$;

-- Para el repaso periódico ("terceros sin verificar o verificados hace más de N días").
CREATE INDEX IF NOT EXISTS idx_terceros_rues_consultado_at ON terceros (rues_consultado_at);
