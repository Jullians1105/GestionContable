-- Empresas Externas — Utilidad/Pérdida mensual por empresa
-- Migración 057
--
-- Un dato más por empresa × mes (igual granularidad que el resto del
-- checklist), así que va colgado de ext_checklist_meses en vez de una tabla
-- aparte — esa fila ya existe una vez por empresa/mes y se crea sola la
-- primera vez que se edita algo ese mes (ver extChecklistController.js
-- updateChecklistItem). resultado_tipo y resultado_valor van juntos (una
-- empresa solo puede tener uno de los dos a la vez, nunca ambos, por eso no
-- son dos columnas booleanas independientes) y ambos nulos por defecto —
-- "sin dato" hasta que alguien lo cargue, no un 0 por defecto que se
-- confundiría con un resultado real de $0.

ALTER TABLE ext_checklist_meses
  ADD COLUMN resultado_tipo  VARCHAR(10) CHECK (resultado_tipo IN ('utilidad', 'perdida')),
  ADD COLUMN resultado_valor NUMERIC(14, 2);
