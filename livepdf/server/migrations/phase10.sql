-- ─────────────────────────────────────────────────────────────
-- PHASE 10: COMMENTS & DISCUSSION THREADS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id        UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name       VARCHAR(255) NOT NULL,
  page_number       INTEGER NOT NULL DEFAULT 1,
  x                 NUMERIC NOT NULL DEFAULT 0,
  y                 NUMERIC NOT NULL DEFAULT 0,
  width             NUMERIC NOT NULL DEFAULT 0,
  height            NUMERIC NOT NULL DEFAULT 0,
  content           TEXT NOT NULL,
  parent_comment_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  is_resolved       BOOLEAN DEFAULT FALSE,
  is_deleted        BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id);
CREATE INDEX IF NOT EXISTS idx_comments_version ON comments(version_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_comment_id);

-- ── Allow Comments Toggle for Share Links ────────────────────
ALTER TABLE share_links ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN DEFAULT TRUE;

-- ── Approval Workflow Columns for Documents ──────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approval_status VARCHAR(50) DEFAULT 'Draft';

-- ─────────────────────────────────────────────────────────────
-- APPROVAL WORKFLOW REVIEWS TABLE
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_approvals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id      UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  reviewer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'changes_requested'
  feedback        TEXT,
  round           INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, version_id, reviewer_id, round)
);

CREATE INDEX IF NOT EXISTS idx_doc_approvals_doc ON document_approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_approvals_reviewer ON document_approvals(reviewer_id);
