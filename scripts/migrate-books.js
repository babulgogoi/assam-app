#!/usr/bin/env node
'use strict';

/**
 * Migrate 587 WooCommerce books → PostgreSQL books tables.
 * Parses the MySQL dump as text — no MySQL instance required.
 * Copies cover images to public_html/uploads/books/.
 *
 * Usage: node scripts/migrate-books.js [--dry-run]
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const SQL_DUMP = path.join(__dirname, '../migrations/books/wp/booknook1-2026-06-28-2d8e948.sql');
const WP_UPLOADS = path.join(__dirname, '../migrations/books/wp/wp-content/uploads');
const BOOKS_DEST = '/home/assam/web/assam.org/public_html/uploads/books';
const DRY_RUN = process.argv.includes('--dry-run');

const pool = new Pool({
  host:     process.env.DB_HOST || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// ── MySQL dump parser ─────────────────────────────────────────────────────────

// Walk a line and find the VALUES block end, tracking string context
// to avoid stopping at semicolons inside quoted values.
function findValuesEnd(line, start) {
  let i = start;
  let inStr = false;
  while (i < line.length) {
    if (!inStr && line[i] === ';') break;
    if (!inStr && line[i] === "'") { inStr = true; i++; continue; }
    if (inStr && line[i] === '\\') { i += 2; continue; } // skip escaped char
    if (inStr && line[i] === "'")  { inStr = false; i++; continue; }
    i++;
  }
  return i;
}

function parseValues(str) {
  const rows = [];
  let i = 0;
  while (i < str.length) {
    while (i < str.length && str[i] !== '(') i++;
    if (i >= str.length) break;
    i++; // skip '('
    const row = [];
    while (i < str.length) {
      // skip whitespace between values
      while (i < str.length && (str[i] === ' ' || str[i] === '\t')) i++;
      if (str[i] === ')') break;
      if (str[i] === "'") {
        i++; // skip opening quote
        let val = '';
        while (i < str.length) {
          if (str[i] === '\\') {
            i++;
            const esc = str[i] || '';
            if      (esc === 'n') val += '\n';
            else if (esc === 't') val += '\t';
            else if (esc === 'r') val += '\r';
            else                  val += esc;
            i++;
          } else if (str[i] === "'") {
            i++; // closing quote
            break;
          } else {
            val += str[i++];
          }
        }
        row.push(val);
      } else if (str.slice(i, i + 4) === 'NULL') {
        row.push(null);
        i += 4;
      } else {
        let val = '';
        while (i < str.length && str[i] !== ',' && str[i] !== ')') val += str[i++];
        row.push(val === '' ? null : isNaN(val) ? val : Number(val));
      }
      if (str[i] === ',') i++; // skip intra-row comma
    }
    rows.push(row);
    if (str[i] === ')') i++; // skip ')'
    if (str[i] === ',') i++; // skip inter-row comma
  }
  return rows;
}

function extractTable(content, table) {
  const prefix = `INSERT INTO \`${table}\` VALUES `;
  const lines = content.split('\n');
  const allRows = [];
  for (const line of lines) {
    const idx = line.indexOf(prefix);
    if (idx === -1) continue;
    const start = idx + prefix.length;
    const end = findValuesEnd(line, start);
    allRows.push(...parseValues(line.slice(start, end)));
  }
  return allRows;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200) || 'book';
}

function decodeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#039;/g, "'").replace(/&#39;/g, "'");
}

function stripTags(str) {
  return str ? str.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyImage(relPath, productId) {
  if (!relPath) return null;
  const src = path.join(WP_UPLOADS, relPath);
  if (!fs.existsSync(src)) return null;
  const ext  = path.extname(relPath);
  const base = path.basename(relPath, ext).replace(/[^a-z0-9_-]/gi, '-').slice(0, 80);
  const dest = path.join(BOOKS_DEST, `${productId}-${base}${ext}`);
  if (!DRY_RUN) fs.copyFileSync(src, dest);
  return `/uploads/books/${productId}-${base}${ext}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Reading SQL dump (${Math.round(fs.statSync(SQL_DUMP).size / 1e6)}MB)…`);
  const content = fs.readFileSync(SQL_DUMP, 'utf8');

  // ── Parse tables ──────────────────────────────────────────────────────────
  console.log('Parsing wp_posts…');
  const posts = extractTable(content, 'wp_posts');
  // cols: 0=ID,1=author,2=date,3=dateGmt,4=content,5=title,6=excerpt,
  //       7=status,8=commentStatus,9=pingStatus,10=password,11=name,
  //       12=toPing,13=pinged,14=modified,15=modifiedGmt,16=contentFiltered,
  //       17=parent,18=guid,19=menuOrder,20=type,21=mimeType,22=commentCount
  const products = new Map();
  const attachments = new Map(); // id → name (slug/url-part)
  for (const p of posts) {
    if (p[20] === 'product' && p[7] === 'publish') {
      products.set(Number(p[0]), {
        id: Number(p[0]),
        title: decodeHtml(String(p[5] || '')),
        slug:  String(p[11] || ''),
        content: stripTags(String(p[4] || '')),
        date: p[2],
      });
    }
    if (p[20] === 'attachment') {
      attachments.set(Number(p[0]), String(p[11] || ''));
    }
  }
  console.log(`  ${products.size} products, ${attachments.size} attachments`);

  console.log('Parsing wp_postmeta…');
  const postmeta = extractTable(content, 'wp_postmeta');
  // cols: 0=meta_id,1=post_id,2=meta_key,3=meta_value
  const meta = {}; // productId → {price, thumbnail_id, attached_file}
  for (const r of postmeta) {
    const pid = Number(r[1]);
    const key = String(r[2]);
    const val = r[3];
    if (!meta[pid]) meta[pid] = {};
    if (key === '_regular_price') meta[pid].price = val;
    if (key === '_thumbnail_id')  meta[pid].thumbnail_id = Number(val);
    if (key === '_wp_attached_file') meta[pid].attached_file = String(val || '');
  }

  console.log('Parsing wp_terms…');
  const termsRows = extractTable(content, 'wp_terms');
  // cols: 0=term_id,1=name,2=slug,3=term_group
  const terms = new Map(); // term_id → {name, slug}
  for (const r of termsRows) {
    terms.set(Number(r[0]), { name: decodeHtml(String(r[1] || '')), slug: String(r[2] || '') });
  }

  console.log('Parsing wp_term_taxonomy…');
  const ttRows = extractTable(content, 'wp_term_taxonomy');
  // cols: 0=term_taxonomy_id,1=term_id,2=taxonomy,3=description,4=parent,5=count
  const termTax = new Map(); // term_taxonomy_id → {term_id, taxonomy}
  const termIdToTax = new Map(); // term_id → taxonomy (first seen)
  for (const r of ttRows) {
    const ttid = Number(r[0]);
    const tid  = Number(r[1]);
    const tax  = String(r[2] || '');
    termTax.set(ttid, { term_id: tid, taxonomy: tax });
    if (!termIdToTax.has(tid)) termIdToTax.set(tid, tax);
  }

  console.log('Parsing wp_term_relationships…');
  const trRows = extractTable(content, 'wp_term_relationships');
  // cols: 0=object_id,1=term_taxonomy_id,2=term_order
  const productCats = {}; // productId → [term_id, ...]
  for (const r of trRows) {
    const oid  = Number(r[0]);
    const ttid = Number(r[1]);
    if (!products.has(oid)) continue;
    const tt = termTax.get(ttid);
    if (!tt) continue;
    if (tt.taxonomy === 'product_cat') {
      if (!productCats[oid]) productCats[oid] = [];
      productCats[oid].push(tt.term_id);
    }
  }

  console.log('Parsing wp_wc_product_attributes_lookup…');
  const attrRows = extractTable(content, 'wp_wc_product_attributes_lookup');
  // cols: 0=product_id,1=product_or_parent_id,2=taxonomy,3=term_id,4=is_variation,5=in_stock
  const productAuthors = {}; // productId → [term_id, ...]
  const productFormats = {}; // productId → term_id
  for (const r of attrRows) {
    const pid  = Number(r[0]);
    const tax  = String(r[2] || '');
    const tid  = Number(r[3]);
    if (tax === 'pa_book-author') {
      if (!productAuthors[pid]) productAuthors[pid] = [];
      productAuthors[pid].push(tid);
    }
    if (tax === 'pa_format') {
      productFormats[pid] = tid;
    }
  }

  // ── Build cover image map: thumbnail_id → file path ──────────────────────
  const coverPaths = {}; // productId → relative path under wp-content/uploads
  for (const [pid] of products) {
    const m = meta[pid];
    if (!m || !m.thumbnail_id) continue;
    const thMeta = meta[m.thumbnail_id];
    if (thMeta && thMeta.attached_file) {
      coverPaths[pid] = thMeta.attached_file;
    }
  }

  // ── Map WooCommerce categories → DB category slugs ───────────────────────
  // WC category names → books_categories slug mapping
  const CAT_MAP = {
    'arts & literature':  'arts-literature',
    'arts':               'arts-literature',
    'biography':          'biography',
    'biographies':        'biography',
    'historical fiction': 'historical-fiction',
    'history, philosophy, political science etc.': 'history',
    'history':            'history',
    'romance':            'romance',
    'kids':               'children',
    'children':           'children',
    'fiction':            'fiction',
    'non-fiction':        'non-fiction',
    'literature':         'literature',
    'poetry':             'poetry',
    'academic':           'academic',
    'culture':            'culture',
  };

  // ── Ensure destination dir exists ─────────────────────────────────────────
  if (!DRY_RUN) ensureDir(BOOKS_DEST);

  // ── Load existing DB category slugs ──────────────────────────────────────
  const catRows = await pool.query('SELECT id, slug, name FROM books_categories');
  const catBySlug = {};
  for (const r of catRows.rows) catBySlug[r.slug] = r.id;

  // ── Migrate books ─────────────────────────────────────────────────────────
  let created = 0, skipped = 0, errors = 0;
  const slugsSeen = new Set();

  for (const [pid, product] of products) {
    try {
      // Skip if already imported
      const existing = await pool.query('SELECT id FROM books WHERE woo_product_id = $1', [pid]);
      if (existing.rows.length) { skipped++; continue; }

      // -- Cover image
      let coverUrl = null;
      if (coverPaths[pid]) {
        coverUrl = copyImage(coverPaths[pid], pid);
      }

      // -- Authors: find or create book_authors
      const authorTermIds = productAuthors[pid] || [];
      const authorDbIds = [];
      for (const tid of authorTermIds) {
        const term = terms.get(tid);
        if (!term || !term.name) continue;
        const aSlug = slugify(term.name);
        if (!DRY_RUN) {
          const res = await pool.query(
            `INSERT INTO books_authors (name, slug) VALUES ($1, $2)
             ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [term.name, aSlug]
          );
          authorDbIds.push(res.rows[0].id);
        }
      }

      // -- Format
      const formatTid = productFormats[pid];
      let format = 'paperback';
      if (formatTid) {
        const ft = terms.get(formatTid);
        if (ft) format = ft.name.toLowerCase().replace(/\s+/g, '') === 'hardcover' ? 'hardcover' : 'paperback';
      }

      // -- Price
      const price = meta[pid] && meta[pid].price ? parseFloat(meta[pid].price) : null;

      // -- Unique slug
      let baseSlug = slugify(product.slug || product.title);
      if (!baseSlug) baseSlug = `book-${pid}`;
      let slug = baseSlug;
      let suffix = 2;
      while (slugsSeen.has(slug) || (await pool.query('SELECT id FROM books WHERE slug=$1', [slug])).rows.length) {
        slug = `${baseSlug}-${suffix++}`;
      }
      slugsSeen.add(slug);

      // -- Description (strip WP block comments)
      const desc = product.content
        ? product.content.replace(/<!-- wp:[^-].*?-->/g, '').trim() || null
        : null;

      if (DRY_RUN) {
        console.log(`[DRY] ${pid} | ${product.title.slice(0, 60)} | ₹${price} | cover:${coverUrl ? 'yes' : 'no'} | authors:${authorTermIds.length} | format:${format}`);
        created++;
        continue;
      }

      // -- Insert book
      const bookRes = await pool.query(
        `INSERT INTO books
           (title, slug, description, cover_image, price, format, status, woo_product_id)
         VALUES ($1,$2,$3,$4,$5,$6,'active',$7)
         ON CONFLICT (woo_product_id) DO NOTHING
         RETURNING id`,
        [product.title, slug, desc, coverUrl, price, format, pid]
      );
      if (!bookRes.rows.length) { skipped++; continue; }
      const bookId = bookRes.rows[0].id;

      // -- Link authors
      for (let i = 0; i < authorDbIds.length; i++) {
        await pool.query(
          'INSERT INTO books_book_authors (book_id, author_id, sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [bookId, authorDbIds[i], i]
        );
      }

      // -- Link categories
      const wcCatTermIds = productCats[pid] || [];
      for (const tid of wcCatTermIds) {
        const term = terms.get(tid);
        if (!term) continue;
        const normName = term.name.toLowerCase().trim();
        const dbSlug = CAT_MAP[normName] || null;
        if (dbSlug && catBySlug[dbSlug]) {
          await pool.query(
            'INSERT INTO books_book_categories (book_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [bookId, catBySlug[dbSlug]]
          );
        }
      }

      created++;
      if (created % 50 === 0) console.log(`  ${created} books migrated…`);
    } catch (err) {
      errors++;
      console.error(`  Error on product ${pid} (${product.title.slice(0, 40)}):`, err.message);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped (already exists): ${skipped}, Errors: ${errors}`);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
