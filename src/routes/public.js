const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const publicController = require('../controllers/publicController');
const publicBooksController = require('../controllers/publicBooksController');
const menuItemsModel = require('../models/menuItems');
const siteSettingsModel = require('../models/siteSettings');

const likeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests. Please try again later.',
});

router.use(async (req, res, next) => {
  res.locals.adsenseClientId = process.env.ADSENSE_CLIENT_ID;
  res.locals.adsenseSlotHeader = process.env.ADSENSE_SLOT_HEADER;
  res.locals.adsenseSlotSidebar = process.env.ADSENSE_SLOT_SIDEBAR;
  res.locals.adsenseSlotInArticle = process.env.ADSENSE_SLOT_IN_ARTICLE;
  try {
    res.locals.menuItems = await menuItemsModel.getActiveOrdered();
    res.locals.footerHtml = await siteSettingsModel.getFooterHtml();
  } catch (err) {
    return next(err);
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

// Books — specific routes before wildcard
router.get('/books', publicBooksController.catalogue);
router.get('/books/search', publicBooksController.searchCatalogue);
router.get('/books/category/:slug', publicBooksController.categoryPage);
router.get('/books/author/:slug', publicBooksController.authorPage);
router.get('/books/publisher/:slug', publicBooksController.publisherPage);
router.get('/book/:slug', publicBooksController.bookDetail);
router.post('/book/:id/rate', publicBooksController.rateBook);

module.exports = router;
