-- Run this file against your PostgreSQL database:
--   psql -U postgres -d livepdf -f phase3.sql

CREATE TABLE IF NOT EXISTS share_link_recipients (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  UNIQUE(share_link_id, email)
);

CREATE INDEX IF NOT EXISTS idx_slr_link ON share_link_recipients(share_link_id);
CREATE INDEX IF NOT EXISTS idx_slr_email ON share_link_recipients(email);
