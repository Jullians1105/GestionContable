-- Vínculo estable (por id, vía macroproceso_id) entre los procesos "Informe
-- de producción" / "Informe de Ventas" de Seguimiento Mensual y las dos
-- mitades del macroproceso mp7 ("Producción y ventas") en la ficha de
-- empresa — mismo patrón que mp3/Nómina electrónica: se vincula un proceso
-- INDIVIDUAL (no un grupo entero), porque esos dos ya son procesos sueltos,
-- no viven dentro de un grupo.
--
-- El UPDATE de abajo solo vincula procesos que YA EXISTEN al momento de
-- correr esta migración, por nombre — si en algún ambiente esos procesos se
-- crean o se renombran DESPUÉS, hay que volver a correr el UPDATE a mano ahí
-- (mismo problema que ya pasó con 028_fondo_grupos_macroproceso_link.sql en
-- producción: los grupos se crearon después de que esa migración corriera,
-- así que el UPDATE no encontró nada que actualizar).

ALTER TABLE fondo_procesos
  DROP CONSTRAINT fondo_procesos_macroproceso_id_check;

ALTER TABLE fondo_procesos
  ADD CONSTRAINT fondo_procesos_macroproceso_id_check
  CHECK (macroproceso_id IS NULL OR macroproceso_id IN ('mp1','mp2','mp3','mp4','mp6','mp7','mp7p','mp7v'));

UPDATE fondo_procesos SET macroproceso_id = 'mp7p' WHERE lower(name) = 'informe de producción' AND activo = true;
UPDATE fondo_procesos SET macroproceso_id = 'mp7v' WHERE lower(name) = 'informe de ventas'    AND activo = true;
