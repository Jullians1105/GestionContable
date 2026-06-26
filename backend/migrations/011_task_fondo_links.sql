-- Vinculación entre tareas del gestor y elementos de Fondo Emprender
-- Migración 011
--
-- Una tarea puede vincularse a un macroproceso (mp1-mp4, mp6, mp7) o a una
-- celda del checklist mensual (empresa × proceso × mes). Al completarse la
-- tarea el backend actualiza automáticamente el ítem de Fondo Emprender a 'done'.
-- Relación 1:1: una tarea tiene como máximo un vínculo (UNIQUE task_id).

CREATE TABLE IF NOT EXISTS task_fondo_links (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  empresa_id  UUID        NOT NULL REFERENCES fondo_empresas(id) ON DELETE CASCADE,
  link_type   VARCHAR(20) NOT NULL
              CHECK (link_type IN ('macroproceso', 'checklist')),

  -- Para link_type = 'macroproceso'
  macro_id    VARCHAR(10)
              CHECK (macro_id IS NULL OR macro_id IN ('mp1','mp2','mp3','mp4','mp6','mp7')),

  -- Para link_type = 'checklist'
  proceso_id  UUID        REFERENCES fondo_procesos(id) ON DELETE RESTRICT,
  anio        SMALLINT    CHECK (anio IS NULL OR (anio >= 2000 AND anio <= 2100)),
  mes         SMALLINT    CHECK (mes  IS NULL OR (mes  BETWEEN 1 AND 12)),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (task_id)
);

CREATE INDEX idx_task_fondo_links_empresa ON task_fondo_links(empresa_id);

CREATE TRIGGER task_fondo_links_updated_at
  BEFORE UPDATE ON task_fondo_links
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
