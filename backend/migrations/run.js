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
        DROP TABLE IF EXISTS token_blacklist, refresh_tokens, audit_log, notifications,
          task_tag_assignment, task_tags, task_comments, task_subtasks,
          tasks, group_members, groups, users CASCADE;
        DROP FUNCTION IF EXISTS update_updated_at CASCADE;
      `);
      console.log('✓ Tables dropped');
    }

    const migrations = ['001_initial_schema.sql'];
    if (withSeed) migrations.push('002_seed_data.sql');

    for (const file of migrations) {
      const filePath = path.join(__dirname, file);
      if (!fs.existsSync(filePath)) { console.log(`⚠️  ${file} not found, skipping`); continue; }
      console.log(`Running migration: ${file}...`);
      const sql = fs.readFileSync(filePath, 'utf8');
      await client.query(sql);
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
