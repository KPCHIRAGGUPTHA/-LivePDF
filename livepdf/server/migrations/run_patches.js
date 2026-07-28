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
    const patchFiles = [
      'schema.sql',
      'phase3.sql',
      'phase6.sql',
      'phase7.sql',
      'phase8.sql',
      'phase9.sql',
      'phase10.sql',
      'phase10_6.sql',
      'patch_reset_fields.sql',
    ];

    for (const file of patchFiles) {
      const sqlPath = path.join(__dirname, file);
      if (fs.existsSync(sqlPath)) {
        console.log(`Running migration: ${file}...`);
        const sql = fs.readFileSync(sqlPath, 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('COMMIT');
          console.log(`  ✓ ${file} applied successfully.`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.warn(`  ⚠️ Warning running ${file}: ${err.message}`);
        }
      }
    }

    console.log('✅ Migration patches execution complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

run();
