-- 015: Page topics + extra page fields

CREATE TABLE IF NOT EXISTS page_topics (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(200) UNIQUE NOT NULL,
  description TEXT,
  icon       VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO page_topics (name, slug, icon, sort_order) VALUES
  ('Geography', 'geography', '🗺️',  1),
  ('History',   'history',   '📜',  2),
  ('Culture',   'culture',   '🎭',  3),
  ('Economy',   'economy',   '💰',  4),
  ('Education', 'education', '📚',  5),
  ('Language',  'language',  '🗣️',  6),
  ('Politics',  'politics',  '🏛️',  7),
  ('Travel',    'travel',    '✈️',  8),
  ('Nature',    'nature',    '🌿',  9),
  ('Society',   'society',   '👥', 10),
  ('Religion',  'religion',  '🕌', 11),
  ('Sports',    'sports',    '🏏', 12)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS topic_id               INTEGER REFERENCES page_topics(id),
  ADD COLUMN IF NOT EXISTS featured_image         VARCHAR(500),
  ADD COLUMN IF NOT EXISTS featured_image_caption VARCHAR(500),
  ADD COLUMN IF NOT EXISTS references_text        TEXT,
  ADD COLUMN IF NOT EXISTS tags                   TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS excerpt                VARCHAR(500);

CREATE INDEX IF NOT EXISTS pages_topic_id_idx ON pages(topic_id);
