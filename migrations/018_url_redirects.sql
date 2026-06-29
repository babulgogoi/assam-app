-- 018: URL redirects table for D9 legacy URLs

CREATE TABLE IF NOT EXISTS redirects (
  id         SERIAL PRIMARY KEY,
  old_url    VARCHAR(500) NOT NULL UNIQUE,
  new_url    VARCHAR(500) NOT NULL,
  type       INTEGER      DEFAULT 301,
  hits       INTEGER      DEFAULT 0,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS redirects_old_url_idx ON redirects(old_url);
