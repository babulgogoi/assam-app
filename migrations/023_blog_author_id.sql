-- Add byline author_id to blog_posts (references authors table, same as articles)
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_id INTEGER REFERENCES authors(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_author_id ON blog_posts(author_id);
