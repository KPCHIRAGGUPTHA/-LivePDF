const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

// Read secrets if available (Docker secrets in production)
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

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sqlPath = path.join(__dirname, 'patch_reset_fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('Running reset password columns patch migration...');
    await client.query(sql);

    await client.query('COMMIT');
    console.log('✅ Patch migration complete — users table updated successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
