-- Empresas Externas / Contabilidad — vigencia por mes de cada EMPRESA
-- Migración 060
--
-- Mismo patrón que 059_empresa_vigencia_hasta.sql (Fondo Emprender / Nómina
-- Electrónica), extendido a los otros dos módulos con catálogo de empresas.
-- Migración puramente aditiva — NULL en ambos campos (el caso de toda
-- empresa existente hoy) significa "sin restricción", igual que se ve ahora.
ALTER TABLE ext_empresas
  ADD COLUMN IF NOT EXISTS vigente_hasta_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_mes  SMALLINT;

ALTER TABLE ext_empresas
  ADD CONSTRAINT ext_empresas_vigente_hasta_mes_check
    CHECK (vigente_hasta_mes IS NULL OR vigente_hasta_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT ext_empresas_vigente_hasta_pair_check
    CHECK ((vigente_hasta_anio IS NULL) = (vigente_hasta_mes IS NULL));

ALTER TABLE contab_empresas
  ADD COLUMN IF NOT EXISTS vigente_hasta_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_mes  SMALLINT;

ALTER TABLE contab_empresas
  ADD CONSTRAINT contab_empresas_vigente_hasta_mes_check
    CHECK (vigente_hasta_mes IS NULL OR vigente_hasta_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT contab_empresas_vigente_hasta_pair_check
    CHECK ((vigente_hasta_anio IS NULL) = (vigente_hasta_mes IS NULL));
