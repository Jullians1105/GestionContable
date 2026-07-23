-- Fondo Emprender — agrupar procesos del Seguimiento Mensual en columnas
-- Migración 024
--
-- Con 23 procesos en una sola fila de columnas, el equipo pidió poder
-- agruparlos (ej. "Nómina", "Impuestos") para reducir el scroll horizontal
-- y ordenar visualmente procesos relacionados. Migración puramente aditiva:
-- fondo_procesos y fondo_checklist_items no se tocan, todo proceso existente
-- queda con grupo_id = NULL (sin grupo, se sigue viendo igual que hoy).

CREATE TABLE IF NOT EXISTS fondo_proceso_grupos (
  id         UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  orden      SMALLINT     NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER fondo_proceso_grupos_updated_at
  BEFORE UPDATE ON fondo_proceso_grupos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Un grupo no tiene historial propio (solo agrupa procesos visualmente), así
-- que a diferencia de fondo_procesos sí se puede borrar de verdad — sus
-- procesos quedan sin grupo (ON DELETE SET NULL) en vez de perderse.
ALTER TABLE fondo_procesos
  ADD COLUMN IF NOT EXISTS grupo_id UUID REFERENCES fondo_proceso_grupos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fondo_procesos_grupo ON fondo_procesos(grupo_id);
