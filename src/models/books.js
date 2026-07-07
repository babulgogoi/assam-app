'use strict';

const db = require('../config/db');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const BOOK_SELECT = `
  SELECT b.*,
    COALESCE((
      SELECT json_agg(
        json_build_object('id', ba_a.id, 'name', ba_a.name, 'slug', ba_a.slug, 'role', bba_a.role)
        ORDER BY bba_a.sort_order
      )
      FROM books_book_authors bba_a
      JOIN books_authors ba_a ON ba_a.id = bba_a.author_id
      WHERE bba_a.book_id = b.id
    ), '[]') AS authors,
    COALESCE(
      json_agg(
        DISTINCT jsonb_build_object('id', bc.id, 'name', bc.name, 'slug', bc.slug)
      ) FILTER (WHERE bc.id IS NOT NULL),
      '[]'
    ) AS categories,
    p.name AS publisher_name,
    p.slug AS publisher_slug,
    CASE WHEN b.rating_count > 0
      THEN ROUND(b.rating_sum::numeric / b.rating_count, 1)
      ELSE NULL END AS avg_rating
  FROM books b
  LEFT JOIN books_book_authors bba ON bba.book_id = b.id
  LEFT JOIN books_authors ba ON ba.id = bba.author_id
  LEFT JOIN books_book_categories bbc ON bbc.book_id = b.id
  LEFT JOIN books_categories bc ON bc.id = bbc.category_id
  LEFT JOIN books_publishers p ON p.id = b.publisher_id
`;

async function getLatest({ limit = 16, offset = 0, language = null } = {}) {
  const conds  = [`b.status = 'active'`];
  const params = [];
  if (language) conds.push(`b.language = $${params.push(language)}`);
  params.push(limit);
  params.push(offset);
  const { rows } = await db.query(
    `${BOOK_SELECT}
     WHERE ${conds.join(' AND ')}
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function countActive({ language = null } = {}) {
  const conds  = [`status = 'active'`];
  const params = [];
  if (language) conds.push(`language = $${params.push(language)}`);
  const { rows } = await db.query(
    `SELECT COUNT(*) FROM books WHERE ${conds.join(' AND ')}`,
    params
  );
  return parseInt(rows[0].count, 10);
}

async function getLanguages() {
  const { rows } = await db.query(
    `SELECT language, COUNT(*)::int AS count
     FROM books
     WHERE status = 'active' AND language IS NOT NULL AND language <> ''
     GROUP BY language
     ORDER BY count DESC, language`
  );
  return rows;
}

// Lightweight list for the homepage language blocks. Same `authors` shape as
// the home() inline queries so views/partials/book-card.ejs renders it as-is.
// exclude:true inverts the match ("all books EXCEPT this language", NULLs included).
async function getLatestByLanguage(language, limit = 12, { exclude = false } = {}) {
  const langCond = exclude ? 'b.language IS DISTINCT FROM $1' : 'b.language = $1';
  const { rows } = await db.query(
    `SELECT b.id, b.title, b.slug, b.language, b.cover_image, b.cover_image_alt,
            b.price, b.amazon_url,
            COALESCE(json_agg(json_build_object('name', ba.name, 'slug', ba.slug)
              ORDER BY bba.sort_order) FILTER (WHERE ba.id IS NOT NULL), '[]') AS authors
     FROM books b
     LEFT JOIN books_book_authors bba ON bba.book_id = b.id
     LEFT JOIN books_authors ba ON ba.id = bba.author_id
     WHERE b.status = 'active' AND ${langCond}
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT $2`,
    [language, limit]
  );
  return rows;
}

// Latest books, all languages — same row shape as getLatestByLanguage.
async function getLatestAll(limit = 6) {
  const { rows } = await db.query(
    `SELECT b.id, b.title, b.slug, b.language, b.cover_image, b.cover_image_alt,
            b.price, b.amazon_url,
            COALESCE(json_agg(json_build_object('name', ba.name, 'slug', ba.slug)
              ORDER BY bba.sort_order) FILTER (WHERE ba.id IS NOT NULL), '[]') AS authors
     FROM books b
     LEFT JOIN books_book_authors bba ON bba.book_id = b.id
     LEFT JOIN books_authors ba ON ba.id = bba.author_id
     WHERE b.status = 'active'
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getFeatured({ limit = 4 } = {}) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     WHERE b.status = 'active' AND b.is_featured = true
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

async function getBySlug(slug) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     WHERE b.slug = $1 AND b.status = 'active'
     GROUP BY b.id, p.name, p.slug`,
    [slug]
  );
  return rows[0] || null;
}

async function getByCategory(categorySlug, { limit = 16, offset = 0 } = {}) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     JOIN books_book_categories bbc2 ON bbc2.book_id = b.id
     JOIN books_categories bc2 ON bc2.id = bbc2.category_id AND bc2.slug = $1
     WHERE b.status = 'active'
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.created_at DESC
     LIMIT $2 OFFSET $3`,
    [categorySlug, limit, offset]
  );
  return rows;
}

async function countByCategory(categorySlug) {
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT b.id) FROM books b
     JOIN books_book_categories bbc ON bbc.book_id = b.id
     JOIN books_categories bc ON bc.id = bbc.category_id
     WHERE bc.slug = $1 AND b.status = 'active'`,
    [categorySlug]
  );
  return parseInt(rows[0].count, 10);
}

async function getByAuthor(authorSlug, { limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     JOIN books_book_authors bba2 ON bba2.book_id = b.id
     JOIN books_authors ba2 ON ba2.id = bba2.author_id AND ba2.slug = $1
     WHERE b.status = 'active'
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.published_year DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [authorSlug, limit, offset]
  );
  return rows;
}

async function getByPublisher(publisherSlug, { limit = 16, offset = 0 } = {}) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     JOIN books_publishers p2 ON p2.id = b.publisher_id AND p2.slug = $1
     WHERE b.status = 'active'
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.published_year DESC NULLS LAST
     LIMIT $2 OFFSET $3`,
    [publisherSlug, limit, offset]
  );
  return rows;
}

async function search(query, { limit = 20, offset = 0, language = null } = {}) {
  const params = [`%${query}%`];
  const langFilter = language ? `AND b.language = $${params.push(language)}` : '';
  params.push(limit);
  params.push(offset);
  const { rows } = await db.query(
    `${BOOK_SELECT}
     WHERE b.status = 'active'
       AND (b.title ILIKE $1 OR b.description ILIKE $1 OR b.isbn ILIKE $1 OR ba.name ILIKE $1)
       ${langFilter}
     GROUP BY b.id, p.name, p.slug
     ORDER BY b.title
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getById(id) {
  const { rows } = await db.query(
    `${BOOK_SELECT}
     WHERE b.id = $1
     GROUP BY b.id, p.name, p.slug`,
    [id]
  );
  return rows[0] || null;
}

async function slugExists(slug, excludeId = null) {
  const { rows } = await db.query(
    'SELECT id FROM books WHERE slug = $1 AND ($2::int IS NULL OR id != $2)',
    [slug, excludeId]
  );
  return rows.length > 0;
}

async function create(data) {
  const { rows } = await db.query(
    `INSERT INTO books
       (title, slug, subtitle, description, cover_image, cover_image_alt,
        price, currency, buy_url, isbn, isbn13, pages, language,
        published_year, edition, format, tags, publisher_id,
        status, is_featured, woo_product_id,
        author_interview_url, blog_url, video_url, amazon_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     RETURNING id`,
    [
      data.title, data.slug, data.subtitle || null, data.description || null,
      data.cover_image || null, data.cover_image_alt || null,
      data.price || null, data.currency || 'INR', data.buy_url || null,
      data.isbn || null, data.isbn13 || null, data.pages || null,
      data.language || 'English', data.published_year || null,
      data.edition || null, data.format || 'paperback',
      data.tags || [], data.publisher_id || null,
      data.status || 'active', data.is_featured || false,
      data.woo_product_id || null,
      data.author_interview_url || null, data.blog_url || null, data.video_url || null,
      data.amazon_url || null,
    ]
  );
  const bookId = rows[0].id;
  await setAuthors(bookId, data.author_ids || []);
  await setCategories(bookId, data.category_ids || []);
  return bookId;
}

async function update(id, data) {
  await db.query(
    `UPDATE books SET
       title=$1, slug=$2, subtitle=$3, description=$4, cover_image=$5,
       cover_image_alt=$6, price=$7, currency=$8, buy_url=$9, isbn=$10,
       isbn13=$11, pages=$12, language=$13, published_year=$14, edition=$15,
       format=$16, tags=$17, publisher_id=$18, status=$19, is_featured=$20,
       author_interview_url=$21, blog_url=$22, video_url=$23, amazon_url=$24,
       updated_at=NOW()
     WHERE id=$25`,
    [
      data.title, data.slug, data.subtitle || null, data.description || null,
      data.cover_image || null, data.cover_image_alt || null,
      data.price || null, data.currency || 'INR', data.buy_url || null,
      data.isbn || null, data.isbn13 || null, data.pages || null,
      data.language || 'English', data.published_year || null,
      data.edition || null, data.format || 'paperback',
      data.tags || [], data.publisher_id || null,
      data.status || 'active', data.is_featured || false,
      data.author_interview_url || null, data.blog_url || null, data.video_url || null,
      data.amazon_url || null,
      id,
    ]
  );
  await setAuthors(id, data.author_ids || []);
  await setCategories(id, data.category_ids || []);
}

async function remove(id) {
  await db.query('DELETE FROM books WHERE id = $1', [id]);
}

async function setAuthors(bookId, authorIds) {
  await db.query('DELETE FROM books_book_authors WHERE book_id = $1', [bookId]);
  for (let i = 0; i < authorIds.length; i++) {
    await db.query(
      'INSERT INTO books_book_authors (book_id, author_id, sort_order) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [bookId, authorIds[i], i]
    );
  }
}

async function setCategories(bookId, categoryIds) {
  await db.query('DELETE FROM books_book_categories WHERE book_id = $1', [bookId]);
  for (const catId of categoryIds) {
    await db.query(
      'INSERT INTO books_book_categories (book_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [bookId, catId]
    );
  }
}

async function addRating(bookId, rating) {
  await db.query(
    'UPDATE books SET rating_sum = rating_sum + $1, rating_count = rating_count + 1 WHERE id = $2',
    [rating, bookId]
  );
}

async function listForAdmin({ limit = 20, offset = 0, q = '', status = '', lang = '' } = {}) {
  const params = [];
  let where = 'WHERE 1=1';
  if (q) { params.push(`%${q}%`); where += ` AND (b.title ILIKE $${params.length} OR b.isbn ILIKE $${params.length})`; }
  if (status) { params.push(status); where += ` AND b.status = $${params.length}`; }
  if (lang) { params.push(lang); where += ` AND b.language = $${params.length}`; }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT b.id, b.title, b.slug, b.status, b.is_featured, b.price, b.format, b.language, b.cover_image,
            b.created_at, p.name AS publisher_name,
            COALESCE(string_agg(DISTINCT ba.name, ', '), '—') AS author_names
     FROM books b
     LEFT JOIN books_publishers p ON p.id = b.publisher_id
     LEFT JOIN books_book_authors bba ON bba.book_id = b.id
     LEFT JOIN books_authors ba ON ba.id = bba.author_id
     ${where}
     GROUP BY b.id, p.name
     ORDER BY b.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function countForAdmin({ q = '', status = '', lang = '' } = {}) {
  const params = [];
  let where = 'WHERE 1=1';
  if (q) { params.push(`%${q}%`); where += ` AND (title ILIKE $${params.length} OR isbn ILIKE $${params.length})`; }
  if (status) { params.push(status); where += ` AND status = $${params.length}`; }
  if (lang) { params.push(lang); where += ` AND language = $${params.length}`; }
  const { rows } = await db.query(`SELECT COUNT(*) FROM books ${where}`, params);
  return parseInt(rows[0].count, 10);
}

// Book Authors
async function getAuthorBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM books_authors WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function getAuthorById(id) {
  const { rows } = await db.query('SELECT * FROM books_authors WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listAuthors({ limit = 50, offset = 0, q = '' } = {}) {
  const params = [];
  let where = '';
  if (q) { params.push(`%${q}%`); where = `WHERE name ILIKE $1`; }
  params.push(limit, offset);
  const { rows } = await db.query(
    `SELECT a.*, COUNT(bba.book_id) AS book_count
     FROM books_authors a
     LEFT JOIN books_book_authors bba ON bba.author_id = a.id
     ${where}
     GROUP BY a.id
     ORDER BY a.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function createAuthor(data) {
  const { rows } = await db.query(
    `INSERT INTO books_authors (name, slug, bio, photo, birth_year, nationality, website, wikipedia_url, admin_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [data.name, data.slug, data.bio || null, data.photo || null,
     data.birth_year || null, data.nationality || 'Indian',
     data.website || null, data.wikipedia_url || null, data.admin_user_id || null]
  );
  return rows[0].id;
}

async function updateAuthor(id, data) {
  await db.query(
    `UPDATE books_authors SET name=$1, slug=$2, bio=$3, photo=$4, birth_year=$5,
     nationality=$6, website=$7, wikipedia_url=$8, admin_user_id=$9 WHERE id=$10`,
    [data.name, data.slug, data.bio || null, data.photo || null,
     data.birth_year || null, data.nationality || 'Indian',
     data.website || null, data.wikipedia_url || null, data.admin_user_id || null, id]
  );
}

async function removeAuthor(id) {
  await db.query('DELETE FROM books_authors WHERE id = $1', [id]);
}

async function authorSlugExists(slug, excludeId = null) {
  const { rows } = await db.query(
    'SELECT id FROM books_authors WHERE slug = $1 AND ($2::int IS NULL OR id != $2)',
    [slug, excludeId]
  );
  return rows.length > 0;
}

// Publishers
async function getPublisherBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM books_publishers WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function getPublisherById(id) {
  const { rows } = await db.query('SELECT * FROM books_publishers WHERE id = $1', [id]);
  return rows[0] || null;
}

async function listPublishers({ limit = 50, offset = 0 } = {}) {
  const { rows } = await db.query(
    `SELECT p.*, COUNT(b.id) AS book_count
     FROM books_publishers p
     LEFT JOIN books b ON b.publisher_id = p.id
     GROUP BY p.id
     ORDER BY p.name
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

async function createPublisher(data) {
  const { rows } = await db.query(
    `INSERT INTO books_publishers (name, slug, description, logo, website, location, founded_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [data.name, data.slug, data.description || null, data.logo || null,
     data.website || null, data.location || null, data.founded_year || null]
  );
  return rows[0].id;
}

async function updatePublisher(id, data) {
  await db.query(
    `UPDATE books_publishers SET name=$1, slug=$2, description=$3, logo=$4,
     website=$5, location=$6, founded_year=$7 WHERE id=$8`,
    [data.name, data.slug, data.description || null, data.logo || null,
     data.website || null, data.location || null, data.founded_year || null, id]
  );
}

async function removePublisher(id) {
  await db.query('DELETE FROM books_publishers WHERE id = $1', [id]);
}

async function publisherSlugExists(slug, excludeId = null) {
  const { rows } = await db.query(
    'SELECT id FROM books_publishers WHERE slug = $1 AND ($2::int IS NULL OR id != $2)',
    [slug, excludeId]
  );
  return rows.length > 0;
}

// Categories
async function listCategories() {
  const { rows } = await db.query(
    `SELECT c.*, COUNT(bbc.book_id) AS book_count
     FROM books_categories c
     LEFT JOIN books_book_categories bbc ON bbc.category_id = c.id
     GROUP BY c.id
     HAVING COUNT(bbc.book_id) > 0
     ORDER BY c.sort_order, c.name`
  );
  return rows;
}

async function searchCount(query, { language = null } = {}) {
  const params = [`%${query}%`];
  const langFilter = language ? `AND b.language = $${params.push(language)}` : '';
  const { rows } = await db.query(
    `SELECT COUNT(DISTINCT b.id) FROM books b
     LEFT JOIN books_book_authors bba ON bba.book_id = b.id
     LEFT JOIN books_authors ba ON ba.id = bba.author_id
     WHERE b.status = 'active'
       AND (b.title ILIKE $1 OR b.isbn ILIKE $1 OR ba.name ILIKE $1)
       ${langFilter}`,
    params
  );
  return parseInt(rows[0].count, 10);
}

async function getCategoryBySlug(slug) {
  const { rows } = await db.query('SELECT * FROM books_categories WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function getRelatedBooks(bookId, authorIds, categoryIds) {
  let relatedA = [];
  if (authorIds && authorIds.length > 0) {
    const { rows } = await db.query(
      `SELECT b.id, b.title, b.slug, b.cover_image, b.price, b.published_year,
         COALESCE(
           json_agg(json_build_object('name', ba.name, 'slug', ba.slug) ORDER BY bba.sort_order)
           FILTER (WHERE ba.id IS NOT NULL), '[]'
         ) AS authors
       FROM books b
       JOIN books_book_authors bba ON bba.book_id = b.id
       JOIN books_authors ba ON ba.id = bba.author_id
       WHERE ba.id = ANY($1::int[])
         AND b.id != $2
         AND b.status = 'active'
       GROUP BY b.id
       ORDER BY b.published_year DESC NULLS LAST
       LIMIT 4`,
      [authorIds, bookId]
    );
    relatedA = rows;
  }

  if (relatedA.length >= 4 || !categoryIds || categoryIds.length === 0) return relatedA;

  const remaining = 4 - relatedA.length;
  const excludeIds = [bookId, ...relatedA.map(b => b.id)];

  const { rows: relatedB } = await db.query(
    `SELECT b.id, b.title, b.slug, b.cover_image, b.price, b.published_year,
       COALESCE(
         json_agg(json_build_object('name', ba.name, 'slug', ba.slug))
         FILTER (WHERE ba.id IS NOT NULL), '[]'
       ) AS authors
     FROM books b
     JOIN books_book_categories bbc ON bbc.book_id = b.id
     LEFT JOIN books_book_authors bba ON bba.book_id = b.id
     LEFT JOIN books_authors ba ON ba.id = bba.author_id
     WHERE bbc.category_id = ANY($1::int[])
       AND b.id != ALL($2::int[])
       AND b.status = 'active'
     GROUP BY b.id
     ORDER BY RANDOM()
     LIMIT $3`,
    [categoryIds, excludeIds, remaining]
  );

  return [...relatedA, ...relatedB];
}

async function searchAuthors(q) {
  const { rows } = await db.query(
    `SELECT id, name, nationality FROM books_authors WHERE name ILIKE $1 ORDER BY name LIMIT 10`,
    [`%${q}%`]
  );
  return rows;
}

module.exports = {
  slugify,
  getLatest, countActive, getFeatured,
  getBySlug, getByCategory, countByCategory,
  getByAuthor, getByPublisher, search,
  getById, slugExists, create, update, remove,
  addRating, listForAdmin, countForAdmin,
  getAuthorBySlug, getAuthorById, listAuthors,
  createAuthor, updateAuthor, removeAuthor, authorSlugExists,
  getPublisherBySlug, getPublisherById, listPublishers,
  createPublisher, updatePublisher, removePublisher, publisherSlugExists,
  listCategories, searchCount, getCategoryBySlug, searchAuthors, getRelatedBooks,
  getLanguages, getLatestByLanguage, getLatestAll,
};
