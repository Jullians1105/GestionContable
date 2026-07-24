-- Módulo DIAN — guardar el archivo original subido (normalizado, sin transformar datos)
-- para reutilizarlo tal cual al exportar, en vez de reconstruir la hoja desde JSON.
-- Migración 034

ALTER TABLE calculo_borradores ADD COLUMN IF NOT EXISTS archivo_original BYTEA;
