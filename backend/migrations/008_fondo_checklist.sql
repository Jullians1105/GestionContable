-- Fondo Emprender — checklist mensual
-- Migración 008

-- ── 1. Catálogo de procesos ────────────────────────────────────────────────────
-- Editable en tiempo de ejecución: se pueden agregar procesos sin nueva migración.
-- Un proceso nunca se borra si ya tiene historial; se desactiva (activo = false)
-- para dejarlo de ofrecer en meses nuevos sin perder lo ya registrado.

CREATE TABLE IF NOT EXISTS fondo_procesos (
  id         UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  orden      SMALLINT     NOT NULL,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER fondo_procesos_updated_at
  BEFORE UPDATE ON fondo_procesos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO fondo_procesos (name, orden, activo) VALUES
  ('Nómina electrónica',          0,  true),
  ('Ventas',                       1,  true),
  ('Descargar fac DIAN',           2,  true),
  ('Excel Fondo',                  3,  true),
  ('Compras',                      4,  true),
  ('Mirar IVA compras',            5,  true),
  ('Autorretencion',               6,  true),
  ('Depreciacion',                 7,  true),
  ('Nómina Excel',                 8,  true),
  ('Pre-liquidación',              9,  true),
  ('Nómina Siigo',                 10, true),
  ('Pago nómina',                  11, true),
  ('Descargar egresos salario',    12, true),
  ('Certificado paz y salvo',      13, true),
  ('Extracto',                     14, true),
  ('Conciliación',                 15, true),
  ('Revisar libro aux fondo',      16, true),
  ('Estados financieros',          17, true),
  ('Pago seguridad social',        18, true),
  ('Descargar egresos SS',         19, true),
  ('Pago impuestos rete fuente',   20, true),
  ('Declaración IVA/imp consumo',  21, true),
  ('Registro terminado',           22, true);

-- ── 2. Registro por empresa × mes ─────────────────────────────────────────────
-- Una sola fila por (empresa, año, mes). El campo confirmed es el flag manual
-- que activa el estado "Contabilidad" en la vista de detalle; es independiente
-- de los estados individuales de cada proceso.

CREATE TABLE IF NOT EXISTS fondo_checklist_meses (
  id         UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID     NOT NULL REFERENCES fondo_empresas(id) ON DELETE CASCADE,
  anio       SMALLINT NOT NULL,
  mes        SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  confirmed  BOOLEAN  NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX idx_fondo_checklist_meses_anio_mes  ON fondo_checklist_meses(anio, mes);
CREATE INDEX idx_fondo_checklist_meses_empresa   ON fondo_checklist_meses(empresa_id);

CREATE TRIGGER fondo_checklist_meses_updated_at
  BEFORE UPDATE ON fondo_checklist_meses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Estado de un proceso dentro de un mes de una empresa ───────────────────
-- ON DELETE RESTRICT en proceso_id es deliberado: no debe poder borrarse un
-- proceso que ya tiene historial. El único camino de retiro es activo = false.

CREATE TABLE IF NOT EXISTS fondo_checklist_items (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes_id     UUID        NOT NULL REFERENCES fondo_checklist_meses(id) ON DELETE CASCADE,
  proceso_id UUID        NOT NULL REFERENCES fondo_procesos(id)        ON DELETE RESTRICT,
  estado     VARCHAR(20) NOT NULL DEFAULT 'pending'
             CHECK (estado IN ('pending', 'in_progress', 'done', 'na')),
  nota       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes_id, proceso_id)
);

CREATE INDEX idx_fondo_checklist_items_mes ON fondo_checklist_items(mes_id);

CREATE TRIGGER fondo_checklist_items_updated_at
  BEFORE UPDATE ON fondo_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
