import { Pool, QueryResult } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'gestorTareasOficina',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
});

export async function query(text: string, params?: any[]): Promise<QueryResult> {
    return pool.query(text, params);
}

export async function closePool(): Promise<void> {
    await pool.end();
}