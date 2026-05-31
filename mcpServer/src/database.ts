import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.join(__dirname, '..', 'data', 'gestor_tareas.db');
const db = new Database(dbPath);

export function query(sql: string, params?: any[]) {
    try {
        const stmt = db.prepare(sql);
        if (params) {
            return { rows: stmt.all(...params) };
        }
        return { rows: stmt.all() };
    } catch (error) {
        throw error;
    }
}

export function run(sql: string, params?: any[]) {
    try {
        const stmt = db.prepare(sql);
        if (params) {
            return stmt.run(...params);
        }
        return stmt.run();
    } catch (error) {
        throw error;
    }
}

export function closeDb() {
    db.close();
}

db.exec(`
    CREATE TABLE IF NOT EXISTS tareas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descripcion TEXT,
        estado TEXT DEFAULT 'pendiente',
        prioridad TEXT DEFAULT 'media',
        asignado_a TEXT,
        fecha_limite TEXT,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
        fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS empleados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        activo BOOLEAN DEFAULT 1,
        fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

try {
    db.exec(`ALTER TABLE tareas ADD COLUMN extras TEXT DEFAULT '{}'`);
} catch {
    // columna ya existe
}

const checkEmps = db.prepare('SELECT COUNT(*) as count FROM empleados').get() as { count: number };
if (checkEmps.count === 0) {
    db.prepare('INSERT INTO empleados (nombre, email) VALUES (?, ?)').run('Juan García', 'juan@empresa.com');
    db.prepare('INSERT INTO empleados (nombre, email) VALUES (?, ?)').run('María López', 'maria@empresa.com');
    db.prepare('INSERT INTO empleados (nombre, email) VALUES (?, ?)').run('Carlos Rodríguez', 'carlos@empresa.com');
}
