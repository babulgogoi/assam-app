-- 022_booknook_blog.sql
-- BookNook Blog: posts table, RBAC, and nav menu item

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE blog_posts (
  id                      SERIAL PRIMARY KEY,
  title                   VARCHAR(500)  NOT NULL,
  slug                    VARCHAR(600)  UNIQUE NOT NULL,
  body                    TEXT          NOT NULL,
  excerpt                 TEXT,
  featured_image          VARCHAR(500),
  featured_image_caption  VARCHAR(255),
  tags                    TEXT[]        DEFAULT '{}',
  status                  VARCHAR(20)   DEFAULT 'draft',  -- draft | published
  admin_user_id           INTEGER       REFERENCES admin_users(id) ON DELETE SET NULL,
  published_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ   DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_blog_posts_status    ON blog_posts(status);
CREATE INDEX idx_blog_posts_slug      ON blog_posts(slug);
CREATE INDEX idx_blog_posts_tags      ON blog_posts USING GIN(tags);
CREATE INDEX idx_blog_posts_published ON blog_posts(published_at DESC);

-- ── RBAC ─────────────────────────────────────────────────────────────────────

INSERT INTO admin_roles (name, description)
VALUES ('userbooknook', 'BookNook Editor — full access to BookNook blog and books catalogue')
ON CONFLICT (name) DO NOTHING;

-- userbooknook: full blog + books access
INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete)
SELECT id, 'blog',  true, true, true, true FROM admin_roles WHERE name = 'userbooknook'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_read=true, can_create=true, can_update=true, can_delete=true;

INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete)
SELECT id, 'books', true, true, true, true FROM admin_roles WHERE name = 'userbooknook'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_read=true, can_create=true, can_update=true, can_delete=true;

-- editor role: also gets blog access
INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete)
SELECT id, 'blog',  true, true, true, true FROM admin_roles WHERE name = 'editor'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_read=true, can_create=true, can_update=true, can_delete=true;

-- ── Nav menu ─────────────────────────────────────────────────────────────────

-- Add "Blog" as submenu child of BookNook (id=4), after Publish Your Book
INSERT INTO menu_items (label, custom_url, parent_id, sort_order, is_active)
VALUES ('Blog', '/blog', 4, 2, true);

SELECT 'Migration 022 complete' AS status;
