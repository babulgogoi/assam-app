'use strict';

const { record, incrementViews } = require('../models/clickEvents');

const BOT_RE = /bot|crawler|spider|curl|wget|python|java|headless|lighthouse|pingdom|uptime/i;

// Call after a public content fetch succeeds. Fire-and-forget: never awaited,
// never throws into the request cycle.
function trackView(contentType, content, req) {
  if (!content || !content.id) return;

  const ua = req.headers['user-agent'] || '';
  if (BOT_RE.test(ua)) return;
  if (req.headers.dnt === '1') return;          // respect Do Not Track
  if (req.session?.adminUser) return;           // don't count admins

  record({
    event_type: 'page_view',
    content_type: contentType,
    content_id: content.id,
    content_slug: content.slug,
    content_title: content.title,
    session_id: req.sessionID,
    referrer: req.headers.referer || null,
    user_agent: ua.slice(0, 500),
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip,
  });

  incrementViews(contentType, content.id);
}

module.exports = { trackView, BOT_RE };
