ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurrence    JSONB;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS template_id   UUID REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_recurring
  ON tasks(is_recurring) WHERE is_recurring = true;

CREATE INDEX IF NOT EXISTS idx_tasks_template_id
  ON tasks(template_id) WHERE template_id IS NOT NULL;
