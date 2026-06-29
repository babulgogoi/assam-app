const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const pagesModel = require('../models/pages');
const slugify = require('../utils/slugify');

const PAGES_DIR    = process.env.UPLOADS_ARTICLES_DIR || '/home/assam/web/assam.org/public_html/uploads/articles';
const PAGES_PREFIX = '/uploads/articles';

async function saveFeaturedImage(buffer, pageId) {
  const base    = `page-${pageId}-${Date.now()}`;
  const outPath = path.join(PAGES_DIR, `${base}.jpg`);
  const tmpPath = outPath + '.tmp';
  await sharp(buffer)
    .resize(1200, null, { withoutEnlargement: true, fit: 'inside' })
    .jpeg({ quality: 88, progressive: true })
    .toFile(tmpPath);
  fs.renameSync(tmpPath, outPath);
  return `${PAGES_PREFIX}/${base}.jpg`;
}

function deleteFeaturedImage(url) {
  if (!url || !url.startsWith(PAGES_PREFIX)) return;
  const full = path.join(PAGES_DIR, path.basename(url));
  try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (_) {}
}

async function listPages(req, res, next) {
  try {
    const pages = await pagesModel.getAllForAdmin();
    res.locals.layout = 'admin/layout';
    res.render('admin/pages/list', { title: 'Pages — Admin', pages });
  } catch (err) { next(err); }
}

async function _getTopics() {
  return pagesModel.listTopicsAdmin();
}

async function newPageForm(req, res) {
  const topics = await _getTopics();
  res.locals.layout = 'admin/layout';
  res.render('admin/pages/form', { title: 'New Page — Admin', page: null, errors: [], topics });
}

async function editPageForm(req, res, next) {
  try {
    const [page, topics] = await Promise.all([
      pagesModel.getById(req.params.id),
      _getTopics(),
    ]);
    if (!page) return res.status(404).send('Page not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/pages/form', { title: `Edit: ${page.title} — Admin`, page, errors: [], topics });
  } catch (err) { next(err); }
}

async function buildPageData(req, existingPage) {
  const body = req.body;
  let baseSlug = slugify(body.slug || body.title || '');
  if (!baseSlug) baseSlug = `page-${Date.now()}`;
  const excludeId = req.params.id ? Number(req.params.id) : null;
  let slug = baseSlug;
  let suffix = 2;
  while (await pagesModel.slugExists(slug, excludeId)) { slug = `${baseSlug}-${suffix}`; suffix++; }

  let featuredImage = existingPage ? existingPage.featured_image : null;
  if (req.file) {
    if (existingPage) deleteFeaturedImage(existingPage.featured_image);
    featuredImage = await saveFeaturedImage(req.file.buffer, excludeId || 'new');
  } else if (body.featured_image_remove === '1') {
    if (existingPage) deleteFeaturedImage(existingPage.featured_image);
    featuredImage = null;
  }

  return {
    slug,
    title: body.title,
    body: body.body,
    status: body.status === 'draft' ? 'draft' : 'published',
    excerpt: body.excerpt || null,
    featured_image: featuredImage,
    featured_image_caption: body.featured_image_caption || null,
    references_text: body.references_text || null,
    tags: [],
    topic_id:  body.topic_id  ? parseInt(body.topic_id, 10)  : null,
    author_id: body.author_id ? parseInt(body.author_id, 10) : null,
  };
}

async function createPage(req, res, next) {
  try {
    const topics = await _getTopics();
    if (!req.body.title || !req.body.body) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/pages/form', {
        title: 'New Page — Admin', page: req.body, errors: ['Title and body are required.'], topics,
      });
    }
    const data = await buildPageData(req, null);
    const id   = await pagesModel.create(data);
    // If we uploaded with a temp 'new' ID, rename to real ID
    if (req.file && data.featured_image) {
      const newUrl = await saveFeaturedImage(req.file.buffer, id);
      deleteFeaturedImage(data.featured_image);
      await pagesModel.update(id, { ...data, featured_image: newUrl });
    }
    res.redirect(`/admin/pages/${id}/edit`);
  } catch (err) { next(err); }
}

async function updatePage(req, res, next) {
  try {
    const [page, topics] = await Promise.all([pagesModel.getById(req.params.id), _getTopics()]);
    if (!page) return res.status(404).send('Page not found');
    if (!req.body.title || !req.body.body) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/pages/form', {
        title: `Edit: ${page.title} — Admin`,
        page: { ...page, ...req.body }, errors: ['Title and body are required.'], topics,
      });
    }
    const data = await buildPageData(req, page);
    await pagesModel.update(page.id, data);
    res.redirect(`/admin/pages/${page.id}/edit`);
  } catch (err) { next(err); }
}

async function deletePage(req, res, next) {
  try {
    const page = await pagesModel.getById(req.params.id);
    if (page) deleteFeaturedImage(page.featured_image);
    await pagesModel.remove(req.params.id);
    res.redirect('/admin/pages');
  } catch (err) { next(err); }
}

module.exports = { listPages, newPageForm, editPageForm, createPage, updatePage, deletePage };
