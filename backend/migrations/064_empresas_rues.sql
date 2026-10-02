-- Directorio maestro de empresas — estado de la matrícula mercantil según el RUES
-- Migración 064
--
-- Para vigilar a los PROPIOS clientes de la firma (no solo a los terceros de sus facturas,
-- migración 063): si la matrícula mercantil está cancelada o sin renovar. El RUES no entrega una
-- "fecha de vencimiento": entrega el estado, el último año renovado y la fecha de esa renovación;
-- el vencimiento lo pone la ley (renovación anual dentro de los tres primeros meses) y se calcula
-- al leer (ver ruesService.js#calcularSituacionMatricula), no se guarda.
--
-- Mismo patrón y mismas fuentes que terceros (ver 063): conjunto de datos abierto de Confecámaras
-- en datos.gov.co. Las columnas son aparte de la identidad (name, nit, ...) que no se toca.

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS rues_consulta            TEXT,
  ADD COLUMN IF NOT EXISTS rues_consultado_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rues_estado              TEXT,
  ADD COLUMN IF NOT EXISTS rues_ultimo_ano_renovado SMALLINT,
  ADD COLUMN IF NOT EXISTS rues_fecha_renovacion    DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'empresas_rues_consulta_check'
  ) THEN
    ALTER TABLE empresas
      ADD CONSTRAINT empresas_rues_consulta_check
      CHECK (rues_consulta IS NULL OR rues_consulta IN ('encontrado', 'no_encontrado'));
  END IF;
END $$;

-- Para el repaso periódico ("empresas sin verificar o verificadas hace más de N días").
CREATE INDEX IF NOT EXISTS idx_empresas_rues_consultado_at ON empresas (rues_consultado_at);
