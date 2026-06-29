-- 017: Homepage settings columns on site_settings

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS hero_image                  VARCHAR(500),
  ADD COLUMN IF NOT EXISTS hero_headline               VARCHAR(300),
  ADD COLUMN IF NOT EXISTS hero_subtext                VARCHAR(500),
  ADD COLUMN IF NOT EXISTS hero_cta_text               VARCHAR(100),
  ADD COLUMN IF NOT EXISTS hero_cta_url                VARCHAR(300),
  ADD COLUMN IF NOT EXISTS hero_overlay_opacity        DECIMAL(3,2) DEFAULT 0.55,
  ADD COLUMN IF NOT EXISTS books_section_title         VARCHAR(200) DEFAULT 'Books About Assam',
  ADD COLUMN IF NOT EXISTS books_section_show_featured BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS research_section_title      VARCHAR(200) DEFAULT 'Research & Knowledge',
  ADD COLUMN IF NOT EXISTS custom_block_1_html         TEXT,
  ADD COLUMN IF NOT EXISTS custom_block_1_enabled      BOOLEAN      DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_block_2_html         TEXT,
  ADD COLUMN IF NOT EXISTS custom_block_2_enabled      BOOLEAN      DEFAULT false;

-- Seed defaults (only if null)
UPDATE site_settings SET
  hero_headline          = COALESCE(hero_headline,        'Gateway to Assam'),
  hero_subtext           = COALESCE(hero_subtext,         'Discover the culture, history, books and knowledge of Assam, India.'),
  hero_cta_text          = COALESCE(hero_cta_text,        'Explore Books'),
  hero_cta_url           = COALESCE(hero_cta_url,         '/books'),
  hero_overlay_opacity   = COALESCE(hero_overlay_opacity, 0.55),
  books_section_title    = COALESCE(books_section_title,  'Books About Assam'),
  research_section_title = COALESCE(research_section_title, 'Research & Knowledge')
WHERE id = 1;
