const bcrypt = require('bcryptjs');
const adminUsersModel = require('../models/adminUsers');

function setLayout(res) {
  res.locals.layout = 'admin/layout';
}

async function listUsers(req, res, next) {
  try {
    setLayout(res);
    const users = await adminUsersModel.listWithRoles();
    res.render('admin/users/list', { title: 'Users — Admin', users });
  } catch (err) {
    next(err);
  }
}

async function newUserForm(req, res, next) {
  try {
    setLayout(res);
    const roles = await adminUsersModel.getRoles();
    res.render('admin/users/form', {
      title: 'New User — Admin',
      user: null,
      roles,
      selectedRoles: [],
      errors: [],
    });
  } catch (err) {
    next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { username, email, display_name, status, password, password_confirm } = req.body;
    const roleIds = [].concat(req.body.role_ids || []).map(Number).filter(Boolean);
    const errors = [];

    if (!username) errors.push('Username is required.');
    else if (await adminUsersModel.usernameExists(username)) errors.push('Username already exists.');
    if (!password) errors.push('Password is required.');
    else if (password.length < 8) errors.push('Password must be at least 8 characters.');
    else if (password !== password_confirm) errors.push('Passwords do not match.');

    if (errors.length) {
      setLayout(res);
      const roles = await adminUsersModel.getRoles();
      return res.status(400).render('admin/users/form', {
        title: 'New User — Admin',
        user: req.body,
        roles,
        selectedRoles: roleIds,
        errors,
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await adminUsersModel.create({ username, email, passwordHash, displayName: display_name, status, roleIds });
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function editUserForm(req, res, next) {
  try {
    const user = await adminUsersModel.getById(req.params.id);
    if (!user) return res.status(404).send('User not found');

    setLayout(res);
    const [roles, selectedRoles] = await Promise.all([
      adminUsersModel.getRoles(),
      adminUsersModel.getRolesForUser(user.id),
    ]);
    res.render('admin/users/form', {
      title: `Edit User: ${user.username} — Admin`,
      user,
      roles,
      selectedRoles,
      errors: [],
    });
  } catch (err) {
    next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const user = await adminUsersModel.getById(req.params.id);
    if (!user) return res.status(404).send('User not found');

    const { username, email, display_name, status, password, password_confirm } = req.body;
    const roleIds = [].concat(req.body.role_ids || []).map(Number).filter(Boolean);
    const errors = [];

    if (!username) errors.push('Username is required.');
    else if (await adminUsersModel.usernameExists(username, user.id)) errors.push('Username already in use.');
    if (password) {
      if (password.length < 8) errors.push('Password must be at least 8 characters.');
      else if (password !== password_confirm) errors.push('Passwords do not match.');
    }

    // Prevent removing all roles from the only superadmin
    const isSelf = req.session.adminUser.id === user.id;

    if (errors.length) {
      setLayout(res);
      const roles = await adminUsersModel.getRoles();
      return res.status(400).render('admin/users/form', {
        title: `Edit User: ${user.username} — Admin`,
        user: { ...user, ...req.body },
        roles,
        selectedRoles: roleIds,
        errors,
      });
    }

    const passwordHash = password ? await bcrypt.hash(password, 12) : null;
    await adminUsersModel.update(user.id, { username, email, displayName: display_name, status, passwordHash, roleIds });

    // Refresh session if editing self
    if (isSelf) {
      const { roles: newRoles, permissions, isSuperAdmin } = await adminUsersModel.loadPermissions(user.id);
      req.session.adminUser = {
        ...req.session.adminUser,
        username,
        displayName: display_name || username,
        roles: newRoles,
        permissions,
        isSuperAdmin,
      };
    }

    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    if (req.session.adminUser.id === Number(req.params.id)) {
      return res.status(400).send('You cannot delete your own account.');
    }
    await adminUsersModel.remove(req.params.id);
    res.redirect('/admin/users');
  } catch (err) {
    next(err);
  }
}

module.exports = { listUsers, newUserForm, createUser, editUserForm, updateUser, deleteUser };
