const path  = require('path');
const fs    = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const pool = require('../config/db');
const pagesModel = require('../models/pages');
const slugify = require('../utils/slugify');

function countWords(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
}

async function logHistory(pageId, adminUserId, editorName, action, editorNote, prevBody, newBody) {
  const prevHash = crypto.createHash('md5').update(prevBody || '').digest('hex');
  const newHash  = crypto.createHash('md5').update(newBody  || '').digest('hex');
  if (prevHash === newHash && !editorNote) return;
  await pool.query(
    `INSERT INTO page_history
       (page_id, admin_user_id, editor_name, action, editor_note,
        body_snapshot_hash, word_count_before, word_count_after)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [pageId, adminUserId || null, editorName, action, editorNote || null, newHash,
     countWords(prevBody), countWords(newBody)]
  );
}

const PAGES_DIR    = process.env.UPLOADS_ARTICLES_DIR || '/home/assam/web/assam.org/public_html/uploads/articles';
const PAGES_PREFIX = '/uploads/articles';
const PDFS_DIR     = process.env.UPLOADS_PDFS_DIR || '/home/assam/web/assam.org/public_html/uploads/pdfs';
const PDFS_PREFIX  = '/uploads/pdfs';

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

function savePdf(buffer, originalName) {
  if (!fs.existsSync(PDFS_DIR)) fs.mkdirSync(PDFS_DIR, { recursive: true });
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
  const outPath  = path.join(PDFS_DIR, filename);
  fs.writeFileSync(outPath, buffer);
  return `${PDFS_PREFIX}/${filename}`;
}

function deletePdf(url) {
  if (!url || !url.startsWith(PDFS_PREFIX)) return;
  const full = path.join(PDFS_DIR, path.basename(url));
  try { if (fs.existsSync(full)) fs.unlinkSync(full); } catch (_) {}
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
  const excludeId = req.params.id ? Number(req.params.id) : null;
  let slug;
  if (!req.session?.adminUser?.isSuperAdmin && existingPage) {
    slug = existingPage.slug;
  } else {
    let baseSlug = slugify(body.slug || body.title || '');
    if (!baseSlug) baseSlug = `page-${Date.now()}`;
    slug = baseSlug;
    let suffix = 2;
    while (await pagesModel.slugExists(slug, excludeId)) { slug = `${baseSlug}-${suffix}`; suffix++; }
  }

  // Featured image — req.files when using uploadPageFiles, req.file for legacy uploadPageFeatured
  const imageFile = (req.files && req.files['featured_image'] && req.files['featured_image'][0])
    || req.file || null;
  let featuredImage = existingPage ? existingPage.featured_image : null;
  if (imageFile) {
    if (existingPage) deleteFeaturedImage(existingPage.featured_image);
    featuredImage = await saveFeaturedImage(imageFile.buffer, excludeId || 'new');
  } else if (body.featured_image_remove === '1') {
    if (existingPage) deleteFeaturedImage(existingPage.featured_image);
    featuredImage = null;
  }

  // PDF attachment
  const pdfFile = req.files && req.files['pdf_attachment'] && req.files['pdf_attachment'][0];
  let pdfAttachment = existingPage ? existingPage.pdf_attachment : null;
  if (pdfFile) {
    if (existingPage) deletePdf(existingPage.pdf_attachment);
    pdfAttachment = savePdf(pdfFile.buffer, pdfFile.originalname);
  } else if (body.pdf_attachment_remove === '1') {
    if (existingPage) deletePdf(existingPage.pdf_attachment);
    pdfAttachment = null;
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
    topic_id:     body.topic_id  ? parseInt(body.topic_id, 10)  : null,
    author_id:    body.author_id ? parseInt(body.author_id, 10) : null,
    pdf_attachment:     pdfAttachment,
    pdf_label:          (body.pdf_label || '').trim() || null,
    update_needed:      body.update_needed === 'on',
    update_needed_note: (body.update_needed_note || '').trim() || null,
    editors_note:       (body.editors_note || '').trim() || null,
  };
}

async function createPage(req, res, next) {
  try {
    const topics = await _getTopics();
    if (!req.body.title || !req.body.body || !req.body.topic_id) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/pages/form', {
        title: 'New Page — Admin', page: req.body,
        errors: ['Title, body, and topic are required.'], topics,
      });
    }
    const data = await buildPageData(req, null);
    const id   = await pagesModel.create(data);
    // Re-save image with real ID in filename (was inserted with 'new' as placeholder)
    const imageFile = (req.files && req.files['featured_image'] && req.files['featured_image'][0]) || req.file || null;
    if (imageFile && data.featured_image) {
      const newUrl = await saveFeaturedImage(imageFile.buffer, id);
      deleteFeaturedImage(data.featured_image);
      await pagesModel.update(id, { ...data, id, featured_image: newUrl });
    }
    const adminUser  = req.session.adminUser;
    const editorName = adminUser?.displayName || adminUser?.username || 'Editor';
    await logHistory(id, adminUser?.id || null, editorName, 'created', req.body.editor_log_note || null, '', data.body);
    res.redirect(`/admin/pages/${id}/edit`);
  } catch (err) { next(err); }
}

async function updatePage(req, res, next) {
  try {
    const [page, topics] = await Promise.all([pagesModel.getById(req.params.id), _getTopics()]);
    if (!page) return res.status(404).send('Page not found');
    if (!req.body.title || !req.body.body || !req.body.topic_id) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/pages/form', {
        title: `Edit: ${page.title} — Admin`,
        page: { ...page, ...req.body }, errors: ['Title, body, and topic are required.'], topics,
      });
    }
    const prevBody = page.body || '';
    const data = await buildPageData(req, page);
    await pagesModel.update(page.id, data);
    const adminUser  = req.session.adminUser;
    const editorName = adminUser?.displayName || adminUser?.username || 'Editor';
    const action = data.update_needed ? 'update_needed_flagged'
      : (prevBody === data.body && req.body.editor_log_note) ? 'reviewed'
      : 'edited';
    await logHistory(page.id, adminUser?.id || null, editorName, action, req.body.editor_log_note || null, prevBody, data.body);
    res.redirect(`/admin/pages/${page.id}/edit`);
  } catch (err) { next(err); }
}

async function deletePage(req, res, next) {
  try {
    const page = await pagesModel.getById(req.params.id);
    if (page) {
      deleteFeaturedImage(page.featured_image);
      deletePdf(page.pdf_attachment);
    }
    await pagesModel.remove(req.params.id);
    res.redirect('/admin/pages');
  } catch (err) { next(err); }
}

module.exports = { listPages, newPageForm, editPageForm, createPage, updatePage, deletePage };
