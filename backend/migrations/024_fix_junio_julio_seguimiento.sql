-- Corrige una confusión operativa puntual: en julio de 2026 el equipo llenó
-- el Seguimiento Mensual (checklist, macroprocesos, impuestos) bajo el mes
-- de julio, cuando en realidad correspondía a junio (los procesos contables
-- son de mes vencido: en julio se gestiona el cierre de junio, no el de
-- julio). Lo que había quedado en junio por la misma confusión se descarta
-- y se traslada julio → junio. Corrección puntual y no repetible (fechas
-- fijas), no un patrón para reutilizar.

-- fondo_checklist_meses — fondo_checklist_items sigue vía mes_id (FK), no
-- requiere tocarse aparte.
DELETE FROM fondo_checklist_meses WHERE anio = 2026 AND mes = 6;
UPDATE fondo_checklist_meses SET mes = 6 WHERE anio = 2026 AND mes = 7;

-- fondo_detalle_macroprocesos (mp1 Facturación, mp2 Nómina, mp3 Nómina
-- electrónica, mp7 Producción y ventas — mp4 se deriva de fondo_pagos y
-- mp5/mp6 se derivan de las tablas de arriba; no tienen fila propia que
-- mover, siguen automáticamente).
DELETE FROM fondo_detalle_macroprocesos WHERE anio = 2026 AND mes = 6;
UPDATE fondo_detalle_macroprocesos SET mes = 6 WHERE anio = 2026 AND mes = 7;

-- fondo_impuestos_items (checklist de impuestos de mp6/Información tributaria)
DELETE FROM fondo_impuestos_items WHERE anio = 2026 AND mes = 6;
UPDATE fondo_impuestos_items SET mes = 6 WHERE anio = 2026 AND mes = 7;
