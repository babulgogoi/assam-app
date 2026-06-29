const pool = require('../config/db');

const PAGE_SELECT = `
  SELECT p.id, p.slug, p.title, p.body, p.status,
         p.excerpt, p.featured_image, p.featured_image_caption,
         p.references_text, p.tags, p.topic_id,
         p.created_at, p.updated_at,
         pt.name AS topic_name, pt.slug AS topic_slug, pt.icon AS topic_icon
  FROM pages p
  LEFT JOIN page_topics pt ON pt.id = p.topic_id
`;

async function getBySlug(slug) {
  const { rows } = await pool.query(
    `${PAGE_SELECT} WHERE p.slug = $1`,
    [slug]
  );
  const row = rows[0];
  if (!row) return null;
  return _hydrate(row);
}

async function getById(id) {
  const { rows } = await pool.query(
    `${PAGE_SELECT} WHERE p.id = $1`,
    [id]
  );
  const row = rows[0];
  if (!row) return null;
  return _hydrate(row);
}

function _hydrate(row) {
  const topic = row.topic_id
    ? { id: row.topic_id, name: row.topic_name, slug: row.topic_slug, icon: row.topic_icon }
    : null;
  return { ...row, topic };
}

async function getAllForAdmin() {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.status, p.updated_at,
            pt.name AS topic_name, pt.icon AS topic_icon
     FROM pages p
     LEFT JOIN page_topics pt ON pt.id = p.topic_id
     ORDER BY p.title ASC`
  );
  return rows;
}

async function getAllPublished() {
  const { rows } = await pool.query(
    `SELECT id, slug, title FROM pages WHERE status = 'published' ORDER BY title ASC`
  );
  return rows;
}

async function getLatestPublished({ limit = 3 } = {}) {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.body, p.excerpt, p.featured_image,
            pt.name AS topic_name, pt.slug AS topic_slug, pt.icon AS topic_icon
     FROM pages p
     LEFT JOIN page_topics pt ON pt.id = p.topic_id
     WHERE p.status = 'published'
     ORDER BY p.updated_at DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getByTopicSlug(topicSlug) {
  const { rows } = await pool.query(
    `SELECT p.id, p.slug, p.title, p.excerpt, p.featured_image, p.updated_at
     FROM pages p
     JOIN page_topics pt ON pt.id = p.topic_id AND pt.slug = $1
     WHERE p.status = 'published'
     ORDER BY p.title ASC`,
    [topicSlug]
  );
  return rows;
}

async function slugExists(slug, excludeId = null) {
  const params = excludeId ? [slug, excludeId] : [slug];
  const { rows } = await pool.query(
    `SELECT 1 FROM pages WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''} LIMIT 1`,
    params
  );
  return rows.length > 0;
}

async function create({ slug, title, body, status, excerpt, featured_image,
  featured_image_caption, references_text, tags, topic_id }) {
  const { rows } = await pool.query(
    `INSERT INTO pages
       (slug, title, body, status, excerpt, featured_image,
        featured_image_caption, references_text, tags, topic_id,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
     RETURNING id`,
    [slug, title, body, status, excerpt || null, featured_image || null,
     featured_image_caption || null, references_text || null,
     tags || [], topic_id || null]
  );
  return rows[0].id;
}

async function update(id, { slug, title, body, status, excerpt, featured_image,
  featured_image_caption, references_text, tags, topic_id }) {
  await pool.query(
    `UPDATE pages SET
       slug=$1, title=$2, body=$3, status=$4,
       excerpt=$5, featured_image=$6, featured_image_caption=$7,
       references_text=$8, tags=$9, topic_id=$10,
       updated_at=now()
     WHERE id=$11`,
    [slug, title, body, status, excerpt || null, featured_image || null,
     featured_image_caption || null, references_text || null,
     tags || [], topic_id || null, id]
  );
}

async function remove(id) {
  await pool.query('DELETE FROM pages WHERE id = $1', [id]);
}

async function listTopics() {
  const { rows } = await pool.query(
    `SELECT pt.*, COUNT(p.id)::int AS page_count
     FROM page_topics pt
     LEFT JOIN pages p ON p.topic_id = pt.id AND p.status = 'published'
     GROUP BY pt.id
     ORDER BY pt.sort_order, pt.name`
  );
  return rows;
}

async function listTopicsAdmin() {
  const { rows } = await pool.query(
    `SELECT pt.*, COUNT(p.id)::int AS page_count
     FROM page_topics pt
     LEFT JOIN pages p ON p.topic_id = pt.id
     GROUP BY pt.id
     ORDER BY pt.sort_order, pt.name`
  );
  return rows;
}

async function createTopic({ name, slug, description, icon, sort_order }) {
  const { rows } = await pool.query(
    `INSERT INTO page_topics (name, slug, description, icon, sort_order)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [name, slug, description || null, icon || null, sort_order || 0]
  );
  return rows[0].id;
}

async function updateTopic(id, { name, description, icon, sort_order }) {
  await pool.query(
    `UPDATE page_topics SET name=$1, description=$2, icon=$3, sort_order=$4 WHERE id=$5`,
    [name, description || null, icon || null, sort_order || 0, id]
  );
}

async function deleteTopic(id) {
  await pool.query('UPDATE pages SET topic_id=NULL WHERE topic_id=$1', [id]);
  await pool.query('DELETE FROM page_topics WHERE id=$1', [id]);
}

async function getTopicBySlug(slug) {
  const { rows } = await pool.query('SELECT * FROM page_topics WHERE slug=$1', [slug]);
  return rows[0] || null;
}

module.exports = {
  getBySlug, getById, getAllForAdmin, getAllPublished,
  getLatestPublished, getByTopicSlug, slugExists,
  create, update, remove,
  listTopics, listTopicsAdmin, createTopic, updateTopic, deleteTopic, getTopicBySlug,
};
