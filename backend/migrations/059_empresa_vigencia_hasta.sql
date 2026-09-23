-- Fondo Emprender / Nómina Electrónica — vigencia por mes de cada EMPRESA
-- Migración 059
--
-- Mismo patrón que 025_fondo_procesos_vigencia.sql, pero a nivel de empresa
-- en vez de proceso: una empresa que deja el programa (o el servicio de
-- nómina electrónica) no debe seguir apareciendo en los seguimientos de los
-- meses siguientes, pero su histórico (meses anteriores ya guardados) debe
-- quedar intacto — así que esto NUNCA borra filas, solo agrega un límite
-- opcional. Migración puramente aditiva — NULL en ambos campos (el caso de
-- toda empresa existente hoy) significa "sin restricción", igual que se ve
-- ahora. Solo "hasta": a diferencia de los procesos, acá no hace falta un
-- "desde" — una empresa nueva simplemente se crea cuando arranca.
ALTER TABLE fondo_empresas
  ADD COLUMN IF NOT EXISTS vigente_hasta_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_mes  SMALLINT;

ALTER TABLE fondo_empresas
  ADD CONSTRAINT fondo_empresas_vigente_hasta_mes_check
    CHECK (vigente_hasta_mes IS NULL OR vigente_hasta_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT fondo_empresas_vigente_hasta_pair_check
    CHECK ((vigente_hasta_anio IS NULL) = (vigente_hasta_mes IS NULL));

ALTER TABLE ne_empresas
  ADD COLUMN IF NOT EXISTS vigente_hasta_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_mes  SMALLINT;

ALTER TABLE ne_empresas
  ADD CONSTRAINT ne_empresas_vigente_hasta_mes_check
    CHECK (vigente_hasta_mes IS NULL OR vigente_hasta_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT ne_empresas_vigente_hasta_pair_check
    CHECK ((vigente_hasta_anio IS NULL) = (vigente_hasta_mes IS NULL));
