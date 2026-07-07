const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function run() {
  let hasPgVector = false;
  try {
    console.log('Checking for pgvector extension...');
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector;');
    hasPgVector = true;
    console.log('✅ pgvector extension is available.');
  } catch (err) {
    console.log('⚠️ pgvector extension is not available. Falling back to REAL[] type and JS-side similarity search.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create embeddings table based on pgvector availability
    if (hasPgVector) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          version_id    UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
          chunk_index   INTEGER NOT NULL,
          chunk_text    TEXT NOT NULL,
          page_number   INTEGER NOT NULL,
          embedding     vector(1536),
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(version_id, chunk_index)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_embeddings_vector
          ON embeddings USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100);
      `);
    } else {
      await client.query(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
          version_id    UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
          chunk_index   INTEGER NOT NULL,
          chunk_text    TEXT NOT NULL,
          page_number   INTEGER NOT NULL,
          embedding     REAL[],
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(version_id, chunk_index)
        );
      `);
    }

    // Common indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_version ON embeddings(version_id);');
    await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_document ON embeddings(document_id);');

    // 2. Create ai_summaries table
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_summaries (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        version_diff_id UUID NOT NULL REFERENCES version_diffs(id) ON DELETE CASCADE,
        summary_text    TEXT NOT NULL,
        model_used      VARCHAR(100),
        prompt_tokens   INTEGER,
        completion_tokens INTEGER,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(version_diff_id)
      );
    `);

    // 3. Create qa_cache table
    await client.query(`
      CREATE TABLE IF NOT EXISTS qa_cache (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
        question_hash   VARCHAR(64) NOT NULL,
        question_text   TEXT NOT NULL,
        answer_text     TEXT NOT NULL,
        page_refs       INTEGER[],
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(version_id, question_hash)
      );
    `);

    await client.query('CREATE INDEX IF NOT EXISTS idx_qa_cache_version ON qa_cache(version_id);');

    await client.query('COMMIT');
    console.log('✅ Migration complete — Phase 7 tables created successfully.');
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
