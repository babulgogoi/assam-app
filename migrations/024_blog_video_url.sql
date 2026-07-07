-- 024: video embed URL (YouTube / X / Facebook) on blog posts
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS video_url VARCHAR(1000);
