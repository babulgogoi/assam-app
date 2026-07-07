-- 026: Link admin users to book author profiles.
-- Table is books_authors (not book_authors as in older docs).

ALTER TABLE books_authors
  ADD COLUMN IF NOT EXISTS admin_user_id INTEGER
  REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_books_authors_admin_user
  ON books_authors(admin_user_id);
