-- Estado individual por persona asignada a una tarea.
-- Aditiva: no toca tasks.assigned_to (se mantiene como alias del asignado principal).
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);

-- Backfill: una fila por tarea existente con asignado, heredando su status actual.
INSERT INTO task_assignees (task_id, user_id, status, completed_at)
SELECT id, assigned_to, status,
       CASE WHEN status = 'completed' THEN updated_at ELSE NULL END
FROM tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;
