const pool = require('../config/db');

async function getAll() {
  const { rows } = await pool.query('SELECT * FROM site_settings WHERE id = 1');
  return rows[0] || {};
}

async function getFooterHtml() {
  const { rows } = await pool.query('SELECT footer_html FROM site_settings WHERE id = 1');
  return rows[0] ? rows[0].footer_html : null;
}

async function updateFooterHtml(html) {
  await pool.query('UPDATE site_settings SET footer_html = $1 WHERE id = 1', [html]);
}

async function getFeaturedCategory() {
  const { rows } = await pool.query('SELECT featured_category FROM site_settings WHERE id = 1');
  return rows[0] ? rows[0].featured_category : 'Features';
}

async function updateFeaturedCategory(category) {
  await pool.query('UPDATE site_settings SET featured_category = $1 WHERE id = 1', [category]);
}

async function updateHomepage({
  hero_image, hero_headline, hero_subtext,
  hero_cta_text, hero_cta_url, hero_overlay_opacity,
  books_section_title, books_section_show_featured,
  research_section_title,
  custom_block_1_html, custom_block_1_enabled,
  custom_block_2_html, custom_block_2_enabled,
}) {
  await pool.query(
    `UPDATE site_settings SET
       hero_image                  = $1,
       hero_headline               = $2,
       hero_subtext                = $3,
       hero_cta_text               = $4,
       hero_cta_url                = $5,
       hero_overlay_opacity        = $6,
       books_section_title         = $7,
       books_section_show_featured = $8,
       research_section_title      = $9,
       custom_block_1_html         = $10,
       custom_block_1_enabled      = $11,
       custom_block_2_html         = $12,
       custom_block_2_enabled      = $13
     WHERE id = 1`,
    [
      hero_image,
      hero_headline,
      hero_subtext,
      hero_cta_text,
      hero_cta_url,
      hero_overlay_opacity,
      books_section_title,
      books_section_show_featured,
      research_section_title,
      custom_block_1_html || null,
      custom_block_1_enabled,
      custom_block_2_html || null,
      custom_block_2_enabled,
    ]
  );
}

async function updatePublishEmail(email) {
  await pool.query('UPDATE site_settings SET publish_contact_email = $1 WHERE id = 1', [email]);
}

module.exports = {
  getAll, getFooterHtml, updateFooterHtml,
  getFeaturedCategory, updateFeaturedCategory,
  updateHomepage, updatePublishEmail,
};
