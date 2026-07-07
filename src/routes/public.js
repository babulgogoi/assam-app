const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const publicController = require('../controllers/publicController');
const publicBooksController = require('../controllers/publicBooksController');
const blogController = require('../controllers/blogController');
const menuItemsModel = require('../models/menuItems');
const siteSettingsModel = require('../models/siteSettings');

const likeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: false,
  legacyHeaders: false,
});

// Click tracking beacon. Registered BEFORE the menu/footer middleware below —
// beacons must not pay for two DB queries per hit.
const { record: recordEvent } = require('../models/clickEvents');
const { BOT_RE } = require('../middleware/trackPageView');
const TRACK_EVENT_TYPES = ['outbound_click', 'content_click', 'filter_click', 'nav_click'];

router.post('/api/track', trackLimiter, (req, res) => {
  if (req.headers.dnt === '1') return res.json({ ok: true });

  const ua = req.headers['user-agent'] || '';
  if (BOT_RE.test(ua)) return res.json({ ok: true });

  const b = req.body || {};
  if (!TRACK_EVENT_TYPES.includes(b.event_type)) return res.json({ ok: false });

  const contentId = parseInt(b.content_id, 10);
  recordEvent({
    event_type: b.event_type,
    content_type: (b.content_type || '').toString().slice(0, 50) || null,
    content_id: Number.isNaN(contentId) ? null : contentId,
    content_slug: (b.content_slug || '').toString().slice(0, 600) || null,
    content_title: (b.content_title || '').toString().slice(0, 500) || null,
    target_url: (b.target_url || '').toString().slice(0, 2000) || null,
    session_id: req.sessionID,
    referrer: req.headers.referer || null,
    user_agent: ua.slice(0, 500),
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip,
  });

  res.json({ ok: true });
});

router.use(async (req, res, next) => {
  res.locals.currentUrl = req.path;
  // Logged-in admin (if any) — drives the contextual "Edit this …" bars on public pages.
  res.locals.adminUser = req.session?.adminUser || null;
  res.locals.adsenseClientId = process.env.ADSENSE_CLIENT_ID;
  res.locals.adsenseSlotHeader = process.env.ADSENSE_SLOT_HEADER;
  res.locals.adsenseSlotSidebar = process.env.ADSENSE_SLOT_SIDEBAR;
  res.locals.adsenseSlotInArticle = process.env.ADSENSE_SLOT_IN_ARTICLE;
  try {
    res.locals.menuItems = await menuItemsModel.getActiveOrdered();
  } catch (err) {
    console.error('Menu load error:', err.message);
    res.locals.menuItems = [];
  }
  try {
    res.locals.footerHtml = await siteSettingsModel.getFooterHtml();
  } catch (err) {
    console.error('Footer load error:', err.message);
    res.locals.footerHtml = null;
  }
  next();
});

router.get('/', publicController.home);
router.get('/news', publicController.newsPage);
router.get('/article/:slug', publicController.articleDetail);
router.post('/article/:slug/like', likeLimiter, publicController.likeArticle);
router.get('/category/:category', publicController.categoryPage);
router.get('/author/:username', publicController.authorPage);
router.get('/search', publicController.searchPage);
router.get('/page/:slug', publicController.pageDetail);
router.get('/page/:slug/revisions', async (req, res, next) => {
  try {
    const db = require('../config/db');
    const [pageRes, historyRes] = await Promise.all([
      db.query(
        `SELECT p.*, pt.name AS topic_name, pt.slug AS topic_slug, pt.icon AS topic_icon
         FROM pages p
         LEFT JOIN page_topics pt ON pt.id = p.topic_id
         WHERE p.slug=$1 AND p.status='published'`,
        [req.params.slug]
      ),
      db.query(
        `SELECT editor_name, action, editor_note, word_count_before, word_count_after,
                TO_CHAR(created_at, 'DD Mon YYYY, HH24:MI') AS formatted_date
         FROM page_history WHERE page_id=(SELECT id FROM pages WHERE slug=$1)
         ORDER BY created_at DESC`,
        [req.params.slug]
      ),
    ]);
    if (!pageRes.rows.length) return res.status(404).render('public/404', { title: 'Not Found' });
    res.render('public/page-revisions', {
      page: pageRes.rows[0],
      history: historyRes.rows,
      title: `Revisions: ${pageRes.rows[0].title} | Assam Portal`,
      adminUser: req.session?.adminUser || null,
    });
  } catch (err) { next(err); }
});

// Research (page topics)
router.get('/research', publicController.researchIndex);
router.get('/research/:topicSlug', publicController.researchTopic);

// D9 node fallback — redirect /node/:nid to the correct article or page
router.get('/node/:nid', async (req, res) => {
  try {
    const nid = parseInt(req.params.nid, 10);
    if (isNaN(nid)) return res.redirect(301, '/');
    const db = require('../config/db');
    const [art, pg] = await Promise.all([
      db.query(`SELECT slug FROM articles WHERE old_node_id = $1 AND status = 'published' LIMIT 1`, [nid]),
      db.query(`SELECT slug FROM pages WHERE old_node_id = $1 AND status = 'published' LIMIT 1`, [nid]),
    ]);
    if (art.rows.length) return res.redirect(301, `/article/${art.rows[0].slug}`);
    if (pg.rows.length)  return res.redirect(301, `/page/${pg.rows[0].slug}`);
    return res.redirect(301, '/');
  } catch (err) {
    console.error('Node redirect error:', err);
    res.redirect(301, '/');
  }
});

// Blog
router.get('/blog',       blogController.listPosts);
router.get('/blog/:slug', blogController.showPost);

// Books — specific routes before wildcard
router.get('/books', publicBooksController.catalogue);
router.get('/books/publish', async (req, res) => {
  try {
    const db = require('../config/db');
    const result = await db.query(
      'SELECT publish_custom_html, publish_custom_html_enabled FROM site_settings WHERE id = 1'
    );
    res.render('public/books-publish', {
      settings: result.rows[0] || {},
      title: 'Publish Your Book | Assam Portal',
    });
  } catch (err) {
    console.error(err);
    next(err);
  }
});
router.get('/books/search', publicBooksController.searchCatalogue);
router.get('/books/category/:slug', publicBooksController.categoryPage);
router.get('/books/author/:slug', publicBooksController.authorPage);
router.get('/books/publisher/:slug', publicBooksController.publisherPage);
router.get('/book/:slug', publicBooksController.bookDetail);
router.post('/book/:id/rate', publicBooksController.rateBook);

module.exports = router;
