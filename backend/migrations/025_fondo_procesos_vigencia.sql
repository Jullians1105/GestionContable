-- Fondo Emprender — vigencia por mes de cada proceso del Seguimiento Mensual
-- Migración 025
--
-- Hasta ahora el catálogo de procesos era el mismo todos los meses. El
-- equipo pidió poder tener una "plantilla" que cambie con el tiempo: una
-- columna que solo existió en junio (ej. una prima), o una nueva que arranca
-- desde julio en adelante, sin tener que mostrarla retroactivamente en meses
-- ya cerrados. Migración puramente aditiva — NULL en ambos extremos (el
-- caso de todo proceso existente hoy) significa "sin restricción", igual
-- que se ve ahora.
ALTER TABLE fondo_procesos
  ADD COLUMN IF NOT EXISTS vigente_desde_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_desde_mes  SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_anio SMALLINT,
  ADD COLUMN IF NOT EXISTS vigente_hasta_mes  SMALLINT;

ALTER TABLE fondo_procesos
  ADD CONSTRAINT fondo_procesos_vigente_desde_mes_check
    CHECK (vigente_desde_mes IS NULL OR vigente_desde_mes BETWEEN 1 AND 12),
  ADD CONSTRAINT fondo_procesos_vigente_hasta_mes_check
    CHECK (vigente_hasta_mes IS NULL OR vigente_hasta_mes BETWEEN 1 AND 12),
  -- Ambos lados de un rango van de la mano: no tiene sentido guardar el año
  -- sin el mes (o viceversa) para ninguno de los dos extremos.
  ADD CONSTRAINT fondo_procesos_vigente_desde_pair_check
    CHECK ((vigente_desde_anio IS NULL) = (vigente_desde_mes IS NULL)),
  ADD CONSTRAINT fondo_procesos_vigente_hasta_pair_check
    CHECK ((vigente_hasta_anio IS NULL) = (vigente_hasta_mes IS NULL));
