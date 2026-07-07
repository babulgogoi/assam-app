'use strict';

const pool = require('../config/db');

async function getDashboardStats() {
  const [articles, books, blogPosts, pages, authors] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS n FROM articles WHERE status = 'published'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM books WHERE status = 'active'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM blog_posts WHERE status = 'published'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM pages WHERE status = 'published'`),
    pool.query(`SELECT COUNT(*)::int AS n FROM authors`),
  ]);
  return {
    articles: articles.rows[0].n,
    books: books.rows[0].n,
    blogPosts: blogPosts.rows[0].n,
    pages: pages.rows[0].n,
    authors: authors.rows[0].n,
  };
}

// Last 8 items across news + blog combined. Articles have no admin_user_id
// column, so no editor attribution here.
async function getRecentActivity() {
  const { rows } = await pool.query(`
    SELECT 'news' AS type, id, title, status, updated_at FROM articles
    UNION ALL
    SELECT 'blog' AS type, id, title, status, updated_at FROM blog_posts
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 8
  `);
  return rows;
}

async function show(req, res, next) {
  try {
    const u = req.session.adminUser;
    const p = u.permissions || {};

    // Books-focused roles (no stories/pages access) skip the dashboard and
    // land directly on their section.
    if (!u.isSuperAdmin && !p.stories?.can_read && !p.pages?.can_read) {
      if (p.books?.can_read) return res.redirect('/admin/books');
      if (p.blog?.can_read)  return res.redirect('/admin/blog');
      if (p.users?.can_read) return res.redirect('/admin/users');
    }

    const [stats, activity] = await Promise.all([
      getDashboardStats(),
      getRecentActivity(),
    ]);

    res.locals.layout = 'admin/layout';
    res.render('admin/dashboard', {
      title: 'Dashboard — Admin',
      stats,
      activity,
    });
  } catch (err) { next(err); }
}

module.exports = { show };
