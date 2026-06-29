-- 016: Add author_id to pages (references authors table, same as articles)
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pages_author_id_idx ON pages(author_id);
