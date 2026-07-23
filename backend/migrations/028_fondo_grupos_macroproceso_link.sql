-- Igual que fondo_procesos.macroproceso_id (migración 027), pero a nivel de
-- GRUPO completo: todos los procesos del grupo NOMINA alimentan mp2, todos
-- los del grupo CONTABILIDAD alimentan mp5. Se ancla por id del grupo, no
-- por nombre, por la misma razón (el grupo se puede renombrar desde
-- "Editar estructura").
--
-- mp5 no tiene fila propia en fondo_detalle_macroprocesos (es derivado desde
-- siempre, ver fondo_checklist_meses.confirmed), así que el CHECK acá es más
-- permisivo que el de fondo_procesos.macroproceso_id — sí incluye 'mp5'.

ALTER TABLE fondo_proceso_grupos
  ADD COLUMN macroproceso_id VARCHAR(10)
  CHECK (macroproceso_id IS NULL OR macroproceso_id IN ('mp1','mp2','mp3','mp4','mp5','mp6','mp7'));

UPDATE fondo_proceso_grupos SET macroproceso_id = 'mp2' WHERE name = 'NOMINA';
UPDATE fondo_proceso_grupos SET macroproceso_id = 'mp5' WHERE name = 'CONTABILIDAD';
