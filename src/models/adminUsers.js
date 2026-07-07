const pool = require('../config/db');

async function getByUsername(username) {
  const { rows } = await pool.query(
    `SELECT id, username, email, password_hash, display_name, status
     FROM admin_users WHERE username = $1`,
    [username]
  );
  return rows[0] || null;
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT id, username, email, display_name, status, created_at, last_login
     FROM admin_users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function listWithRoles() {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.display_name, u.email, u.status,
            u.created_at, u.last_login,
            COALESCE(
              string_agg(r.name, ', ' ORDER BY r.name), '—'
            ) AS roles
     FROM admin_users u
     LEFT JOIN admin_user_roles ur ON ur.user_id = u.id
     LEFT JOIN admin_roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.username`
  );
  return rows;
}

// Lightweight list for "link admin user" dropdowns.
async function listBasic() {
  const { rows } = await pool.query(
    `SELECT id, username, email FROM admin_users WHERE status = 'active' ORDER BY username`
  );
  return rows;
}

async function getRoles() {
  const { rows } = await pool.query(
    `SELECT id, name, description FROM admin_roles ORDER BY name`
  );
  return rows;
}

async function getRolesForUser(userId) {
  const { rows } = await pool.query(
    `SELECT role_id FROM admin_user_roles WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.role_id);
}

async function loadPermissions(userId) {
  const { rows } = await pool.query(
    `SELECT ar.name AS role, ap.module,
            ap.can_create, ap.can_read, ap.can_update, ap.can_delete, ap.own_only
     FROM admin_user_roles aur
     JOIN admin_roles ar ON ar.id = aur.role_id
     LEFT JOIN admin_permissions ap ON ap.role_id = aur.role_id
     WHERE aur.user_id = $1
     ORDER BY ar.name, ap.module`,
    [userId]
  );

  const permissions = {};
  const roles = new Set();

  for (const row of rows) {
    roles.add(row.role);
    if (!row.module) continue;
    if (!permissions[row.module]) {
      permissions[row.module] = {
        can_create: false, can_read: false,
        can_update: false, can_delete: false,
        own_only: true,
      };
    }
    const p = permissions[row.module];
    p.can_create = p.can_create || row.can_create;
    p.can_read   = p.can_read   || row.can_read;
    p.can_update = p.can_update || row.can_update;
    p.can_delete = p.can_delete || row.can_delete;
    p.own_only   = p.own_only   && row.own_only;
  }

  return { roles: [...roles], permissions, isSuperAdmin: roles.has('superadmin') };
}

async function create({ username, email, passwordHash, displayName, status, roleIds }) {
  const { rows } = await pool.query(
    `INSERT INTO admin_users (username, email, password_hash, display_name, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [username, email || null, passwordHash, displayName || null, status || 'active']
  );
  const userId = rows[0].id;
  if (roleIds && roleIds.length) await setRoles(userId, roleIds);
  return userId;
}

async function update(id, { username, email, displayName, status, passwordHash, roleIds }) {
  const fields = ['username=$1', 'email=$2', 'display_name=$3', 'status=$4'];
  const params = [username, email || null, displayName || null, status || 'active'];

  if (passwordHash) {
    params.push(passwordHash);
    fields.push(`password_hash=$${params.length}`);
  }

  params.push(id);
  await pool.query(
    `UPDATE admin_users SET ${fields.join(', ')} WHERE id=$${params.length}`,
    params
  );

  if (roleIds !== undefined) await setRoles(id, roleIds);
}

async function setRoles(userId, roleIds) {
  await pool.query('DELETE FROM admin_user_roles WHERE user_id = $1', [userId]);
  for (const roleId of roleIds) {
    await pool.query(
      'INSERT INTO admin_user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [userId, roleId]
    );
  }
}

async function updateLastLogin(id) {
  await pool.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [id]);
}

async function remove(id) {
  await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
}

async function usernameExists(username, excludeId = null) {
  const params = excludeId ? [username, excludeId] : [username];
  const { rows } = await pool.query(
    `SELECT 1 FROM admin_users WHERE username = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

module.exports = {
  getByUsername, getById, listWithRoles, listBasic,
  getRoles, getRolesForUser, loadPermissions,
  create, update, remove, updateLastLogin, usernameExists,
};
