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
        DROP TABLE IF EXISTS password_reset_tokens, token_blacklist, refresh_tokens, audit_log, notifications,
          task_tag_assignment, task_tags, task_comments, task_subtasks,
          tasks, group_members, groups, users CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at CASCADE;
      `);
      console.log('✓ Tables dropped');
    }

    // Tabla de control — registra qué migraciones ya se aplicaron
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrations = fs.readdirSync(__dirname)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .filter((f) => withSeed || f !== '002_seed_data.sql')
      .sort();

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) { console.log(`⚠️  ${file} not found, skipping`); continue; }

      // Seed file always re-runs when --seed is passed (idempotent via ON CONFLICT DO NOTHING)
      const isSeedFile = file === '002_seed_data.sql';
      if (!withReset && !(isSeedFile && withSeed)) {
        const { rows } = await client.query(
          'SELECT 1 FROM schema_migrations WHERE filename = $1', [file]
        );
        if (rows.length > 0) {
          console.log(`⏭  ${file} already applied, skipping`);
          continue;
        }
      }

      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
      // Seed file is always re-run (ON CONFLICT DO NOTHING makes it idempotent) — don't track it
      if (file !== '002_seed_data.sql') {
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]
        );
      }
      console.log(`✓ ${file} done`);
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
