import { query, run } from './database';
import { CreateTaskInput, UpdateTaskInput, FilterTasksInput } from './schemas';

export function createTask(input: CreateTaskInput) {
    const { titulo, descripcion, prioridad, asignado_a, fecha_limite } = input;

    const result = run(
        `INSERT INTO tareas (titulo, descripcion, prioridad, asignado_a, fecha_limite)
         VALUES (?, ?, ?, ?, ?)`,
        [titulo, descripcion || null, prioridad, asignado_a || null, fecha_limite || null]
    );

    return query('SELECT * FROM tareas WHERE id = ?', [result.lastInsertRowid]).rows[0];
}

export function getTasks(filters?: FilterTasksInput) {
    let sql = 'SELECT * FROM tareas WHERE 1=1';
    const params: any[] = [];

    if (filters?.estado) {
        sql += ' AND estado = ?';
        params.push(filters.estado);
    }

    if (filters?.prioridad) {
        sql += ' AND prioridad = ?';
        params.push(filters.prioridad);
    }

    if (filters?.asignado_a) {
        sql += ' AND asignado_a = ?';
        params.push(filters.asignado_a);
    }

    sql += ' ORDER BY fecha_creacion DESC';

    return query(sql, params.length ? params : undefined).rows;
}

export function getTaskById(id: number) {
    return query('SELECT * FROM tareas WHERE id = ?', [id]).rows[0];
}

export function updateTask(input: UpdateTaskInput) {
    const { id, titulo, descripcion, estado, prioridad, asignado_a, fecha_limite } = input;

    run(
        `UPDATE tareas
         SET titulo = ?, descripcion = ?, estado = ?, prioridad = ?, asignado_a = ?, fecha_limite = ?, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [titulo, descripcion || null, estado || 'pendiente', prioridad, asignado_a || null, fecha_limite || null, id]
    );

    return query('SELECT * FROM tareas WHERE id = ?', [id]).rows[0];
}

export function deleteTask(id: number) {
    run('DELETE FROM tareas WHERE id = ?', [id]);
    return { success: true, id };
}

export function getEmployees() {
    return query('SELECT id, nombre, email FROM empleados WHERE activo = 1').rows;
}

export function getTaskStats() {
    return query(`
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN estado = 'completada' THEN 1 END) as completadas,
            COUNT(CASE WHEN estado = 'en_progreso' THEN 1 END) as en_progreso,
            COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes
        FROM tareas
    `).rows[0];
}
