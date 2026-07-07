-- Enable pgvector if not already done
CREATE EXTENSION IF NOT EXISTS vector;

-- ─────────────────────────────────────────────────────────────
-- EMBEDDINGS — one row per text chunk per document version
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embeddings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id    UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,       -- position within the document
  chunk_text    TEXT NOT NULL,          -- the raw text of this chunk
  page_number   INTEGER NOT NULL,       -- which page this chunk came from (0-indexed)
  embedding     vector(1536),           -- OpenAI text-embedding-3-small output
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_id, chunk_index)
);

-- ivfflat index for fast approximate nearest-neighbour search
-- lists = 100 as a starting point
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_embeddings_version
  ON embeddings(version_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_document
  ON embeddings(document_id);

-- ─────────────────────────────────────────────────────────────
-- AI SUMMARIES — cached Claude responses for change summaries
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- QA CACHE — cached Q&A answers to avoid duplicate API calls
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_cache (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  question_hash   VARCHAR(64) NOT NULL,   -- SHA-256 of question + chunk IDs
  question_text   TEXT NOT NULL,
  answer_text     TEXT NOT NULL,
  page_refs       INTEGER[],              -- pages referenced in the answer
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version_id, question_hash)
);

CREATE INDEX IF NOT EXISTS idx_qa_cache_version ON qa_cache(version_id);
