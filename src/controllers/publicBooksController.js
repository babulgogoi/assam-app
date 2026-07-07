'use strict';

const booksModel = require('../models/books');
const blogPostsModel = require('../models/blogPosts');
const { trackView } = require('../middleware/trackPageView');

const PAGE_SIZE = 15; // 3 rows × 5 columns

async function catalogue(req, res, next) {
  try {
    const currentPage = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q        = (req.query.q    || '').trim();
    const language = (req.query.lang || '').trim() || null;
    const offset   = (currentPage - 1) * PAGE_SIZE;

    const [books, total, categories, languages] = await Promise.all([
      q ? booksModel.search(q, { limit: PAGE_SIZE, offset, language })
        : booksModel.getLatest({ limit: PAGE_SIZE, offset, language }),
      q ? booksModel.searchCount(q, { language })
        : booksModel.countActive({ language }),
      booksModel.listCategories(),
      booksModel.getLanguages(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    res.render('public/books', {
      title: q ? `"${q}" — Books — Assam Portal` : 'Books About Assam — Assam Portal',
      books, categories, languages, total, currentPage, totalPages, q, language,
    });
  } catch (err) {
    next(err);
  }
}

async function searchCatalogue(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.redirect('/books');
  res.redirect(`/books?q=${encodeURIComponent(q)}`);
}

async function bookDetail(req, res, next) {
  try {
    const book = await booksModel.getBySlug(req.params.slug);
    if (!book) return res.status(404).render('public/404', { title: 'Book Not Found' });
    trackView('book', book, req);

    const authorIds   = (book.authors   || []).map(a => a.id);
    const categoryIds = (book.categories || []).map(c => c.id);
    const relatedBooks = await booksModel.getRelatedBooks(book.id, authorIds, categoryIds);

    res.render('public/book', {
      title: `${book.title} — Assam Portal Books`,
      book, relatedBooks,
      adminUser: req.session && req.session.adminUser ? req.session.adminUser : null,
    });
  } catch (err) {
    next(err);
  }
}

async function categoryPage(req, res, next) {
  try {
    const category = await booksModel.getCategoryBySlug(req.params.slug);
    if (!category) return res.status(404).render('public/404', { title: 'Category Not Found' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [books, total] = await Promise.all([
      booksModel.getByCategory(req.params.slug, { limit: PAGE_SIZE, offset }),
      booksModel.countByCategory(req.params.slug),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    res.render('public/books-category', {
      title: `${category.name} Books — Assam Portal`,
      category, books, page, totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function authorPage(req, res, next) {
  try {
    const author = await booksModel.getAuthorBySlug(req.params.slug);
    if (!author) return res.status(404).render('public/404', { title: 'Author Not Found' });

    const books = await booksModel.getByAuthor(req.params.slug, { limit: 50 });
    const blogPostsByAuthor = author.admin_user_id
      ? await blogPostsModel.getByAdminUser(author.admin_user_id, { limit: 20 })
      : [];

    res.render('public/books-author', {
      title: `${author.name} — Assam Portal Books`,
      author, books, blogPostsByAuthor,
      adminUser: req.session && req.session.adminUser ? req.session.adminUser : null,
    });
  } catch (err) {
    next(err);
  }
}

async function publisherPage(req, res, next) {
  try {
    const publisher = await booksModel.getPublisherBySlug(req.params.slug);
    if (!publisher) return res.status(404).render('public/404', { title: 'Publisher Not Found' });

    const books = await booksModel.getByPublisher(req.params.slug, { limit: 50 });

    res.render('public/books-publisher', {
      title: `${publisher.name} — Assam Portal Books`,
      publisher, books,
      adminUser: req.session && req.session.adminUser ? req.session.adminUser : null,
    });
  } catch (err) {
    next(err);
  }
}

async function rateBook(req, res, next) {
  try {
    const rating = parseInt(req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Invalid rating' });
    }
    await booksModel.addRating(parseInt(req.params.id, 10), rating);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { catalogue, searchCatalogue, bookDetail, categoryPage, authorPage, publisherPage, rateBook };
