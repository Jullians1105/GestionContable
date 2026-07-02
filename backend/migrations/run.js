#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'taskflow',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const args = process.argv.slice(2);
const withSeed = args.includes('--seed');
const withReset = args.includes('--reset');

async function run() {
  const client = await pool.connect();
  try {
    if (withReset) {
      console.log('⚠️  Resetting database...');
      await client.query(`
        DROP TABLE IF EXISTS schema_migrations CASCADE;
        DROP TABLE IF EXISTS password_reset_tokens, token_blacklist, refresh_tokens, audit_log, notifications,
          task_tag_assignment, task_tags, task_comments, task_subtasks,
          tasks, group_members, groups, users CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at CASCADE;
      `);
      console.log('✓ Tables dropped');
    }

    // Ensure tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Compatibilidad: renombrar columna 'version' → 'filename' si existe con ese nombre
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'schema_migrations' AND column_name = 'version'
        ) THEN
          ALTER TABLE schema_migrations RENAME COLUMN version TO filename;
        END IF;
      END $$;
    `);

    // Collect all candidate migration files (sorted)
    const allMigrationFiles = fs.readdirSync(__dirname)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort();

    const migrations = allMigrationFiles
      .filter((f) => withSeed || f !== '002_seed_data.sql');

    // Backfill: if schema_migrations is empty and users table already exists,
    // mark all current .sql files as applied without running them
    const { rows: existingRows } = await client.query(
      'SELECT COUNT(*) AS cnt FROM schema_migrations'
    );
    if (Number(existingRows[0].cnt) === 0) {
      const { rows: usersCheck } = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
      `);
      if (usersCheck.length > 0) {
        console.log('↷ Base existente detectada — registrando migraciones previas sin re-ejecutarlas...');
        for (const file of allMigrationFiles) {
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
          console.log(`  ✓ registrada: ${file}`);
        }
      }
    }

    // Run pending migrations
    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  ${file} not found, skipping`);
        continue;
      }

      const { rows: applied } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (applied.length > 0) {
        console.log(`↷ ${file} ya aplicada, omitiendo`);
        continue;
      }

      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✓ ${file} done`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('\n✅ Migrations completed successfully');
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
