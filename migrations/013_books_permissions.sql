-- Add 'books' module permissions for editor role

INSERT INTO admin_permissions (role_id, module, can_read, can_create, can_update, can_delete, own_only)
SELECT r.id, 'books', true, true, true, true, false
FROM admin_roles r
WHERE r.name = 'editor'
ON CONFLICT (role_id, module) DO NOTHING;
