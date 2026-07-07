-- 025: Role/permission cleanup for role-based access system.
--
-- Adapts the generic RBAC spec to this schema (multi-role via admin_user_roles;
-- modules: stories, pages, books, blog, authors, comments, settings, users).
--
-- 1. books_editor gains blog access → booknook sees Books + Blog only.
-- 2. editor loses settings access → content modules only; settings/users are superadmin-only.
-- 3. superadmin gets explicit permission rows for every module (bypass makes this
--    cosmetic, but keeps the matrix complete and auditable).
-- 4. New "authenticated" role — no admin permissions, reserved for future public users.
-- 5. Drop the stray "userbooknook" role (an earlier attempt at books+blog; never assigned).

BEGIN;

-- 1. books_editor: add blog (full CRUD, matching its books row)
INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete, own_only)
SELECT id, 'blog', true, true, true, true, false
FROM admin_roles WHERE name = 'books_editor'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_read = true, can_create = true, can_update = true, can_delete = true;

UPDATE admin_roles
SET description = 'Books catalogue and blog (The Assam Review) only'
WHERE name = 'books_editor';

-- 2. editor: content only — remove settings
DELETE FROM admin_permissions
WHERE role_id = (SELECT id FROM admin_roles WHERE name = 'editor')
  AND module = 'settings';

UPDATE admin_roles
SET description = 'Full access to all content modules (no settings/users)'
WHERE name = 'editor';

-- 3. superadmin: explicit full rows for all modules
INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete, own_only)
SELECT r.id, m.module, true, true, true, true, false
FROM admin_roles r
CROSS JOIN (VALUES
  ('stories'), ('pages'), ('books'), ('blog'),
  ('authors'), ('comments'), ('settings'), ('users')
) AS m(module)
WHERE r.name = 'superadmin'
ON CONFLICT (role_id, module) DO UPDATE
  SET can_read = true, can_create = true, can_update = true, can_delete = true;

-- 4. authenticated: role exists, zero permission rows
INSERT INTO admin_roles (name, description)
VALUES ('authenticated', 'No admin access — future public user role')
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description;

-- 5. Drop unused userbooknook role — guard: only if no users hold it
DELETE FROM admin_roles
WHERE name = 'userbooknook'
  AND NOT EXISTS (
    SELECT 1 FROM admin_user_roles ur WHERE ur.role_id = admin_roles.id
  );

COMMIT;
