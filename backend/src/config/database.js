const { Pool } = require('pg');
const env = require('./env');

const config = env.DATABASE_URL
  ? { connectionString: env.DATABASE_URL, ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }
  : {
      host: env.DB_HOST,
      port: env.DB_PORT,
      database: env.NODE_ENV === 'test' ? env.DB_TEST_NAME : env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    };

const pool = new Pool({ ...config, max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 });

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};

module.exports = db;
