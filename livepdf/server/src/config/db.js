const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Read secret files if process.env.DB_USER_FILE or DB_PASSWORD_FILE exists
['DB_USER', 'DB_PASSWORD'].forEach((key) => {
  const fileKey = `${key}_FILE`;
  if (process.env[fileKey] && fs.existsSync(process.env[fileKey])) {
    try {
      process.env[key] = fs.readFileSync(process.env[fileKey], 'utf8').trim();
    } catch (err) {
      console.error(`Error reading secret from ${process.env[fileKey]}:`, err);
    }
  }
});

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'livepdf',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  connectionTimeoutMillis: 5000,
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
});

module.exports = pool;
