-- Migración 003: añadir extra_data a notificaciones para almacenar commentId y otros metadatos
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS extra_data JSONB DEFAULT '{}';
