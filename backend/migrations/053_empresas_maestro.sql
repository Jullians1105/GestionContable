-- Directorio maestro de empresas — unifica fondo_empresas, ext_empresas, ne_empresas y
-- contab_empresas bajo una sola identidad, para verlas/administrarlas desde un solo lugar
-- (pantalla "Empresas") y detectar cuando la misma empresa real quedó creada por separado en
-- varios catálogos sin que nadie se diera cuenta.
-- Migración 053
--
-- Las 4 tablas de módulo NO se tocan más allá de agregarles `empresa_id`: sus columnas propias
-- (categoria/monthlyFee en fondo_empresas, responsable_id en ext_empresas, nit en
-- contab_empresas, etc.) siguen siendo configuración de esa empresa PARA ese módulo, no su
-- identidad — así ningún SELECT existente de los 4 controladores necesita cambiar todavía.
--
-- `empresa_id` queda NULLABLE a propósito (no NOT NULL): los 4 puntos de creación actuales
-- (FondoEmprenderEmpresasPage, EmpresasExternasPage, NominaElectronicaEmpresasPage,
-- DianUploadPage) siguen sin tocarse en esta migración y no lo llenan todavía — forzar NOT NULL
-- ahora rompería esas pantallas. Se endurece más adelante, cuando esos 4 puntos ya pasen por
-- el directorio maestro.

-- ── 1. Tabla maestra ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS empresas (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       VARCHAR(255) NOT NULL,
  activa     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER empresas_updated_at
  BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Columna de enlace en cada catálogo existente ─────────────────────────────
-- UNIQUE parcial (solo cuando no es NULL): una empresa maestra tiene como máximo una fila
-- habilitada por módulo — tener dos sería ambiguo (¿cuál de las dos manda?).
ALTER TABLE fondo_empresas  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE ext_empresas    ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE ne_empresas     ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;
ALTER TABLE contab_empresas ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES empresas(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fondo_empresas_empresa_id  ON fondo_empresas(empresa_id)  WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ext_empresas_empresa_id    ON ext_empresas(empresa_id)    WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ne_empresas_empresa_id     ON ne_empresas(empresa_id)     WHERE empresa_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contab_empresas_empresa_id ON contab_empresas(empresa_id) WHERE empresa_id IS NOT NULL;

-- ── 3. Backfill ──────────────────────────────────────────────────────────────────
-- Nada se fusiona por nombre parecido acá — eso lo decide una persona a mano desde la pantalla
-- nueva ("Fusionar"). Este backfill solo reaprovecha enlaces YA CONFIRMADOS (los que
-- ne_empresas ya tenía hacia fondo_empresas/ext_empresas, migraciones 045/046) y, para todo lo
-- demás, crea una empresa maestra 1-a-1 sin inventar ninguna relación nueva.

-- 3a. Una fila maestra por cada ne_empresas (109) — se generan los UUID de antemano (en vez de
-- dejar que el DEFAULT de la tabla los invente) para poder correlacionar el INSERT con el
-- UPDATE por ne_empresas.id (su PK, sin ambigüedad) en vez de por nombre (no es único ahí).
WITH mapeo AS (
  SELECT ne.id AS origen_id, uuid_generate_v4() AS empresa_id, ne.name
  FROM ne_empresas ne
  WHERE ne.empresa_id IS NULL
),
ins AS (
  INSERT INTO empresas (id, name)
  SELECT empresa_id, name FROM mapeo
)
UPDATE ne_empresas ne
SET empresa_id = mapeo.empresa_id
FROM mapeo
WHERE ne.id = mapeo.origen_id;

-- 3b. fondo_empresas/ext_empresas que YA estaban enlazadas desde ne_empresas: reusan esa misma
-- empresa maestra (el índice único idx_ne_empresas_fondo_unico/ext_unico garantiza que cada
-- fondo/ext empresa tiene como máximo un ne_empresas apuntándole, así que esto no es ambiguo).
UPDATE fondo_empresas fe
SET empresa_id = ne.empresa_id
FROM ne_empresas ne
WHERE ne.fondo_empresa_id = fe.id AND fe.empresa_id IS NULL;

UPDATE ext_empresas ee
SET empresa_id = ne.empresa_id
FROM ne_empresas ne
WHERE ne.ext_empresa_id = ee.id AND ee.empresa_id IS NULL;

-- 3c. El resto de fondo_empresas (las que ninguna ne_empresas enlazaba) — una maestra propia.
WITH mapeo AS (
  SELECT fe.id AS origen_id, uuid_generate_v4() AS empresa_id, fe.name
  FROM fondo_empresas fe
  WHERE fe.empresa_id IS NULL
),
ins AS (
  INSERT INTO empresas (id, name)
  SELECT empresa_id, name FROM mapeo
)
UPDATE fondo_empresas fe
SET empresa_id = mapeo.empresa_id
FROM mapeo
WHERE fe.id = mapeo.origen_id;

-- 3d. El resto de ext_empresas — una maestra propia.
WITH mapeo AS (
  SELECT ee.id AS origen_id, uuid_generate_v4() AS empresa_id, ee.name
  FROM ext_empresas ee
  WHERE ee.empresa_id IS NULL
),
ins AS (
  INSERT INTO empresas (id, name)
  SELECT empresa_id, name FROM mapeo
)
UPDATE ext_empresas ee
SET empresa_id = mapeo.empresa_id
FROM mapeo
WHERE ee.id = mapeo.origen_id;

-- 3e. contab_empresas (52) — ninguna tenía enlace posible (catálogo verificado sin solape de
-- nombres contra los otros tres), así que todas reciben una maestra propia.
WITH mapeo AS (
  SELECT ce.id AS origen_id, uuid_generate_v4() AS empresa_id, ce.name
  FROM contab_empresas ce
  WHERE ce.empresa_id IS NULL
),
ins AS (
  INSERT INTO empresas (id, name)
  SELECT empresa_id, name FROM mapeo
)
UPDATE contab_empresas ce
SET empresa_id = mapeo.empresa_id
FROM mapeo
WHERE ce.id = mapeo.origen_id;
