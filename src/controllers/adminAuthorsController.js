const authorsModel = require('../models/authors');
const { urlFor, deleteUploadedFile } = require('../middleware/upload');

const PAGE_SIZE = 50;

async function listAuthors(req, res, next) {
  try {
    const q    = (req.query.q || '').trim() || null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [authors, total] = await Promise.all([
      authorsModel.getAllWithCounts({ q, limit: PAGE_SIZE, offset }),
      authorsModel.countAll({ q }),
    ]);

    res.locals.layout = 'admin/layout';
    res.render('admin/authors/list', {
      title: 'Authors — Admin',
      authors,
      q: q || '',
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
      deleted: req.query.deleted === '1',
    });
  } catch (err) {
    next(err);
  }
}

function newAuthorForm(req, res) {
  res.locals.layout = 'admin/layout';
  res.render('admin/authors/form', {
    title: 'New Author — Admin',
    author: null,
    errors: [],
    saved: false,
  });
}

async function editAuthorForm(req, res, next) {
  try {
    const author = await authorsModel.getById(req.params.id);
    if (!author) return res.status(404).send('Author not found');
    res.locals.layout = 'admin/layout';
    res.render('admin/authors/form', {
      title: `Edit: ${author.display_name || author.username} — Admin`,
      author,
      errors: [],
      saved: req.query.saved === '1',
    });
  } catch (err) {
    next(err);
  }
}

function resolvePhoto(req, existingPhoto) {
  const files = req.files || {};
  if (files.photo && files.photo[0]) {
    return urlFor('photo', files.photo[0].filename);
  }
  if (req.body.remove_photo) return null;
  return req.body.existing_photo || existingPhoto || null;
}

async function createAuthor(req, res, next) {
  try {
    const username = (req.body.username || '').trim();
    const errors = [];
    if (!username) {
      errors.push('Username is required.');
    } else if (await authorsModel.isUsernameTaken(username)) {
      errors.push(`Username "${username}" is already taken.`);
    }

    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/authors/form', {
        title: 'New Author — Admin',
        author: req.body,
        errors,
        saved: false,
      });
    }

    const id = await authorsModel.create({
      username,
      email:       (req.body.email || '').trim(),
      displayName: (req.body.display_name || '').trim(),
      bio:         req.body.bio,
      photo:       resolvePhoto(req, null),
    });
    res.redirect(`/admin/authors/${id}/edit?saved=1`);
  } catch (err) {
    next(err);
  }
}

async function updateAuthor(req, res, next) {
  try {
    const author = await authorsModel.getById(req.params.id);
    if (!author) return res.status(404).send('Author not found');

    const username = (req.body.username || '').trim();
    const errors = [];
    if (!username) {
      errors.push('Username is required.');
    } else if (await authorsModel.isUsernameTaken(username, author.id)) {
      errors.push(`Username "${username}" is already taken.`);
    }

    if (errors.length) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/authors/form', {
        title: `Edit: ${author.display_name || author.username} — Admin`,
        author: { ...author, ...req.body },
        errors,
        saved: false,
      });
    }

    const photo = resolvePhoto(req, author.photo);
    if (author.photo && author.photo !== photo) deleteUploadedFile(author.photo);

    await authorsModel.update(author.id, {
      username,
      email:       (req.body.email || '').trim(),
      displayName: (req.body.display_name || '').trim(),
      bio:         req.body.bio,
      photo,
    });
    res.redirect(`/admin/authors/${author.id}/edit?saved=1`);
  } catch (err) {
    next(err);
  }
}

async function deleteAuthor(req, res, next) {
  try {
    const author = await authorsModel.getById(req.params.id);
    if (!author) return res.redirect('/admin/authors');

    // Block delete if author has articles (FK would reject it anyway, but give a clear message)
    const db = require('../config/db');
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM articles WHERE author_id = $1`,
      [author.id]
    );
    if (rows[0].n > 0) {
      res.locals.layout = 'admin/layout';
      return res.status(400).render('admin/authors/form', {
        title: `Edit: ${author.display_name || author.username} — Admin`,
        author,
        errors: [`Cannot delete — this author has ${rows[0].n} article(s). Reassign them first.`],
        saved: false,
      });
    }

    if (author.photo) deleteUploadedFile(author.photo);
    await authorsModel.deleteById(author.id);
    res.redirect('/admin/authors?deleted=1');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAuthors,
  newAuthorForm,
  editAuthorForm,
  createAuthor,
  updateAuthor,
  deleteAuthor,
};
