-- Vínculo estable entre un proceso del Seguimiento Mensual y el macroproceso
-- que deriva su estado de él (por ahora solo "nomina electronica" → mp3).
-- Se guarda por id, no por nombre: los procesos se pueden renombrar desde la
-- UI ("Editar estructura") y un match por texto se rompería en silencio.

ALTER TABLE fondo_procesos
  ADD COLUMN macroproceso_id VARCHAR(10)
  CHECK (macroproceso_id IS NULL OR macroproceso_id IN ('mp1','mp2','mp3','mp4','mp6','mp7'));

-- Hay más de un registro con nombres parecidos ("Nómina electrónica" retirado
-- vs "nomina electronica" vigente, de una renombrada histórica) — se ancla
-- solo al activo para no enlazar por error el que ya no se usa.
UPDATE fondo_procesos
SET macroproceso_id = 'mp3'
WHERE lower(name) = 'nomina electronica' AND activo = true;
