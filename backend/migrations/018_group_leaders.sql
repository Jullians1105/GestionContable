-- Migración 018: soporte para múltiples líderes por grupo.
-- Aditiva: no toca datos existentes ni la columna groups.leader_id (queda como metadato heredado).
ALTER TABLE group_members ADD COLUMN IF NOT EXISTS is_leader BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_group_members_leader ON group_members(group_id) WHERE is_leader = true;
