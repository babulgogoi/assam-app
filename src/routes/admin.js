const express  = require('express');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const sharp    = require('sharp');
const multer   = require('multer');
const rateLimit = require('express-rate-limit');
const router   = express.Router();

const adminController          = require('../controllers/adminController');
const adminAuthorsController   = require('../controllers/adminAuthorsController');
const adminPagesController     = require('../controllers/adminPagesController');
const adminPageTopicsController = require('../controllers/adminPageTopicsController');
const adminMenuController      = require('../controllers/adminMenuController');
const adminSettingsController  = require('../controllers/adminSettingsController');
const adminUsersController     = require('../controllers/adminUsersController');
const adminBooksController     = require('../controllers/adminBooksController');
const adminBlogController      = require('../controllers/adminBlogController');
const adminDashboardController = require('../controllers/adminDashboardController');
const adminAnalyticsController = require('../controllers/adminAnalyticsController');
const { requireAdmin, requirePermission } = require('../middleware/roleAuth');
const { uploadArticleFiles, uploadAuthorPhoto, uploadBookCover, uploadPageFeatured, uploadPageFiles, uploadHeroImage, uploadBlogImage, uploadAuthorImage, uploadPublisherLogo } = require('../middleware/upload');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts. Please try again later.',
});

// TinyMCE inline image upload — memory multer, not the shared one
const inlineImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(null, ok);
  },
});

router.get('/login', adminController.loginForm);
router.post('/login', loginLimiter, adminController.login);
router.post('/logout', adminController.logout);

// All routes below require a logged-in admin.
router.use(requireAdmin);

// Expose adminUser + current path (for nav active states) to every admin template.
router.use((req, res, next) => {
  res.locals.adminUser = req.session.adminUser;
  res.locals.activePath = req.baseUrl + req.path;
  next();
});

// Dashboard for content roles; books-focused roles are redirected to their
// section inside the controller.
router.get('/', adminDashboardController.show);

router.get('/analytics', requirePermission('settings', 'can_read'), adminAnalyticsController.show);

// TinyMCE inline image upload endpoint — module-aware
const INLINE_UPLOAD_TARGETS = {
  articles: { dir: () => process.env.UPLOADS_ARTICLES_DIR || '/home/assam/web/assam.org/public_html/uploads/articles', url: '/uploads/articles' },
  pages:    { dir: () => process.env.UPLOADS_PAGES_DIR    || '/home/assam/web/assam.org/public_html/uploads/pages',    url: '/uploads/pages'    },
  books:    { dir: () => process.env.UPLOADS_BOOKS_DIR    || '/home/assam/web/assam.org/public_html/uploads/books',    url: '/uploads/books'    },
  authors:  { dir: () => process.env.UPLOADS_AUTHORS_DIR  || '/home/assam/web/assam.org/public_html/uploads/authors',  url: '/uploads/authors'  },
};

router.post('/upload-image', inlineImageUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const mod    = INLINE_UPLOAD_TARGETS[req.query.module] ? req.query.module : 'articles';
    const target = INLINE_UPLOAD_TARGETS[mod];
    const dir    = target.dir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filename = `inline-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    const outPath  = path.join(dir, filename);
    const tmpPath  = outPath + '.tmp';
    await sharp(req.file.buffer)
      .resize(1200, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 85, progressive: true })
      .toFile(tmpPath);
    fs.renameSync(tmpPath, outPath);
    res.json({ location: `${target.url}/${filename}` });
  } catch (err) {
    console.error('TinyMCE image upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Author search for autocomplete (pages, etc.)
router.get('/authors/search', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);
    const db = require('../config/db');
    const { rows } = await db.query(
      `SELECT id, username, display_name FROM authors
       WHERE username ILIKE $1 OR display_name ILIKE $1
       ORDER BY display_name, username LIMIT 10`,
      [`%${q}%`]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Articles (module: stories)
router.get('/articles',             requirePermission('stories', 'can_read'),   adminController.listArticles);
router.get('/articles/new',         requirePermission('stories', 'can_create'), adminController.newArticleForm);
router.post('/articles',            requirePermission('stories', 'can_create'), uploadArticleFiles, adminController.createArticle);
router.get('/articles/:id/edit',    requirePermission('stories', 'can_read'),   adminController.editArticleForm);
router.post('/articles/:id',        requirePermission('stories', 'can_update'), uploadArticleFiles, adminController.updateArticle);
router.post('/articles/:id/delete', requirePermission('stories', 'can_delete'), adminController.deleteArticle);

// Story Authors (module: authors)
router.get('/authors',          requirePermission('authors', 'can_read'),   adminAuthorsController.listAuthors);
router.get('/authors/new',      requirePermission('authors', 'can_create'), adminAuthorsController.newAuthorForm);
router.post('/authors',         requirePermission('authors', 'can_create'), uploadAuthorPhoto, adminAuthorsController.createAuthor);
router.get('/authors/:id/edit',    requirePermission('authors', 'can_read'),   adminAuthorsController.editAuthorForm);
router.post('/authors/:id',        requirePermission('authors', 'can_update'), uploadAuthorPhoto, adminAuthorsController.updateAuthor);
router.post('/authors/:id/delete', requirePermission('authors', 'can_delete'), adminAuthorsController.deleteAuthor);

// Page Topics (module: pages) — before /pages/:id to avoid conflict
router.get('/page-topics',             requirePermission('pages', 'can_read'),   adminPageTopicsController.listTopics);
router.post('/page-topics',            requirePermission('pages', 'can_create'), adminPageTopicsController.createTopic);
router.post('/page-topics/:id',        requirePermission('pages', 'can_update'), adminPageTopicsController.updateTopic);
router.post('/page-topics/:id/delete', requirePermission('pages', 'can_delete'), adminPageTopicsController.deleteTopic);

// Pages (module: pages)
router.get('/pages',             requirePermission('pages', 'can_read'),   adminPagesController.listPages);
router.get('/pages/new',         requirePermission('pages', 'can_create'), adminPagesController.newPageForm);
router.post('/pages',            requirePermission('pages', 'can_create'), uploadPageFiles, adminPagesController.createPage);
router.get('/pages/:id/edit',    requirePermission('pages', 'can_read'),   adminPagesController.editPageForm);
router.post('/pages/:id',        requirePermission('pages', 'can_update'), uploadPageFiles, adminPagesController.updatePage);
router.post('/pages/:id/delete', requirePermission('pages', 'can_delete'), adminPagesController.deletePage);
router.get('/pages/:id/revisions', requirePermission('pages', 'can_read'), async (req, res, next) => {
  try {
    const db = require('../config/db');
    const [pageRes, historyRes] = await Promise.all([
      db.query('SELECT id, title, slug FROM pages WHERE id=$1', [req.params.id]),
      db.query(
        `SELECT ph.id, ph.editor_name, ph.action, ph.editor_note,
                ph.word_count_before, ph.word_count_after,
                ph.admin_user_id,
                au.username AS admin_username,
                au.display_name AS admin_display_name,
                TO_CHAR(ph.created_at, 'DD Mon YYYY, HH24:MI') AS formatted_date
         FROM page_history ph
         LEFT JOIN admin_users au ON au.id = ph.admin_user_id
         WHERE ph.page_id=$1 ORDER BY ph.created_at DESC`,
        [req.params.id]
      ),
    ]);
    if (!pageRes.rows.length) return res.status(404).send('Page not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/pages/revisions', {
      title: `Revisions: ${pageRes.rows[0].title} — Admin`,
      page: pageRes.rows[0],
      history: historyRes.rows,
    });
  } catch (err) { next(err); }
});

// Menu (module: settings)
router.get('/menu',              requirePermission('settings', 'can_read'),   adminMenuController.listMenuItems);
router.get('/menu/new',          requirePermission('settings', 'can_create'), adminMenuController.newMenuItemForm);
router.post('/menu',             requirePermission('settings', 'can_create'), adminMenuController.createMenuItem);
router.get('/menu/:id/edit',     requirePermission('settings', 'can_read'),   adminMenuController.editMenuItemForm);
router.post('/menu/:id',         requirePermission('settings', 'can_update'), adminMenuController.updateMenuItem);
router.post('/menu/:id/delete',  requirePermission('settings', 'can_delete'), adminMenuController.deleteMenuItem);

// Site settings (module: settings)
router.get('/settings',          requirePermission('settings', 'can_read'),   adminSettingsController.editSettingsForm);
router.post('/settings',         requirePermission('settings', 'can_update'), adminSettingsController.updateSettings);
router.get('/settings/homepage', requirePermission('settings', 'can_read'),   adminSettingsController.editHomepageForm);
router.post('/settings/homepage',requirePermission('settings', 'can_update'), uploadHeroImage, adminSettingsController.updateHomepage);

// URL Redirects (module: settings)
router.get('/redirects', requirePermission('settings', 'can_read'), async (req, res, next) => {
  try {
    const db = require('../config/db');
    const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;
    const q = (req.query.q || '').trim();
    const params = q ? [`%${q}%`] : [];
    const where  = q ? `WHERE old_url ILIKE $1 OR new_url ILIKE $1` : '';
    const [rows, countRow] = await Promise.all([
      db.query(
        `SELECT * FROM redirects ${where} ORDER BY hits DESC, old_url LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      db.query(`SELECT COUNT(*) FROM redirects ${where}`, params),
    ]);
    const total = parseInt(countRow.rows[0].count, 10);
    res.locals.layout = 'admin/layout';
    res.render('admin/redirects', {
      title: 'URL Redirects — Admin',
      redirects: rows.rows,
      total, q,
      currentPage: page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      saved: req.query.saved === '1',
    });
  } catch (err) { next(err); }
});

router.post('/redirects', requirePermission('settings', 'can_update'), async (req, res, next) => {
  try {
    const db = require('../config/db');
    const { invalidateCache } = require('../middleware/redirects');
    let old_url = (req.body.old_url || '').trim();
    if (!old_url.startsWith('/')) old_url = '/' + old_url;
    const new_url = (req.body.new_url || '').trim();
    const type = parseInt(req.body.type, 10) === 302 ? 302 : 301;
    if (!old_url || !new_url) return res.redirect('/admin/redirects');
    await db.query(
      `INSERT INTO redirects (old_url, new_url, type)
       VALUES ($1, $2, $3)
       ON CONFLICT (old_url) DO UPDATE SET new_url = EXCLUDED.new_url, type = EXCLUDED.type`,
      [old_url, new_url, type]
    );
    invalidateCache();
    res.redirect('/admin/redirects?saved=1');
  } catch (err) { next(err); }
});

router.post('/redirects/:id/delete', requirePermission('settings', 'can_update'), async (req, res, next) => {
  try {
    const db = require('../config/db');
    const { invalidateCache } = require('../middleware/redirects');
    await db.query('DELETE FROM redirects WHERE id = $1', [req.params.id]);
    invalidateCache();
    res.redirect('/admin/redirects');
  } catch (err) { next(err); }
});

// User management (module: users — superadmin only in practice)
router.get('/users',             requirePermission('users', 'can_read'),   adminUsersController.listUsers);
router.get('/users/new',         requirePermission('users', 'can_create'), adminUsersController.newUserForm);
router.post('/users',            requirePermission('users', 'can_create'), adminUsersController.createUser);
router.get('/users/:id/edit',    requirePermission('users', 'can_read'),   adminUsersController.editUserForm);
router.post('/users/:id',        requirePermission('users', 'can_update'), adminUsersController.updateUser);
router.post('/users/:id/delete', requirePermission('users', 'can_delete'), adminUsersController.deleteUser);

// Books (module: books)
router.get('/books',             requirePermission('books', 'can_read'),   adminBooksController.listBooks);
router.get('/books/new',         requirePermission('books', 'can_create'), adminBooksController.newBookForm);
router.post('/books',            requirePermission('books', 'can_create'), uploadBookCover, adminBooksController.createBook);
router.get('/books/:id/edit',    requirePermission('books', 'can_read'),   adminBooksController.editBookForm);
router.post('/books/:id',        requirePermission('books', 'can_update'), uploadBookCover, adminBooksController.updateBook);
router.post('/books/:id/delete', requirePermission('books', 'can_delete'), adminBooksController.deleteBook);

// Book Authors (module: books)
router.get('/book-authors/search',      requirePermission('books', 'can_read'),   adminBooksController.searchBookAuthors);
router.get('/book-authors',             requirePermission('books', 'can_read'),   adminBooksController.listBookAuthors);
router.get('/book-authors/new',         requirePermission('books', 'can_create'), adminBooksController.newBookAuthorForm);
router.post('/book-authors',            requirePermission('books', 'can_create'), uploadAuthorImage, adminBooksController.createBookAuthor);
router.get('/book-authors/:id/edit',    requirePermission('books', 'can_read'),   adminBooksController.editBookAuthorForm);
router.post('/book-authors/:id',        requirePermission('books', 'can_update'), uploadAuthorImage, adminBooksController.updateBookAuthor);
router.post('/book-authors/:id/delete', requirePermission('books', 'can_delete'), adminBooksController.deleteBookAuthor);

// Book Publishers (module: books)
router.get('/book-publishers',             requirePermission('books', 'can_read'),   adminBooksController.listPublishers);
router.get('/book-publishers/new',         requirePermission('books', 'can_create'), adminBooksController.newPublisherForm);
router.post('/book-publishers',            requirePermission('books', 'can_create'), uploadPublisherLogo, adminBooksController.createPublisher);
router.get('/book-publishers/:id/edit',    requirePermission('books', 'can_read'),   adminBooksController.editPublisherForm);
router.post('/book-publishers/:id',        requirePermission('books', 'can_update'), uploadPublisherLogo, adminBooksController.updatePublisher);
router.post('/book-publishers/:id/delete', requirePermission('books', 'can_delete'), adminBooksController.deletePublisher);

// Blog (module: blog)
router.get('/blog',             requirePermission('blog', 'can_read'),   adminBlogController.list);
router.get('/blog/new',         requirePermission('blog', 'can_create'), adminBlogController.newForm);
router.post('/blog',            requirePermission('blog', 'can_create'), uploadBlogImage, adminBlogController.create);
router.get('/blog/:id/edit',    requirePermission('blog', 'can_read'),   adminBlogController.editForm);
router.post('/blog/:id',        requirePermission('blog', 'can_update'), uploadBlogImage, adminBlogController.update);
router.post('/blog/:id/delete', requirePermission('blog', 'can_delete'), adminBlogController.del);

module.exports = router;
