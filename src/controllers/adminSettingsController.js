const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');
const siteSettingsModel = require('../models/siteSettings');

const HERO_DIR = process.env.UPLOADS_HERO_DIR || '/home/assam/web/assam.org/public_html/uploads/hero';
const HERO_URL = '/uploads/hero';

async function editSettingsForm(req, res, next) {
  try {
    const settings = await siteSettingsModel.getAll();
    res.locals.layout = 'admin/layout';
    res.render('admin/settings/form', {
      title: 'Settings — Admin',
      footerHtml: settings.footer_html,
      featuredCategory: settings.featured_category,
      settings,
    });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    await Promise.all([
      siteSettingsModel.updateFooterHtml(req.body.footer_html || ''),
      siteSettingsModel.updateFeaturedCategory((req.body.featured_category || '').trim() || 'Features'),
      siteSettingsModel.updatePublishCustomHtml(
        req.body.publish_custom_html || null,
        req.body.publish_custom_html_enabled === '1'
      ),
    ]);
    res.redirect('/admin/settings');
  } catch (err) {
    next(err);
  }
}

async function editHomepageForm(req, res, next) {
  try {
    const settings = await siteSettingsModel.getAll();
    res.locals.layout = 'admin/layout';
    const flash = req.session.flash || null;
    delete req.session.flash;
    res.render('admin/settings/homepage', {
      title: 'Homepage Settings — Admin',
      settings,
      flash,
    });
  } catch (err) { next(err); }
}

async function updateHomepage(req, res, next) {
  try {
    let hero_image = req.body.hero_image_existing || null;

    if (req.file) {
      if (!fs.existsSync(HERO_DIR)) fs.mkdirSync(HERO_DIR, { recursive: true });
      const filename = `hero-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
      const outPath = path.join(HERO_DIR, filename);
      const tmpPath = outPath + '.tmp';
      await sharp(req.file.buffer)
        .resize(1920, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 88, progressive: true })
        .toFile(tmpPath);
      fs.renameSync(tmpPath, outPath);
      hero_image = `${HERO_URL}/${filename}`;
    }

    if (req.body.hero_image_remove === '1') hero_image = null;

    await siteSettingsModel.updateHomepage({
      hero_image,
      hero_headline: (req.body.hero_headline || '').trim(),
      hero_subtext: (req.body.hero_subtext || '').trim(),
      hero_cta_text: (req.body.hero_cta_text || '').trim(),
      hero_cta_url: (req.body.hero_cta_url || '').trim(),
      hero_overlay_opacity: Math.min(1, Math.max(0, parseFloat(req.body.hero_overlay_opacity) || 0.55)),
      books_section_title: (req.body.books_section_title || 'Books About Assam').trim(),
      books_section_show_featured: req.body.books_section_show_featured === '1',
      research_section_title: (req.body.research_section_title || 'Research & Knowledge').trim(),
      custom_block_1_html: req.body.custom_block_1_html || null,
      custom_block_1_enabled: req.body.custom_block_1_enabled === '1',
      custom_block_2_html: req.body.custom_block_2_html || null,
      custom_block_2_enabled: req.body.custom_block_2_enabled === '1',
    });

    req.session.flash = { type: 'success', message: 'Homepage settings saved.' };
    res.redirect('/admin/settings/homepage');
  } catch (err) { next(err); }
}

module.exports = {
  editSettingsForm,
  updateSettings,
  editHomepageForm,
  updateHomepage,
};
