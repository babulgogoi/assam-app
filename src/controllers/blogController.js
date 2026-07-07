const blogPosts = require('../models/blogPosts');
const { parseVideoUrl } = require('../utils/videoEmbed');
const { trackView } = require('../middleware/trackPageView');

const PAGE_SIZE = 6;

async function listPosts(req, res, next) {
  try {
    const tag    = (req.query.tag || '').trim() || null;
    const page   = Math.max(1, parseInt(req.query.page, 10) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const [posts, total, tags] = await Promise.all([
      blogPosts.getAll({ status: 'published', tag, limit: PAGE_SIZE, offset }),
      blogPosts.countAll({ status: 'published', tag }),
      blogPosts.getTags(),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    res.render('blog/list', {
      title: 'The Assam Review | Assam Portal',
      posts,
      tags,
      activeTag: tag,
      page,
      totalPages,
      total,
    });
  } catch (err) { next(err); }
}

async function showPost(req, res, next) {
  try {
    const post = await blogPosts.getBySlug(req.params.slug);
    if (!post) return res.status(404).render('public/404', { title: 'Not Found' });
    trackView('blog_post', post, req);
    const { prevPost, nextPost } = await blogPosts.getAdjacent(req.params.slug);
    const videoEmbed = parseVideoUrl(post.video_url);
    res.render('blog/post', {
      title: `${post.title} | The Assam Review`,
      post,
      videoEmbed,
      prevPost,
      nextPost,
    });
  } catch (err) { next(err); }
}

module.exports = { listPosts, showPost };
