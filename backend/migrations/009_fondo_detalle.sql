-- Fondo Emprender — snapshot de macroprocesos editables por empresa
-- Migración 009

-- mp5 (Contabilidad) se excluye del CHECK a propósito: su estado se deriva
-- siempre de fondo_checklist_meses.confirmed del mes vigente y nunca se persiste
-- aquí. Los únicos macroprocesos con fila propia son mp1-mp4, mp6, mp7.

CREATE TABLE IF NOT EXISTS fondo_detalle_macroprocesos (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id       UUID        NOT NULL REFERENCES fondo_empresas(id) ON DELETE CASCADE,
  macroproceso_id  VARCHAR(10) NOT NULL
                   CHECK (macroproceso_id IN ('mp1','mp2','mp3','mp4','mp6','mp7')),
  estado           VARCHAR(20) NOT NULL DEFAULT 'pending'
                   CHECK (estado IN ('pending','in_progress','done')),
  responsable_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  nota             TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, macroproceso_id)
);

CREATE INDEX idx_fondo_detalle_empresa ON fondo_detalle_macroprocesos(empresa_id);

CREATE TRIGGER fondo_detalle_macroprocesos_updated_at
  BEFORE UPDATE ON fondo_detalle_macroprocesos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
