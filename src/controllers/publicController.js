const articlesModel = require('../models/articles');
const authorsModel = require('../models/authors');
const pagesModel = require('../models/pages');
const siteSettingsModel = require('../models/siteSettings');
const booksModel = require('../models/books');

function cleanExcerpt(text, maxLen = 200) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim()
    .slice(0, maxLen);
}

function withExcerpt(article) {
  if (!article) return article;
  return { ...article, excerpt: cleanExcerpt(article.excerpt || article.body) };
}

const CATEGORY_PAGE_SIZE = 12;
const AUTHOR_PAGE_SIZE = 12;
const SEARCH_PAGE_SIZE = 12;
const SEARCH_MIN_LENGTH = 2;
const NEWS_PAGE_SIZE = 18;
const HOME_GRID_SIZE = 18;
const FEATURED_ARTICLES_SIZE = 5;

async function home(req, res, next) {
  try {
    const [latest, mostViewed, onThisDay, latestPages, homeBooks] = await Promise.all([
      articlesModel.getLatestPublished({ limit: 7 }),
      articlesModel.getMostViewed({ limit: 3 }),
      articlesModel.getOnThisDay({ limit: 4 }),
      pagesModel.getLatestPublished({ limit: 3 }),
      booksModel.getLatest({ limit: 15 }),
    ]);

    const [rawLead, ...rawGrid] = latest;

    res.render('public/home', {
      title: 'Assam Portal — Gateway to Assam',
      lead: withExcerpt(rawLead),
      grid: rawGrid.map(withExcerpt),
      mostViewed: mostViewed.map(withExcerpt),
      onThisDay: onThisDay.map(withExcerpt),
      latestPages,
      homeBooks,
    });
  } catch (err) {
    next(err);
  }
}

async function newsPage(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * NEWS_PAGE_SIZE;

    const [articles, total, mostViewed] = await Promise.all([
      articlesModel.getLatestPublished({ limit: NEWS_PAGE_SIZE, offset }),
      articlesModel.countPublished(),
      articlesModel.getMostViewed({ limit: 5 }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / NEWS_PAGE_SIZE));

    res.render('public/news', {
      title: 'Latest Stories — Assam Portal',
      articles: articles.map(withExcerpt),
      mostViewed: mostViewed.map(withExcerpt),
      page,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function articleDetail(req, res, next) {
  try {
    const article = await articlesModel.getBySlug(req.params.slug);

    if (!article || article.status !== 'published') {
      return res.status(404).render('public/404', { title: 'Article Not Found' });
    }

    const related = await articlesModel.getRelatedByCategory({
      category: article.category,
      excludeId: article.id,
      limit: 5,
    });

    articlesModel.incrementViewCount(article.id).catch((err) => {
      console.error('Failed to increment view count for article', article.id, err);
    });

    res.render('public/article', {
      title: article.title,
      article,
      related,
      isAdmin: !!(req.session && req.session.adminUser),
      canonicalUrl: `${process.env.SITE_URL}/article/${article.slug}`,
    });
  } catch (err) {
    next(err);
  }
}

async function likeArticle(req, res, next) {
  try {
    const article = await articlesModel.getBySlug(req.params.slug);
    if (!article || article.status !== 'published') {
      return res.status(404).json({ error: 'Article not found' });
    }

    const likes = await articlesModel.incrementLikeCount(article.id);
    res.json({ likes });
  } catch (err) {
    next(err);
  }
}

async function categoryPage(req, res, next) {
  try {
    const category = req.params.category;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * CATEGORY_PAGE_SIZE;

    const [articles, total, mostViewed] = await Promise.all([
      articlesModel.getByCategory({ category, limit: CATEGORY_PAGE_SIZE, offset }),
      articlesModel.countByCategory(category),
      articlesModel.getMostViewed({ limit: 5 }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE));

    res.render('public/category', {
      title: `${category} — Assam Portal`,
      category,
      articles: articles.map(withExcerpt),
      mostViewed: mostViewed.map(withExcerpt),
      page,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function authorPage(req, res, next) {
  try {
    const author = await authorsModel.getByUsername(req.params.username);

    if (!author) {
      return res.status(404).render('public/404', { title: 'Author Not Found' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * AUTHOR_PAGE_SIZE;

    const [articles, total, mostViewed] = await Promise.all([
      articlesModel.getByAuthorId({ authorId: author.id, limit: AUTHOR_PAGE_SIZE, offset }),
      articlesModel.countByAuthorId(author.id),
      articlesModel.getMostViewed({ limit: 5 }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / AUTHOR_PAGE_SIZE));

    res.render('public/author', {
      title: `${author.display_name || author.username} — Assam Portal`,
      author,
      articles: articles.map(withExcerpt),
      mostViewed: mostViewed.map(withExcerpt),
      page,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function searchPage(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const mostViewed = await articlesModel.getMostViewed({ limit: 5 });

    if (q.length < SEARCH_MIN_LENGTH) {
      return res.render('public/search', {
        title: 'Search — Assam Portal',
        q,
        articles: [],
        mostViewed,
        page: 1,
        totalPages: 1,
        tooShort: q.length > 0,
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * SEARCH_PAGE_SIZE;

    const [articles, total] = await Promise.all([
      articlesModel.search({ query: q, limit: SEARCH_PAGE_SIZE, offset }),
      articlesModel.countSearch(q),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE));

    res.render('public/search', {
      title: `Search: ${q} — Assam Portal`,
      q,
      articles: articles.map(withExcerpt),
      mostViewed: mostViewed.map(withExcerpt),
      page,
      totalPages,
      tooShort: false,
    });
  } catch (err) {
    next(err);
  }
}

async function pageDetail(req, res, next) {
  try {
    const page = await pagesModel.getBySlug(req.params.slug);

    if (!page || page.status !== 'published') {
      return res.status(404).render('public/404', { title: 'Page Not Found' });
    }

    res.render('public/page', {
      title: page.title,
      page,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  home,
  newsPage,
  articleDetail,
  likeArticle,
  categoryPage,
  authorPage,
  searchPage,
  pageDetail,
};
