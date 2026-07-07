'use strict';

const pool = require('../config/db');
const crypto = require('crypto');

// One-way IP hash — raw IPs are never stored.
function hashIp(ip) {
  return crypto.createHash('sha256')
    .update(ip + process.env.SESSION_SECRET)
    .digest('hex')
    .slice(0, 16);
}

// Fire-and-forget insert — must never crash the app or block a response.
async function record(data) {
  try {
    await pool.query(
      `INSERT INTO click_events (
         event_type, content_type, content_id,
         content_slug, content_title,
         target_url, search_query, result_count,
         session_id, referrer, user_agent, ip_hash,
         created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())`,
      [
        data.event_type,
        data.content_type || null,
        data.content_id || null,
        data.content_slug || null,
        data.content_title || null,
        data.target_url || null,
        data.search_query || null,
        data.result_count ?? null,
        data.session_id || null,
        data.referrer || null,
        data.user_agent || null,
        data.ip ? hashIp(data.ip) : null,
      ]
    );
  } catch (err) {
    console.error('[tracking] insert failed:', err.message);
  }
}

// Increment the views counter on the content's own table.
// Articles are NOT here — they already use articles.views_count via
// articlesModel.incrementViewCount in articleDetail (don't double count).
async function incrementViews(contentType, id) {
  try {
    const tableMap = {
      book: 'books',
      blog_post: 'blog_posts',
      page: 'pages',
    };
    const table = tableMap[contentType];
    if (!table) return;
    await pool.query(
      `UPDATE ${table} SET views = COALESCE(views, 0) + 1 WHERE id = $1`,
      [id]
    );
  } catch (err) {
    console.error('[tracking] views increment failed:', err.message);
  }
}

// ── Reporting ────────────────────────────────────────────────────────────────

async function getTopContent({ contentType = null, days = 7, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT content_slug, content_title, content_type,
            COUNT(*)::int AS views,
            COUNT(DISTINCT session_id)::int AS unique_views
     FROM click_events
     WHERE event_type = 'page_view'
       AND ($1::text IS NULL OR content_type = $1)
       AND created_at >= NOW() - ($2::int * INTERVAL '1 day')
     GROUP BY content_slug, content_title, content_type
     ORDER BY views DESC
     LIMIT $3`,
    [contentType, days, limit]
  );
  return rows;
}

async function getTopSearches({ days = 7, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT search_query,
            COUNT(*)::int AS searches,
            AVG(result_count)::int AS avg_results
     FROM click_events
     WHERE event_type = 'search'
       AND search_query IS NOT NULL
       AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY search_query
     ORDER BY searches DESC
     LIMIT $2`,
    [days, limit]
  );
  return rows;
}

async function getTopOutbound({ days = 7, limit = 20 } = {}) {
  const { rows } = await pool.query(
    `SELECT target_url, content_title,
            COUNT(*)::int AS clicks
     FROM click_events
     WHERE event_type = 'outbound_click'
       AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY target_url, content_title
     ORDER BY clicks DESC
     LIMIT $2`,
    [days, limit]
  );
  return rows;
}

async function getDailyViews({ days = 30 } = {}) {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date,
            COUNT(*)::int AS total_views,
            COUNT(DISTINCT session_id)::int AS unique_visitors,
            COUNT(*) FILTER (WHERE content_type = 'article')::int AS article_views,
            COUNT(*) FILTER (WHERE content_type = 'book')::int AS book_views,
            COUNT(*) FILTER (WHERE content_type = 'blog_post')::int AS blog_views,
            COUNT(*) FILTER (WHERE content_type = 'page')::int AS page_views
     FROM click_events
     WHERE event_type = 'page_view'
       AND created_at >= NOW() - ($1::int * INTERVAL '1 day')
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    [days]
  );
  return rows;
}

async function getSummaryStats({ days = 7 } = {}) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS total_views,
       COUNT(DISTINCT session_id) FILTER (WHERE event_type = 'page_view')::int AS unique_visitors,
       COUNT(*) FILTER (WHERE event_type = 'outbound_click')::int AS outbound_clicks,
       COUNT(*) FILTER (WHERE event_type = 'search')::int AS searches,
       COUNT(DISTINCT search_query) FILTER (WHERE event_type = 'search')::int AS unique_queries
     FROM click_events
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
  return rows[0];
}

module.exports = {
  record, incrementViews,
  getTopContent, getTopSearches,
  getTopOutbound, getDailyViews, getSummaryStats,
};
