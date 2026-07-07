'use strict';

const clickEvents = require('../models/clickEvents');

const ALLOWED_PERIODS = [7, 30, 90];

async function show(req, res, next) {
  try {
    let days = parseInt(req.query.days, 10) || 7;
    if (!ALLOWED_PERIODS.includes(days)) days = 7;

    const [summary, daily, topPages, topArticles, topBlog, topBooks, searches, outbound] =
      await Promise.all([
        clickEvents.getSummaryStats({ days }),
        clickEvents.getDailyViews({ days }),
        clickEvents.getTopContent({ contentType: 'page', days, limit: 10 }),
        clickEvents.getTopContent({ contentType: 'article', days, limit: 10 }),
        clickEvents.getTopContent({ contentType: 'blog_post', days, limit: 10 }),
        clickEvents.getTopContent({ contentType: 'book', days, limit: 10 }),
        clickEvents.getTopSearches({ days, limit: 15 }),
        clickEvents.getTopOutbound({ days, limit: 10 }),
      ]);

    res.locals.layout = 'admin/layout';
    res.render('admin/analytics', {
      title: 'Analytics — Admin',
      days, summary, daily,
      topPages, topArticles, topBlog, topBooks,
      searches, outbound,
    });
  } catch (err) { next(err); }
}

module.exports = { show };
