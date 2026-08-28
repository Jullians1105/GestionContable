-- Agrega país (texto + código DIAN de 3 dígitos) a `terceros`. Necesario para el formato 1001
-- (columna PAIS) — hasta ahora se asumía Colombia siempre, pero sí puede haber terceros del
-- exterior en las facturas.
-- Migración 044

ALTER TABLE terceros
  ADD COLUMN IF NOT EXISTS pais            TEXT,
  ADD COLUMN IF NOT EXISTS codigo_pais_dian CHAR(3);
