const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000, // Timeout connection attempt after 5 seconds instead of hanging
  idleTimeoutMillis: 30000,
  max: 20,
});

pool.on('connect', () => {
  if (process.env.NODE_ENV !== 'test') {
    console.log('Connected to PostgreSQL');
  }
});

pool.on('error', (err) => {
  console.error('PostgreSQL idle client error:', err.message);
  // Log error without crashing process on transient idle connection drops
});

module.exports = pool;
