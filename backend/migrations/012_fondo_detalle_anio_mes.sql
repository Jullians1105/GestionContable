-- Añadir dimensión temporal a fondo_detalle_macroprocesos
-- Migración 012
--
-- Los macroprocesos pasan a ser por empresa × mes, igual que el checklist.
-- El UNIQUE ahora incluye (empresa_id, macroproceso_id, anio, mes).

ALTER TABLE fondo_detalle_macroprocesos
  ADD COLUMN IF NOT EXISTS anio SMALLINT,
  ADD COLUMN IF NOT EXISTS mes  SMALLINT;

-- Asignar filas existentes al mes actual para no perder datos
UPDATE fondo_detalle_macroprocesos
SET anio = EXTRACT(YEAR  FROM NOW())::smallint,
    mes  = EXTRACT(MONTH FROM NOW())::smallint
WHERE anio IS NULL;

ALTER TABLE fondo_detalle_macroprocesos
  ALTER COLUMN anio SET NOT NULL,
  ALTER COLUMN mes  SET NOT NULL;

ALTER TABLE fondo_detalle_macroprocesos
  ADD CONSTRAINT fondo_detalle_anio_check CHECK (anio >= 2000 AND anio <= 2100),
  ADD CONSTRAINT fondo_detalle_mes_check  CHECK (mes  BETWEEN 1 AND 12);

-- Reemplazar constraint único original
ALTER TABLE fondo_detalle_macroprocesos
  DROP CONSTRAINT IF EXISTS fondo_detalle_macroprocesos_empresa_id_macroproceso_id_key;

ALTER TABLE fondo_detalle_macroprocesos
  ADD CONSTRAINT fondo_detalle_macroprocesos_empresa_mp_month_key
  UNIQUE (empresa_id, macroproceso_id, anio, mes);

CREATE INDEX IF NOT EXISTS idx_fondo_detalle_month
  ON fondo_detalle_macroprocesos(empresa_id, anio, mes);
