-- 027: First-party click & view tracking (no third-party analytics).
-- Raw events in click_events; click_daily_summary reserved for future rollups.
-- NOTE: articles already have views_count (incremented in articleDetail) —
-- the new views columns go on books, blog_posts, pages only.

CREATE TABLE IF NOT EXISTS click_events (
  id            BIGSERIAL PRIMARY KEY,
  event_type    VARCHAR(50)  NOT NULL,
  -- 'page_view','outbound_click','content_click','search','filter_click','nav_click'

  content_type  VARCHAR(50),   -- 'article','book','blog_post','page','search'
  content_id    INTEGER,
  content_slug  VARCHAR(600),
  content_title VARCHAR(500),

  target_url    TEXT,          -- outbound destination

  search_query  VARCHAR(500),
  result_count  INTEGER,

  session_id    VARCHAR(100),
  referrer      TEXT,
  user_agent    VARCHAR(500),
  ip_hash       VARCHAR(64),   -- SHA256(ip + secret), never the raw IP

  country_code  VARCHAR(2),

  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_click_events_type    ON click_events(event_type);
CREATE INDEX IF NOT EXISTS idx_click_events_content ON click_events(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_click_events_slug    ON click_events(content_slug);
CREATE INDEX IF NOT EXISTS idx_click_events_created ON click_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_click_events_session ON click_events(session_id);

CREATE TABLE IF NOT EXISTS click_daily_summary (
  id              SERIAL PRIMARY KEY,
  summary_date    DATE NOT NULL,
  content_type    VARCHAR(50),
  content_id      INTEGER,
  content_slug    VARCHAR(600),
  content_title   VARCHAR(500),
  event_type      VARCHAR(50),
  view_count      INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(summary_date, content_type, content_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_daily_summary_date    ON click_daily_summary(summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summary_content ON click_daily_summary(content_type, content_id);

ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE books      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE pages      ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
