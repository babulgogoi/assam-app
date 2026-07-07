const path  = require('path');
const fs    = require('fs');
const sharp = require('sharp');
const blogPosts = require('../models/blogPosts');
const slugify   = require('../utils/slugify');

const BLOG_DIR    = process.env.UPLOADS_BLOG_DIR || '/home/assam/web/assam.org/public_html/uploads/blog';
const BLOG_PREFIX = '/uploads/blog';

async function saveBlogImage(buffer, postId) {
  if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });
  const base = `blog-${postId}-${Date.now()}`;
  const full  = path.join(BLOG_DIR, `${base}.jpg`);
  const small = path.join(BLOG_DIR, `${base}-sm.jpg`);
  await Promise.all([
    sharp(buffer).resize(1200, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 85, progressive: true }).toFile(full + '.tmp')
      .then(() => { fs.renameSync(full + '.tmp', full); fs.chmodSync(full, 0o644); }),
    sharp(buffer).resize(400, null, { withoutEnlargement: true, fit: 'inside' })
      .jpeg({ quality: 80, progressive: true }).toFile(small + '.tmp')
      .then(() => { fs.renameSync(small + '.tmp', small); fs.chmodSync(small, 0o644); }),
  ]);
  return `${BLOG_PREFIX}/${base}.jpg`;
}

function deleteBlogImage(url) {
  if (!url || !url.startsWith(BLOG_PREFIX)) return;
  const base = path.basename(url, '.jpg');
  [base + '.jpg', base + '-sm.jpg'].forEach(f => {
    const p = path.join(BLOG_DIR, f);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  });
}

function buildPostData(req, existingPost) {
  const body = req.body;
  const isSuperAdmin = req.session?.adminUser?.isSuperAdmin;
  const slug = isSuperAdmin
    ? (body.slug || '').trim() || slugify(body.title || '')
    : (existingPost ? existingPost.slug : slugify(body.title || ''));

  const tags = (body.tags || '').split(',').map(t => t.trim()).filter(Boolean);

  // submit_action (from button) takes precedence over the status select to avoid
  // array collision when both share the name "status".
  const status = body.submit_action === 'published' ? 'published' : 'draft';

  let published_at = existingPost?.published_at || null;
  if (status === 'published' && !published_at) {
    published_at = body.published_at ? new Date(body.published_at) : new Date();
  } else if (body.published_at) {
    published_at = new Date(body.published_at);
  }

  const author_id    = body.author_id ? parseInt(body.author_id, 10) : null;
  const admin_user_id = req.session.adminUser?.id || null;

  return {
    title:                   body.title,
    slug,
    body:                    body.body,
    excerpt:                 (body.excerpt || '').trim() || null,
    featured_image_caption:  (body.featured_image_caption || '').trim() || null,
    video_url:               (body.video_url || '').trim() || null,
    tags,
    status,
    author_id,
    admin_user_id,
    published_at,
  };
}

async function list(req, res, next) {
  try {
    const posts = await blogPosts.getAll({ limit: 200 });
    res.locals.layout = 'admin/layout';
    res.render('admin/blog/list', {
      title: 'The Assam Review — Admin',
      posts,
      deleted: req.query.deleted === '1',
    });
  } catch (err) { next(err); }
}

async function newForm(req, res, next) {
  res.locals.layout = 'admin/layout';
  res.render('admin/blog/form', { title: 'New Blog Post — Admin', post: null, errors: [], saved: false });
}

async function create(req, res, next) {
  try {
    if (!req.body.title || !req.body.body) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/blog/form', {
        title: 'New Blog Post — Admin', post: req.body,
        errors: ['Title and body are required.'], saved: false,
      });
    }
    const data = buildPostData(req, null);
    const id   = await blogPosts.create(data);

    if (req.file) {
      const imageUrl = await saveBlogImage(req.file.buffer, id);
      await blogPosts.update(id, { ...data, featured_image: imageUrl });
    }

    res.redirect(`/admin/blog/${id}/edit`);
  } catch (err) { next(err); }
}

async function editForm(req, res, next) {
  try {
    const post = await blogPosts.getById(req.params.id);
    if (!post) return res.status(404).send('Post not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/blog/form', {
      title: `Edit: ${post.title} — Admin`,
      post,
      errors: [],
      saved: req.query.saved === '1',
    });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const post = await blogPosts.getById(req.params.id);
    if (!post) return res.status(404).send('Post not found');

    if (!req.body.title || !req.body.body) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/blog/form', {
        title: `Edit: ${post.title} — Admin`,
        post: { ...post, ...req.body }, errors: ['Title and body are required.'], saved: false,
      });
    }

    let featuredImage = post.featured_image;
    if (req.file) {
      deleteBlogImage(post.featured_image);
      featuredImage = await saveBlogImage(req.file.buffer, post.id);
    } else if (req.body.featured_image_remove === '1') {
      deleteBlogImage(post.featured_image);
      featuredImage = null;
    }

    const data = buildPostData(req, post);
    await blogPosts.update(post.id, { ...data, featured_image: featuredImage });
    res.redirect(`/admin/blog/${post.id}/edit?saved=1`);
  } catch (err) { next(err); }
}

async function del(req, res, next) {
  try {
    const post = await blogPosts.getById(req.params.id);
    if (post) deleteBlogImage(post.featured_image);
    await blogPosts.deleteById(req.params.id);
    res.redirect('/admin/blog?deleted=1');
  } catch (err) { next(err); }
}

module.exports = { list, newForm, create, editForm, update, del };
