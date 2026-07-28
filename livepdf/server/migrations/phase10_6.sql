-- ─────────────────────────────────────────────────────────────
-- PHASE 10.6: PDF REDLINING (PROPOSALS FOR REPLACEMENT & DELETION)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS redline_proposals (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id        UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_id         UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name        VARCHAR(255) NOT NULL,
  page_number        INTEGER NOT NULL DEFAULT 1,
  x                  NUMERIC NOT NULL DEFAULT 0,
  y                  NUMERIC NOT NULL DEFAULT 0,
  width              NUMERIC NOT NULL DEFAULT 0,
  height             NUMERIC NOT NULL DEFAULT 0,
  original_text      TEXT NOT NULL,
  proposed_text      TEXT,
  proposal_type      VARCHAR(20) NOT NULL DEFAULT 'replacement', -- 'replacement' or 'deletion'
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',     -- 'pending', 'accepted', 'rejected', 'applied'
  applied_version_id UUID REFERENCES versions(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  decided_at         TIMESTAMPTZ,
  applied_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_redline_proposals_doc ON redline_proposals(document_id);
CREATE INDEX IF NOT EXISTS idx_redline_proposals_version ON redline_proposals(version_id);
CREATE INDEX IF NOT EXISTS idx_redline_proposals_status ON redline_proposals(status);
