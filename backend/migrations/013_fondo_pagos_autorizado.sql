-- Fondo Emprender — autorización manual de envío de pagos
-- Migración 013
--
-- Antes, todo pago en estado 'pendiente' se veía igual sin importar si el
-- jefe ya dio luz verde para tramitarlo con la fiduciaria. Este campo es
-- independiente de `estado`: separa "en qué va con la fiduciaria" de
-- "¿el equipo contable tiene permiso interno para empezar a enviarlo?".
--
-- Default true: hoy nada bloquea el envío, así que el default preserva el
-- comportamiento actual. Las jefas solo desmarcan los casos puntuales que
-- deban retenerse hasta nueva orden.

ALTER TABLE fondo_pagos
  ADD COLUMN IF NOT EXISTS autorizado BOOLEAN NOT NULL DEFAULT true;
