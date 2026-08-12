-- Empresas Externas — catálogo de empresas, catálogo de procesos y checklist mensual
-- Migración 038

-- ── 1. Catálogo de empresas ────────────────────────────────────────────────────
-- responsable_id referencia al usuario del equipo a cargo de esa empresa;
-- ON DELETE SET NULL porque si esa cuenta se borra, la empresa sigue existiendo
-- solo sin responsable asignado (no tiene sentido arrastrarla con ella).

CREATE TABLE IF NOT EXISTS ext_empresas (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           VARCHAR(255) NOT NULL,
  responsable_id UUID         REFERENCES users(id) ON DELETE SET NULL,
  activa         BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ext_empresas_responsable ON ext_empresas(responsable_id);

CREATE TRIGGER ext_empresas_updated_at
  BEFORE UPDATE ON ext_empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO ext_empresas (name) VALUES
  ('AGROESANA'),
  ('ANALIZAR'),
  ('ASERCOM'),
  ('AVICOLA VILLA MAR'),
  ('CECILIA RINCON'),
  ('COMERCIALIZADORA DE ALIMENTOS TEREMAR S & R'),
  ('CONCEPT CONSTRUCTORA'),
  ('CORTILINE'),
  ('DEFENSA CIVIL DUITAMA'),
  ('EDS LA ISLA'),
  ('ELIBRY SAS'),
  ('EQUIPXA SAS'),
  ('FUNDICIONES METALICAS'),
  ('GLOB BERRY S.A.S.'),
  ('GRANJA AVICOLA PARAISO REAL'),
  ('HACIENDA SUESCUN'),
  ('INVERSIONES LOGISTICAS FRUANTI'),
  ('JORGE MARTINEZ'),
  ('LACTEOS LAS ROCAS'),
  ('LUIS ALBEIRO BECERRA DIAZ'),
  ('MANFIL'),
  ('MARTHA PATRICIA ROJAS RINCON'),
  ('PEDRO NEL ROJAS RINCON'),
  ('PRIATOLI'),
  ('PROYECTOS IMPERIO'),
  ('REFUGIO GENESIS'),
  ('SERVIBANDAS'),
  ('SIGEMIN'),
  ('TABBY CENTRO MEDICO'),
  ('TISAU MATERIALES'),
  ('TORR.CAS IMPORTACIONES'),
  ('TRANSPORTES ELITE'),
  ('UN MUNDO APICOLA EN SUS MANOS'),
  ('VERLEIH'),
  ('VERTIFEX S.A.S.');

-- ── 2. Catálogo de procesos ────────────────────────────────────────────────────
-- Mismo patrón que fondo_procesos: editable en tiempo de ejecución, un proceso
-- con historial nunca se borra (ON DELETE RESTRICT abajo), solo se desactiva.

CREATE TABLE IF NOT EXISTS ext_procesos (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL UNIQUE,
  orden      SMALLINT     NOT NULL,
  activo     BOOLEAN      NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TRIGGER ext_procesos_updated_at
  BEFORE UPDATE ON ext_procesos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO ext_procesos (name, orden) VALUES
  ('Nómina electrónica',      0),
  ('Ventas',                  1),
  ('Compras',                 2),
  ('Autorretención',          3),
  ('Depreciación',            4),
  ('Nómina',                  5),
  ('Pago nómina',             6),
  ('Conciliación',            7),
  ('Pago seguridad social',   8),
  ('Pago impuestos',          9),
  ('Caja',                    10);

-- ── 3. Registro por empresa × mes ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ext_checklist_meses (
  id         UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID     NOT NULL REFERENCES ext_empresas(id) ON DELETE CASCADE,
  anio       SMALLINT NOT NULL,
  mes        SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE INDEX idx_ext_checklist_meses_anio_mes ON ext_checklist_meses(anio, mes);
CREATE INDEX idx_ext_checklist_meses_empresa  ON ext_checklist_meses(empresa_id);

CREATE TRIGGER ext_checklist_meses_updated_at
  BEFORE UPDATE ON ext_checklist_meses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 4. Estado de un proceso dentro de un mes de una empresa ───────────────────
-- ON DELETE RESTRICT en proceso_id es deliberado: no debe poder borrarse un
-- proceso que ya tiene historial. El único camino de retiro es activo = false.

CREATE TABLE IF NOT EXISTS ext_checklist_items (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes_id     UUID        NOT NULL REFERENCES ext_checklist_meses(id) ON DELETE CASCADE,
  proceso_id UUID        NOT NULL REFERENCES ext_procesos(id)        ON DELETE RESTRICT,
  estado     VARCHAR(20) NOT NULL DEFAULT 'pending'
             CHECK (estado IN ('pending', 'in_progress', 'done', 'na')),
  nota       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (mes_id, proceso_id)
);

CREATE INDEX idx_ext_checklist_items_mes ON ext_checklist_items(mes_id);

CREATE TRIGGER ext_checklist_items_updated_at
  BEFORE UPDATE ON ext_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
