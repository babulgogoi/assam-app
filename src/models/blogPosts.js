const pool = require('../config/db');
const slugify = require('../utils/slugify');

async function _uniqueSlug(base, excludeId = null) {
  let slug = base;
  let suffix = 2;
  while (true) {
    const { rows } = await pool.query(
      `SELECT id FROM blog_posts WHERE slug = $1 ${excludeId ? 'AND id <> $2' : ''}`,
      excludeId ? [slug, excludeId] : [slug]
    );
    if (!rows.length) break;
    slug = `${base}-${suffix++}`;
  }
  return slug;
}

// admin_user_id on bp is audit-only — admin_users is deliberately NOT joined
// for display. Byline: explicit author_id, else linked book-author profile,
// else nothing (never the admin's display name).
const SELECT = `
  SELECT bp.*,
         a.display_name AS author_name, a.username AS author_username,
         ba.name AS linked_author_name, ba.photo AS linked_author_photo,
         ba.bio AS linked_author_bio, ba.slug AS linked_author_slug
  FROM blog_posts bp
  LEFT JOIN authors a ON a.id = bp.author_id
  LEFT JOIN LATERAL (
    SELECT name, photo, bio, slug FROM books_authors
    WHERE admin_user_id = bp.admin_user_id
    ORDER BY id LIMIT 1
  ) ba ON true
`;

async function getAll({ status = null, tag = null, limit = 20, offset = 0 } = {}) {
  const conditions = [];
  const values = [];
  if (status) { conditions.push(`bp.status = $${values.push(status)}`); }
  if (tag)    { conditions.push(`$${values.push(tag)} = ANY(bp.tags)`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `${SELECT} ${where}
     ORDER BY bp.published_at DESC NULLS LAST, bp.created_at DESC
     LIMIT $${values.push(limit)} OFFSET $${values.push(offset)}`,
    values
  );
  return rows;
}

async function countAll({ status = null, tag = null } = {}) {
  const conditions = [];
  const values = [];
  if (status) { conditions.push(`status = $${values.push(status)}`); }
  if (tag)    { conditions.push(`$${values.push(tag)} = ANY(tags)`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM blog_posts ${where}`, values);
  return rows[0].n;
}

async function getBySlug(slug) {
  const { rows } = await pool.query(
    `${SELECT} WHERE bp.slug = $1 AND bp.status = 'published'`,
    [slug]
  );
  return rows[0] || null;
}

async function getByAdminUser(adminUserId, { limit = 20 } = {}) {
  const { rows } = await pool.query(
    `${SELECT}
     WHERE bp.admin_user_id = $1 AND bp.status = 'published'
     ORDER BY bp.published_at DESC NULLS LAST
     LIMIT $2`,
    [adminUserId, limit]
  );
  return rows;
}

async function getById(id) {
  const { rows } = await pool.query(`${SELECT} WHERE bp.id = $1`, [id]);
  return rows[0] || null;
}

async function create({ title, slug, body, excerpt, featured_image, featured_image_caption, video_url, tags, status, admin_user_id, author_id, published_at }) {
  const base = slugify(slug || title || '');
  const finalSlug = await _uniqueSlug(base || `post-${Date.now()}`);
  const { rows } = await pool.query(
    `INSERT INTO blog_posts
       (title, slug, body, excerpt, featured_image, featured_image_caption,
        video_url, tags, status, admin_user_id, author_id, published_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
     RETURNING id`,
    [title, finalSlug, body, excerpt || null, featured_image || null,
     featured_image_caption || null, video_url || null, tags || [], status || 'draft',
     admin_user_id || null, author_id || null, published_at || null]
  );
  return rows[0].id;
}

async function update(id, { title, slug, body, excerpt, featured_image, featured_image_caption, video_url, tags, status, admin_user_id, author_id, published_at }) {
  const base = slugify(slug || title || '');
  const finalSlug = await _uniqueSlug(base || `post-${Date.now()}`, id);
  await pool.query(
    `UPDATE blog_posts SET
       title=$1, slug=$2, body=$3, excerpt=$4,
       featured_image=$5, featured_image_caption=$6, video_url=$7,
       tags=$8, status=$9, admin_user_id=$10, author_id=$11, published_at=$12,
       updated_at=NOW()
     WHERE id=$13`,
    [title, finalSlug, body, excerpt || null, featured_image || null,
     featured_image_caption || null, video_url || null, tags || [], status || 'draft',
     admin_user_id || null, author_id || null, published_at || null, id]
  );
}

async function deleteById(id) {
  await pool.query('DELETE FROM blog_posts WHERE id=$1', [id]);
}

async function getAdjacent(slug) {
  const [prevRes, nextRes] = await Promise.all([
    pool.query(
      `SELECT id, title, slug FROM blog_posts
       WHERE status = 'published'
         AND published_at < (SELECT published_at FROM blog_posts WHERE slug = $1)
       ORDER BY published_at DESC
       LIMIT 1`,
      [slug]
    ),
    pool.query(
      `SELECT id, title, slug FROM blog_posts
       WHERE status = 'published'
         AND published_at > (SELECT published_at FROM blog_posts WHERE slug = $1)
       ORDER BY published_at ASC
       LIMIT 1`,
      [slug]
    ),
  ]);
  return { prevPost: prevRes.rows[0] || null, nextPost: nextRes.rows[0] || null };
}

async function getTags() {
  const { rows } = await pool.query(
    `SELECT DISTINCT unnest(tags) AS tag FROM blog_posts
     WHERE status='published' AND array_length(tags,1) > 0
     ORDER BY tag`
  );
  return rows.map(r => r.tag);
}

async function getLatest(n = 5) {
  const { rows } = await pool.query(
    `SELECT id, title, slug, excerpt, featured_image, published_at, tags
     FROM blog_posts WHERE status='published'
     ORDER BY published_at DESC NULLS LAST LIMIT $1`,
    [n]
  );
  return rows;
}

module.exports = { getAll, countAll, getBySlug, getById, getByAdminUser, create, update, deleteById, getTags, getLatest, getAdjacent };
