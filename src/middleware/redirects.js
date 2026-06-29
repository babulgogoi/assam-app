const pool = require('../config/db');

let redirectCache = null;
let cacheTime = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getRedirects() {
  const now = Date.now();
  if (redirectCache && cacheTime && now - cacheTime < CACHE_TTL) {
    return redirectCache;
  }
  const { rows } = await pool.query('SELECT old_url, new_url, type FROM redirects');
  redirectCache = {};
  for (const row of rows) {
    redirectCache[row.old_url] = { url: row.new_url, type: row.type };
  }
  cacheTime = now;
  return redirectCache;
}

// Invalidate in-memory cache (called by admin after add/delete)
function invalidateCache() {
  redirectCache = null;
  cacheTime = null;
}

async function redirectMiddleware(req, res, next) {
  try {
    if (req.method !== 'GET') return next();

    const p = req.path;

    // Quick prefix guard — only pay for cache lookup on known D9 path patterns
    const knownPrefix =
      p.startsWith('/node/') ||
      p.startsWith('/news/') ||
      p.startsWith('/content/') ||
      p.startsWith('/story/') ||
      p.startsWith('/user/') ||
      p.startsWith('/taxonomy/') ||
      p.startsWith('/pages/');

    // Also check bare slugs that could be page aliases (short, no extension, no known prefix)
    const couldBeAlias =
      !knownPrefix &&
      !p.includes('.') &&
      p.split('/').length === 2 && // single path segment: /something
      p.length > 1;

    if (!knownPrefix && !couldBeAlias) return next();

    const cache = await getRedirects();
    const match = cache[p];

    if (match) {
      pool.query('UPDATE redirects SET hits = hits + 1 WHERE old_url = $1', [p]).catch(() => {});
      return res.redirect(match.type, match.url);
    }

    next();
  } catch (err) {
    console.error('Redirect middleware error:', err);
    next();
  }
}

module.exports = redirectMiddleware;
module.exports.invalidateCache = invalidateCache;
