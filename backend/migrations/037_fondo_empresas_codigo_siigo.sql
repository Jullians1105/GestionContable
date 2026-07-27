-- Fondo Emprender — código de la empresa en Siigo
-- Migración 037
--
-- Cada empresa tiene un código propio dentro de Siigo (el software contable);
-- se muestra como primera columna del Seguimiento Mensual para poder cruzar
-- la grilla contra Siigo sin buscar por nombre. NULL en todas las empresas
-- existentes: el dato real lo completa el admin a mano desde la UI.

ALTER TABLE fondo_empresas
  ADD COLUMN IF NOT EXISTS codigo_siigo VARCHAR(20);
