const pagesModel = require('../models/pages');
const slugify    = require('../utils/slugify');

async function listTopics(req, res, next) {
  try {
    const topics = await pagesModel.listTopicsAdmin();
    res.locals.layout = 'admin/layout';
    res.render('admin/page-topics/list', {
      title: 'Page Topics — Admin',
      topics,
      saved:   !!req.query.saved,
      deleted: !!req.query.deleted,
    });
  } catch (err) { next(err); }
}

async function createTopic(req, res, next) {
  try {
    const { name, description, icon, sort_order } = req.body;
    if (!name) return res.redirect('/admin/page-topics');
    const slug = slugify(name).slice(0, 100) || `topic-${Date.now()}`;
    await pagesModel.createTopic({ name, slug, description, icon, sort_order: parseInt(sort_order, 10) || 0 });
    res.redirect('/admin/page-topics?saved=1');
  } catch (err) { next(err); }
}

async function updateTopic(req, res, next) {
  try {
    const { name, description, icon, sort_order } = req.body;
    await pagesModel.updateTopic(req.params.id, {
      name, description, icon, sort_order: parseInt(sort_order, 10) || 0,
    });
    res.redirect('/admin/page-topics?saved=1');
  } catch (err) { next(err); }
}

async function deleteTopic(req, res, next) {
  try {
    await pagesModel.deleteTopic(req.params.id);
    res.redirect('/admin/page-topics?deleted=1');
  } catch (err) { next(err); }
}

module.exports = { listTopics, createTopic, updateTopic, deleteTopic };
