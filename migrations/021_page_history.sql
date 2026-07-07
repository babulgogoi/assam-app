CREATE TABLE IF NOT EXISTS page_history (
  id                   SERIAL PRIMARY KEY,
  page_id              INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  editor_name          VARCHAR(200),
  action               VARCHAR(50) DEFAULT 'edited',
  editor_note          VARCHAR(500),
  body_snapshot_hash   VARCHAR(64),
  word_count_before    INTEGER,
  word_count_after     INTEGER,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS page_history_page_id_idx ON page_history(page_id);
CREATE INDEX IF NOT EXISTS page_history_created_idx  ON page_history(created_at DESC);

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS editors_note TEXT;
