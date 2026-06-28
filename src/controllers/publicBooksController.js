'use strict';

const booksModel = require('../models/books');

const PAGE_SIZE = 16;

async function catalogue(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [books, featured, categories, total] = await Promise.all([
      booksModel.getLatest({ limit: PAGE_SIZE, offset }),
      booksModel.getFeatured({ limit: 4 }),
      booksModel.listCategories(),
      booksModel.countActive(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    res.render('public/books', {
      title: 'Books About Assam — Assam Portal',
      books, featured, categories, total, page, totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function bookDetail(req, res, next) {
  try {
    const book = await booksModel.getBySlug(req.params.slug);
    if (!book) return res.status(404).render('public/404', { title: 'Book Not Found' });

    let related = [];
    if (book.authors && book.authors.length > 0) {
      const all = await booksModel.getByAuthor(book.authors[0].slug, { limit: 5 });
      related = all.filter(b => b.id !== book.id).slice(0, 4);
    }

    res.render('public/book', {
      title: `${book.title} — Assam Portal Books`,
      book, related,
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

    res.render('public/books-author', {
      title: `${author.name} — Assam Portal Books`,
      author, books,
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

module.exports = { catalogue, bookDetail, categoryPage, authorPage, publisherPage, rateBook };
