-- Nómina Electrónica — separar "ya se puede presentar" del estado
-- Migración 048
--
-- El estado real es: por defecto la empresa está sin marcar (blanco/sin
-- color) — nadie ha avisado nada todavía. Cuando avisan que ya se puede
-- presentar, se marca en rojo, pero SIGUE pendiente de presentar (no es un
-- estado nuevo, es un aviso encima de "pendiente"). Mismo patrón que
-- fondo_pagos.autorizado (migración 018): un flag independiente del estado,
-- no un cuarto valor del CHECK — así "presentada" y "no_aplica" siguen
-- siendo excluyentes con esto sin tener que limpiar el flag al cambiar de
-- estado.
--
-- Color final en el frontend (ver src/data/nominaElectronica.js):
--   estado='presentada'                        -> verde
--   estado='no_aplica'                         -> gris
--   estado='pendiente' AND autorizada=true      -> rojo (ya se puede, falta presentar)
--   estado='pendiente' AND autorizada=false     -> sin color (default)

ALTER TABLE ne_meses ADD COLUMN autorizada BOOLEAN NOT NULL DEFAULT false;
