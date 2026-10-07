-- Fondo Emprender / Empresas Externas / Nómina Electrónica — "vigente desde" por mes de cada EMPRESA
-- Migración 068
--
-- Contraparte de 059/060 (vigente_hasta_*). Hasta ahora una empresa recién habilitada en un
-- módulo aparecía con pendientes en TODOS los meses anteriores a su ingreso, porque los
-- seguimientos mensuales sintetizan "pendiente" para cualquier mes sin fila. Con este límite
-- opcional la empresa solo aparece desde ese mes (inclusive) en adelante.
--
-- Nunca borra filas: lo ya guardado en meses anteriores queda intacto, solo se oculta. Migración
-- puramente aditiva — NULL en ambos campos (toda empresa existente hoy y toda empresa nueva)
-- significa "desde siempre", igual que se ve ahora. Contabilidad no lo necesita: sus períodos
-- (contab_periodos) solo existen para los meses que de verdad se cargaron.
ALTER TABLE fondo_empresas
  ADD COLUMN IF NOT EXISTS vigente_desde_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_desde_mes  SMALLINT;

ALTER TABLE fondo_empresas
  ADD CONSTRAINT fondo_empresas_vigente_desde_mes_check
    CHECK (vigente_desde_mes IS NULL OR vigente_desde_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT fondo_empresas_vigente_desde_pair_check
    CHECK ((vigente_desde_anio IS NULL) = (vigente_desde_mes IS NULL));

ALTER TABLE ext_empresas
  ADD COLUMN IF NOT EXISTS vigente_desde_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_desde_mes  SMALLINT;

ALTER TABLE ext_empresas
  ADD CONSTRAINT ext_empresas_vigente_desde_mes_check
    CHECK (vigente_desde_mes IS NULL OR vigente_desde_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT ext_empresas_vigente_desde_pair_check
    CHECK ((vigente_desde_anio IS NULL) = (vigente_desde_mes IS NULL));

ALTER TABLE ne_empresas
  ADD COLUMN IF NOT EXISTS vigente_desde_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_desde_mes  SMALLINT;

ALTER TABLE ne_empresas
  ADD CONSTRAINT ne_empresas_vigente_desde_mes_check
    CHECK (vigente_desde_mes IS NULL OR vigente_desde_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT ne_empresas_vigente_desde_pair_check
    CHECK ((vigente_desde_anio IS NULL) = (vigente_desde_mes IS NULL));
