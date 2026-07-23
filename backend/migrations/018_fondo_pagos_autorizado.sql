-- Fondo Emprender — autorización manual de envío de pagos
-- Migración 013
--
-- Antes, todo pago en estado 'pendiente' se veía igual sin importar si el
-- jefe ya dio luz verde para tramitarlo con la fiduciaria. Este campo es
-- independiente de `estado`: separa "en qué va con la fiduciaria" de
-- "¿el equipo contable tiene permiso interno para empezar a enviarlo?".
--
-- Default false: todo pendiente nace bloqueado hasta que una jefa lo
-- autorice explícitamente (decisión acordada — el default anterior de
-- true se descartó porque no había forma de verificar que quedara
-- realmente bloqueado hasta la autorización).

ALTER TABLE fondo_pagos
  ADD COLUMN IF NOT EXISTS autorizado BOOLEAN NOT NULL DEFAULT false;
