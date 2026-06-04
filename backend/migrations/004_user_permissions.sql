-- Migración 004: añadir permissions por usuario para control granular de acceso
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT NULL;
