-- Fondo Emprender — checklist de impuestos de la tarjeta "Información tributaria" (mp6)
-- Migración 023
--
-- Independiente del checklist mensual (fondo_procesos / fondo_checklist_meses /
-- fondo_checklist_items, migración 008): esas tablas pertenecen a Seguimiento
-- Mensual y alimentan el estado derivado de mp5/Contabilidad. Esta migración no
-- tiene FK ni JOIN con ninguna de las tres — mp6/Información tributaria deriva
-- su estado únicamente de las tablas creadas aquí.

-- ── 1. Catálogo de impuestos ────────────────────────────────────────────────────
-- Catálogo fijo de 4 obligaciones. A diferencia de fondo_procesos (checklist
-- mensual), aquí no se contempla agregar filas en tiempo de ejecución.

CREATE TABLE IF NOT EXISTS fondo_impuestos (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo     TEXT        NOT NULL UNIQUE
             CHECK (codigo IN ('autorretencion', 'retencion', 'iva', 'consumo')),
  nombre     TEXT        NOT NULL,
  orden      SMALLINT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER fondo_impuestos_updated_at
  BEFORE UPDATE ON fondo_impuestos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO fondo_impuestos (codigo, nombre, orden) VALUES
  ('autorretencion', 'Autorretención', 1),
  ('retencion',       'Retención',      2),
  ('iva',             'IVA',            3),
  ('consumo',         'Consumo',        4)
ON CONFLICT (codigo) DO NOTHING;

-- ── 2. Registro por empresa × impuesto × mes ──────────────────────────────────
-- Una fila por (empresa, impuesto, año, mes), igual al patrón de
-- fondo_detalle_macroprocesos (migración 012). 'na' existe porque no todas las
-- empresas tienen las 4 obligaciones todos los meses — si las 4 quedan en 'na'
-- para un mes, mp6 se marca como estado 'na' ("Sin impuestos aplicables").

CREATE TABLE IF NOT EXISTS fondo_impuestos_items (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id  UUID        NOT NULL REFERENCES fondo_empresas(id)  ON DELETE CASCADE,
  impuesto_id UUID        NOT NULL REFERENCES fondo_impuestos(id) ON DELETE RESTRICT,
  anio        SMALLINT    NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
  mes         SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado      VARCHAR(20) NOT NULL DEFAULT 'pending'
              CHECK (estado IN ('pending', 'presented', 'na')),
  nota        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, impuesto_id, anio, mes)
);

CREATE INDEX idx_fondo_impuestos_items_empresa     ON fondo_impuestos_items(empresa_id);
CREATE INDEX idx_fondo_impuestos_items_empresa_mes ON fondo_impuestos_items(empresa_id, anio, mes);

CREATE TRIGGER fondo_impuestos_items_updated_at
  BEFORE UPDATE ON fondo_impuestos_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
