-- Fondo Emprender — mes habilitado para pagos
-- Migración 019
--
-- Los pagos se hacen sobre mes vencido: en julio solo se puede tramitar
-- hasta junio. Antes la columna del mes se generaba automáticamente hasta
-- el mes calendario actual, dejando la columna del mes en curso vacía y
-- confusa. Ahora el límite superior es un valor manual que las jefas
-- habilitan cuando ellas decidan (ver requireFondoAutorizarPagos), en vez
-- de derivarse de la fecha del sistema.
--
-- Tabla singleton (una sola fila, id fijo en 1).
--
-- Valor inicial: mes anterior al actual en el momento de correr esta
-- migración — preserva el comportamiento correcto de hoy (mes vencido)
-- sin necesitar que nadie la toque de inmediato.

CREATE TABLE IF NOT EXISTS fondo_pagos_mes_actual (
  id   SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  anio SMALLINT NOT NULL,
  mes  SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12)
);

INSERT INTO fondo_pagos_mes_actual (id, anio, mes)
SELECT 1,
       EXTRACT(YEAR  FROM (CURRENT_DATE - INTERVAL '1 month'))::smallint,
       EXTRACT(MONTH FROM (CURRENT_DATE - INTERVAL '1 month'))::smallint
WHERE NOT EXISTS (SELECT 1 FROM fondo_pagos_mes_actual WHERE id = 1);
