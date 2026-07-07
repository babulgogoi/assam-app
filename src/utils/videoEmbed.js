'use strict';

function parseVideoUrl(url) {
  if (!url || !url.trim()) return null;

  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace('www.', '');

    // ── YouTube ──────────────────────────────
    if (host === 'youtube.com' || host === 'youtu.be') {
      let videoId = null;
      if (host === 'youtu.be') {
        videoId = u.pathname.slice(1).split('?')[0];
      } else if (u.pathname === '/watch') {
        videoId = u.searchParams.get('v');
      } else if (u.pathname.startsWith('/embed/')) {
        videoId = u.pathname.split('/embed/')[1];
      } else if (u.pathname.startsWith('/shorts/')) {
        videoId = u.pathname.split('/shorts/')[1].split('?')[0];
      }
      if (videoId) return {
        platform: 'youtube',
        label: '▶ YouTube',
        embedUrl: `https://www.youtube.com/embed/${videoId}?rel=0`,
        originalUrl: url,
        type: 'iframe',
      };
    }

    // ── X / Twitter ──────────────────────────
    if (host === 'x.com' || host === 'twitter.com') {
      const match = u.pathname.match(/\/\w+\/status\/(\d+)/);
      if (match) return {
        platform: 'twitter',
        label: '𝕏 X (Twitter)',
        tweetUrl: url.replace('twitter.com', 'x.com'),
        originalUrl: url,
        type: 'twitter',
      };
    }

    // ── Facebook ─────────────────────────────
    if (host === 'facebook.com' || host === 'fb.watch') {
      return {
        platform: 'facebook',
        label: 'f Facebook',
        originalUrl: url,
        type: 'facebook',
      };
    }

  } catch (e) {
    return null;
  }
  return null;
}

module.exports = { parseVideoUrl };
