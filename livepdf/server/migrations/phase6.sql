CREATE TABLE IF NOT EXISTS version_diffs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  old_version_id  UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  new_version_id  UUID NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  change_map      JSONB NOT NULL,     -- full list of change objects
  total_changes   INTEGER DEFAULT 0,
  added_count     INTEGER DEFAULT 0,
  removed_count   INTEGER DEFAULT 0,
  modified_count  INTEGER DEFAULT 0,
  computed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(old_version_id, new_version_id)
);

CREATE INDEX IF NOT EXISTS idx_vdiffs_document ON version_diffs(document_id);
CREATE INDEX IF NOT EXISTS idx_vdiffs_new_version ON version_diffs(new_version_id);
