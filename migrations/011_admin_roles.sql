CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(300) UNIQUE,
  password_hash VARCHAR(300) NOT NULL,
  display_name VARCHAR(200),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER REFERENCES admin_roles(id) ON DELETE CASCADE,
  module VARCHAR(50) NOT NULL,
  can_create BOOLEAN DEFAULT false,
  can_read   BOOLEAN DEFAULT true,
  can_update BOOLEAN DEFAULT false,
  can_delete BOOLEAN DEFAULT false,
  own_only   BOOLEAN DEFAULT false,
  UNIQUE(role_id, module)
);

CREATE TABLE IF NOT EXISTS admin_user_roles (
  user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES admin_roles(id)  ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- Default roles
INSERT INTO admin_roles (name, description) VALUES
  ('superadmin',     'Full access to everything'),
  ('editor',         'All content — stories, pages, authors'),
  ('stories_editor', 'Stories/articles only'),
  ('pages_editor',   'Research pages only'),
  ('contributor',    'Own content only — create & edit, no delete')
ON CONFLICT (name) DO NOTHING;

-- Superadmin: all modules
INSERT INTO admin_permissions (role_id, module, can_create, can_read, can_update, can_delete, own_only)
SELECT r.id, m.module, true, true, true, true, false
FROM admin_roles r,
     (VALUES ('stories'),('pages'),('authors'),('settings'),('users')) AS m(module)
WHERE r.name = 'superadmin'
ON CONFLICT (role_id, module) DO NOTHING;

-- Editor: all content, no settings/users
INSERT INTO admin_permissions (role_id, module, can_create, can_read, can_update, can_delete, own_only)
SELECT r.id, m.module, true, true, true, true, false
FROM admin_roles r,
     (VALUES ('stories'),('pages'),('authors')) AS m(module)
WHERE r.name = 'editor'
ON CONFLICT (role_id, module) DO NOTHING;

-- Stories editor
INSERT INTO admin_permissions (role_id, module, can_create, can_read, can_update, can_delete, own_only)
SELECT r.id, 'stories', true, true, true, false, false
FROM admin_roles r WHERE r.name = 'stories_editor'
ON CONFLICT (role_id, module) DO NOTHING;

-- Pages editor
INSERT INTO admin_permissions (role_id, module, can_create, can_read, can_update, can_delete, own_only)
SELECT r.id, 'pages', true, true, true, false, false
FROM admin_roles r WHERE r.name = 'pages_editor'
ON CONFLICT (role_id, module) DO NOTHING;

-- Contributor: own content only, no delete
INSERT INTO admin_permissions (role_id, module, can_create, can_read, can_update, can_delete, own_only)
SELECT r.id, m.module, true, true, true, false, true
FROM admin_roles r,
     (VALUES ('stories'),('pages')) AS m(module)
WHERE r.name = 'contributor'
ON CONFLICT (role_id, module) DO NOTHING;
