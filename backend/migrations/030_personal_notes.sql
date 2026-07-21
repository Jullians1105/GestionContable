-- Notas personales tipo Notion — formato libre por bloques
-- Migración 030
--
-- Igual que personal_tasks (migración 029): espacio 100% privado, sin
-- asignación ni vínculo con grupos, siempre filtrado por user_id tanto acá
-- (ON DELETE CASCADE) como en el controller. El contenido se guarda como
-- JSONB en el formato nativo de bloques del editor (BlockNote en el
-- frontend) — no como HTML ni markdown, para poder re-renderizar/editar los
-- bloques sin parsear texto.

CREATE TABLE IF NOT EXISTS personal_notes (
  id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      VARCHAR(255) NOT NULL DEFAULT '',
  content    JSONB        NOT NULL DEFAULT '[]'::jsonb,
  position   INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_notes_user ON personal_notes(user_id);

CREATE TRIGGER personal_notes_updated_at
  BEFORE UPDATE ON personal_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
