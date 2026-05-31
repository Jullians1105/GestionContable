import { query } from './database';
import { CreateTaskInput, UpdateTaskInput, FilterTasksInput } from './schemas';

export async function createTask(input: CreateTaskInput) {
    const { titulo, descripcion, prioridad, asignado_a, fecha_limite } = input;

    const result = await query(
        `INSERT INTO tareas (titulo, descripcion, prioridad, asignado_a, fecha_limite)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [titulo, descripcion || null, prioridad, asignado_a || null, fecha_limite || null]
    );

    return result.rows[0];
}

export async function getTasks(filters?: FilterTasksInput) {
    let sql = 'SELECT * FROM tareas WHERE 1=1';
    const params: any[] = [];

    if (filters?.estado) {
        sql += ` AND estado = $${params.length + 1}`;
        params.push(filters.estado);
    }

    if (filters?.prioridad) {
        sql += ` AND prioridad = $${params.length + 1}`;
        params.push(filters.prioridad);
    }

    if (filters?.asignado_a) {
        sql += ` AND asignado_a = $${params.length + 1}`;
        params.push(filters.asignado_a);
    }

    sql += ' ORDER BY fecha_creacion DESC';

    const result = await query(sql, params);
    return result.rows;
}

export async function getTaskById(id: number) {
    const result = await query('SELECT * FROM tareas WHERE id = $1', [id]);
    return result.rows[0];
}

export async function updateTask(input: UpdateTaskInput) {
    const { id, titulo, descripcion, estado, prioridad, asignado_a, fecha_limite } = input;

    const result = await query(
        `UPDATE tareas
         SET titulo = $1, descripcion = $2, estado = $3, prioridad = $4, asignado_a = $5, fecha_limite = $6, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $7 RETURNING *`,
        [titulo, descripcion || null, estado || 'pendiente', prioridad, asignado_a || null, fecha_limite || null, id]
    );

    return result.rows[0];
}

export async function deleteTask(id: number) {
    await query('DELETE FROM tareas WHERE id = $1', [id]);
    return { success: true, id };
}

export async function getEmployees() {
    const result = await query('SELECT id, nombre, email FROM empleados WHERE activo = true');
    return result.rows;
}

export async function getTaskStats() {
    const result = await query(`
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN estado = 'completada' THEN 1 END) as completadas,
            COUNT(CASE WHEN estado = 'en_progreso' THEN 1 END) as en_progreso,
            COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pendientes
        FROM tareas
    `);
    return result.rows[0];
}
