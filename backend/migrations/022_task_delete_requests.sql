-- Solicitudes de eliminación de tarea: un usuario sin permiso de borrado directo (member)
-- pide eliminar una tarea con un motivo; admin o líder del grupo la aprueba/rechaza.
CREATE TABLE IF NOT EXISTS task_delete_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id      UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delete_requests_task ON task_delete_requests(task_id);

-- Evita solicitudes duplicadas: solo una pendiente por tarea a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_delete_requests_pending_unique
  ON task_delete_requests(task_id) WHERE status = 'pending';
