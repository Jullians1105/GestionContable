-- Elimina las etiquetas de muestra del seed (bug, feature, urgente, documentación).
-- Las asignaciones se eliminan en cascada por ON DELETE CASCADE en task_tag_assignment.
DELETE FROM task_tags
WHERE id IN (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);
