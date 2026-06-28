function requireAdmin(req, res, next) {
  if (req.session && req.session.adminUser) return next();
  return res.redirect('/admin/login');
}

function requirePermission(module, action) {
  return async (req, res, next) => {
    const adminUser = req.session && req.session.adminUser;
    if (!adminUser) return res.redirect('/admin/login');

    if (adminUser.isSuperAdmin) return next();

    const perm = adminUser.permissions && adminUser.permissions[module];
    if (!perm || !perm[action]) {
      return res.status(403).render('admin/403', {
        layout: 'admin/layout',
        title: 'Access Denied',
        message: `You do not have permission to perform this action on ${module}.`,
      });
    }

    req.ownOnly = perm.own_only;
    next();
  };
}

module.exports = { requireAdmin, requirePermission };
