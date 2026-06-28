'use strict';

const booksModel = require('../models/books');

const ADMIN_PAGE_SIZE = 20;

// ── Books ─────────────────────────────────────────────────────────────────────

async function listBooks(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const q = (req.query.q || '').trim();
    const status = req.query.status || '';
    const offset = (page - 1) * ADMIN_PAGE_SIZE;

    const [books, total] = await Promise.all([
      booksModel.listForAdmin({ limit: ADMIN_PAGE_SIZE, offset, q, status }),
      booksModel.countForAdmin({ q, status }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

    res.locals.layout = 'admin/layout';
    res.render('admin/books/list', { title: 'Books — Admin', books, q, status, page, totalPages });
  } catch (err) { next(err); }
}

async function newBookForm(req, res, next) {
  try {
    const [authors, publishers, categories] = await Promise.all([
      booksModel.listAuthors({ limit: 500 }),
      booksModel.listPublishers({ limit: 200 }),
      booksModel.listCategories(),
    ]);
    res.locals.layout = 'admin/layout';
    res.render('admin/books/form', {
      title: 'New Book — Admin',
      book: null, authors, publishers, categories,
      selectedAuthors: [], selectedCategories: [], errors: [],
    });
  } catch (err) { next(err); }
}

async function createBook(req, res, next) {
  try {
    const errors = validateBookForm(req.body);
    if (errors.length) {
      const [authors, publishers, categories] = await Promise.all([
        booksModel.listAuthors({ limit: 500 }),
        booksModel.listPublishers({ limit: 200 }),
        booksModel.listCategories(),
      ]);
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/books/form', {
        title: 'New Book — Admin',
        book: req.body, authors, publishers, categories,
        selectedAuthors: toIntArray(req.body.author_ids),
        selectedCategories: toIntArray(req.body.category_ids),
        errors,
      });
    }
    const data = await buildBookData(req.body);
    const id = await booksModel.create(data);
    res.redirect(`/admin/books/${id}/edit`);
  } catch (err) { next(err); }
}

async function editBookForm(req, res, next) {
  try {
    const book = await booksModel.getById(req.params.id);
    if (!book) return res.status(404).send('Book not found');

    const [authors, publishers, categories] = await Promise.all([
      booksModel.listAuthors({ limit: 500 }),
      booksModel.listPublishers({ limit: 200 }),
      booksModel.listCategories(),
    ]);
    const selectedAuthors = (book.authors || []).map(a => a.id);
    const selectedCategories = (book.categories || []).map(c => c.id);

    res.locals.layout = 'admin/layout';
    res.render('admin/books/form', {
      title: `Edit: ${book.title} — Admin`,
      book, authors, publishers, categories,
      selectedAuthors, selectedCategories, errors: [],
    });
  } catch (err) { next(err); }
}

async function updateBook(req, res, next) {
  try {
    const book = await booksModel.getById(req.params.id);
    if (!book) return res.status(404).send('Book not found');

    const errors = validateBookForm(req.body);
    if (errors.length) {
      const [authors, publishers, categories] = await Promise.all([
        booksModel.listAuthors({ limit: 500 }),
        booksModel.listPublishers({ limit: 200 }),
        booksModel.listCategories(),
      ]);
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/books/form', {
        title: `Edit: ${book.title} — Admin`,
        book: { ...book, ...req.body }, authors, publishers, categories,
        selectedAuthors: toIntArray(req.body.author_ids),
        selectedCategories: toIntArray(req.body.category_ids),
        errors,
      });
    }
    const data = await buildBookData(req.body, book.id);
    await booksModel.update(book.id, data);
    res.redirect(`/admin/books/${book.id}/edit`);
  } catch (err) { next(err); }
}

async function deleteBook(req, res, next) {
  try {
    await booksModel.remove(req.params.id);
    res.redirect('/admin/books');
  } catch (err) { next(err); }
}

function validateBookForm(body) {
  const errors = [];
  if (!body.title || !body.title.trim()) errors.push('Title is required.');
  return errors;
}

async function buildBookData(body, excludeId = null) {
  let baseSlug = booksModel.slugify(body.slug || body.title || '');
  if (!baseSlug) baseSlug = `book-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;
  while (await booksModel.slugExists(slug, excludeId)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }

  return {
    title: body.title.trim(),
    slug,
    subtitle: (body.subtitle || '').trim() || null,
    description: (body.description || '').trim() || null,
    cover_image: (body.cover_image || '').trim() || null,
    cover_image_alt: (body.cover_image_alt || '').trim() || null,
    price: body.price ? parseFloat(body.price) : null,
    currency: body.currency || 'INR',
    buy_url: (body.buy_url || '').trim() || null,
    isbn: (body.isbn || '').trim() || null,
    isbn13: (body.isbn13 || '').trim() || null,
    pages: body.pages ? parseInt(body.pages, 10) : null,
    language: body.language || 'English',
    published_year: body.published_year ? parseInt(body.published_year, 10) : null,
    edition: (body.edition || '').trim() || null,
    format: body.format || 'paperback',
    tags: (body.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    publisher_id: body.publisher_id ? parseInt(body.publisher_id, 10) : null,
    status: body.status === 'inactive' ? 'inactive' : 'active',
    is_featured: !!body.is_featured,
    author_ids: toIntArray(body.author_ids),
    category_ids: toIntArray(body.category_ids),
  };
}

// ── Book Authors ──────────────────────────────────────────────────────────────

async function listBookAuthors(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const authors = await booksModel.listAuthors({ limit: 200, q });
    res.locals.layout = 'admin/layout';
    res.render('admin/book-authors/list', { title: 'Book Authors — Admin', authors, q });
  } catch (err) { next(err); }
}

async function newBookAuthorForm(req, res, next) {
  res.locals.layout = 'admin/layout';
  res.render('admin/book-authors/form', { title: 'New Book Author — Admin', author: null, errors: [] });
}

async function createBookAuthor(req, res, next) {
  try {
    const errors = validateAuthorForm(req.body);
    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/book-authors/form', { title: 'New Book Author — Admin', author: req.body, errors });
    }
    const data = await buildAuthorData(req.body);
    const id = await booksModel.createAuthor(data);
    res.redirect(`/admin/book-authors/${id}/edit`);
  } catch (err) { next(err); }
}

async function editBookAuthorForm(req, res, next) {
  try {
    const author = await booksModel.getAuthorById(req.params.id);
    if (!author) return res.status(404).send('Author not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/book-authors/form', { title: `Edit: ${author.name} — Admin`, author, errors: [] });
  } catch (err) { next(err); }
}

async function updateBookAuthor(req, res, next) {
  try {
    const author = await booksModel.getAuthorById(req.params.id);
    if (!author) return res.status(404).send('Author not found');
    const errors = validateAuthorForm(req.body);
    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/book-authors/form', { title: `Edit: ${author.name} — Admin`, author: { ...author, ...req.body }, errors });
    }
    const data = await buildAuthorData(req.body, author.id);
    await booksModel.updateAuthor(author.id, data);
    res.redirect(`/admin/book-authors/${author.id}/edit`);
  } catch (err) { next(err); }
}

async function deleteBookAuthor(req, res, next) {
  try {
    await booksModel.removeAuthor(req.params.id);
    res.redirect('/admin/book-authors');
  } catch (err) { next(err); }
}

function validateAuthorForm(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('Name is required.');
  return errors;
}

async function buildAuthorData(body, excludeId = null) {
  let baseSlug = booksModel.slugify(body.slug || body.name || '');
  if (!baseSlug) baseSlug = `author-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;
  while (await booksModel.authorSlugExists(slug, excludeId)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return {
    name: body.name.trim(),
    slug,
    bio: (body.bio || '').trim() || null,
    photo: (body.photo || '').trim() || null,
    birth_year: body.birth_year ? parseInt(body.birth_year, 10) : null,
    nationality: body.nationality || 'Indian',
    website: (body.website || '').trim() || null,
    wikipedia_url: (body.wikipedia_url || '').trim() || null,
  };
}

// ── Publishers ────────────────────────────────────────────────────────────────

async function listPublishers(req, res, next) {
  try {
    const publishers = await booksModel.listPublishers({ limit: 200 });
    res.locals.layout = 'admin/layout';
    res.render('admin/book-publishers/list', { title: 'Publishers — Admin', publishers });
  } catch (err) { next(err); }
}

async function newPublisherForm(req, res, next) {
  res.locals.layout = 'admin/layout';
  res.render('admin/book-publishers/form', { title: 'New Publisher — Admin', publisher: null, errors: [] });
}

async function createPublisher(req, res, next) {
  try {
    const errors = validatePublisherForm(req.body);
    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/book-publishers/form', { title: 'New Publisher — Admin', publisher: req.body, errors });
    }
    const data = await buildPublisherData(req.body);
    const id = await booksModel.createPublisher(data);
    res.redirect(`/admin/book-publishers/${id}/edit`);
  } catch (err) { next(err); }
}

async function editPublisherForm(req, res, next) {
  try {
    const publisher = await booksModel.getPublisherById(req.params.id);
    if (!publisher) return res.status(404).send('Publisher not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/book-publishers/form', { title: `Edit: ${publisher.name} — Admin`, publisher, errors: [] });
  } catch (err) { next(err); }
}

async function updatePublisher(req, res, next) {
  try {
    const publisher = await booksModel.getPublisherById(req.params.id);
    if (!publisher) return res.status(404).send('Publisher not found');
    const errors = validatePublisherForm(req.body);
    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/book-publishers/form', { title: `Edit: ${publisher.name} — Admin`, publisher: { ...publisher, ...req.body }, errors });
    }
    const data = await buildPublisherData(req.body, publisher.id);
    await booksModel.updatePublisher(publisher.id, data);
    res.redirect(`/admin/book-publishers/${publisher.id}/edit`);
  } catch (err) { next(err); }
}

async function deletePublisher(req, res, next) {
  try {
    await booksModel.removePublisher(req.params.id);
    res.redirect('/admin/book-publishers');
  } catch (err) { next(err); }
}

function validatePublisherForm(body) {
  const errors = [];
  if (!body.name || !body.name.trim()) errors.push('Name is required.');
  return errors;
}

async function buildPublisherData(body, excludeId = null) {
  let baseSlug = booksModel.slugify(body.slug || body.name || '');
  if (!baseSlug) baseSlug = `publisher-${Date.now()}`;
  let slug = baseSlug;
  let suffix = 2;
  while (await booksModel.publisherSlugExists(slug, excludeId)) {
    slug = `${baseSlug}-${suffix}`;
    suffix++;
  }
  return {
    name: body.name.trim(),
    slug,
    description: (body.description || '').trim() || null,
    logo: (body.logo || '').trim() || null,
    website: (body.website || '').trim() || null,
    location: (body.location || '').trim() || null,
    founded_year: body.founded_year ? parseInt(body.founded_year, 10) : null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIntArray(val) {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr.map(v => parseInt(v, 10)).filter(n => !isNaN(n));
}

module.exports = {
  listBooks, newBookForm, createBook, editBookForm, updateBook, deleteBook,
  listBookAuthors, newBookAuthorForm, createBookAuthor, editBookAuthorForm, updateBookAuthor, deleteBookAuthor,
  listPublishers, newPublisherForm, createPublisher, editPublisherForm, updatePublisher, deletePublisher,
};
