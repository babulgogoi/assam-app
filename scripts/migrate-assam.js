const mysql = require('mysql2/promise');
const { Pool } = require('pg');

// Source: D9 MySQL
const mysqlConfig = {
  host: 'localhost',
  user: 'assam_db1',
  password: 'A212312JJHHg-gghssGHGF6777a',
  database: 'assam_db1'
};

// Target: PostgreSQL
const pgPool = new Pool({
  host: 'localhost',
  user: 'assam_user',
  password: 'golaghat1',
  database: 'assam_db'
});

function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100);
}

async function migrate() {
  const conn = await mysql.createConnection(mysqlConfig);

  console.log('Starting assam.org migration...');

  // ── STEP A: Create PostgreSQL tables ──────────────

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS authors (
      id SERIAL PRIMARY KEY,
      username VARCHAR(200) UNIQUE NOT NULL,
      display_name VARCHAR(300),
      email VARCHAR(300),
      bio TEXT,
      photo VARCHAR(500),
      old_uid INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS articles (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(600) UNIQUE NOT NULL,
      body TEXT,
      excerpt TEXT,
      featured_image VARCHAR(500),
      category VARCHAR(200),
      tags TEXT[] DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'published',
      author_id INTEGER REFERENCES authors(id),
      old_node_id INTEGER UNIQUE,
      old_alias VARCHAR(500),
      published_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      views_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS articles_old_node_id_idx
      ON articles(old_node_id);
    CREATE INDEX IF NOT EXISTS articles_published_at_idx
      ON articles(published_at DESC);
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS pages (
      id SERIAL PRIMARY KEY,
      title VARCHAR(500) NOT NULL,
      slug VARCHAR(600) UNIQUE NOT NULL,
      body TEXT,
      status VARCHAR(20) DEFAULT 'published',
      author_id INTEGER REFERENCES authors(id),
      old_node_id INTEGER UNIQUE,
      old_alias VARCHAR(500),
      section VARCHAR(50) DEFAULT 'general',
      published_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log('✅ PostgreSQL tables created');

  // ── STEP B: Migrate authors/users ──────────────

  const [users] = await conn.execute(`
    SELECT uid, name, mail, created, access
    FROM users_field_data
    WHERE uid > 0
    ORDER BY uid
  `);

  let authorCount = 0;
  for (const user of users) {
    const username = user.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 50) || `user_${user.uid}`;

    try {
      await pgPool.query(`
        INSERT INTO authors (username, display_name, email, old_uid, created_at)
        VALUES ($1, $2, $3, $4, to_timestamp($5))
        ON CONFLICT (username) DO NOTHING
      `, [username, user.name, user.mail || null, user.uid, user.created]);
      authorCount++;
    } catch (e) {
      console.warn(`Author skip: ${user.name} — ${e.message}`);
    }
  }
  console.log(`✅ Migrated ${authorCount} authors`);

  // ── STEP C: Get URL aliases ──────────────

  const [aliases] = await conn.execute(`
    SELECT path, alias
    FROM path_alias
    WHERE path LIKE '/node/%'
  `);

  const aliasMap = {};
  for (const a of aliases) {
    const nid = a.path.replace('/node/', '');
    const cleanAlias = a.alias
      .replace(/^\/(pages|content|story|node)\//, '')
      .replace(/[^a-z0-9-]/gi, '-')
      .toLowerCase();
    aliasMap[nid] = cleanAlias;
  }
  console.log(`✅ Loaded ${Object.keys(aliasMap).length} URL aliases`);

  // ── STEP D: Migrate STORIES → articles ──────────

  const [stories] = await conn.execute(`
    SELECT
      n.nid, n.title, n.type,
      n.status, n.uid,
      n.created, n.changed,
      b.body_value as body,
      b.body_summary as excerpt
    FROM node_field_data n
    LEFT JOIN node__body b
      ON b.entity_id = n.nid AND b.deleted = 0
    WHERE n.type = 'story'
    ORDER BY n.nid
  `);

  let storyCount = 0;
  let storyErrors = 0;

  for (const story of stories) {
    try {
      const authorResult = await pgPool.query(
        'SELECT id FROM authors WHERE old_uid = $1',
        [story.uid]
      );
      const authorId = authorResult.rows[0]?.id || null;

      const baseSlug = aliasMap[story.nid] || generateSlug(story.title);
      const slug = `${baseSlug}-${story.nid}`;

      const body = (story.body || '')
        .replace(/\/sites\/assam\.org\/files\//g, '/uploads/legacy/')
        .replace(/\/sites\/default\/files\//g, '/uploads/legacy/');

      const excerpt = story.excerpt ||
        body.replace(/<[^>]+>/g, '').slice(0, 300);

      await pgPool.query(`
        INSERT INTO articles (
          title, slug, body, excerpt,
          status, author_id, old_node_id, old_alias,
          published_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
                  to_timestamp($9), to_timestamp($10))
        ON CONFLICT (old_node_id) DO NOTHING
      `, [
        story.title,
        slug,
        body,
        excerpt,
        story.status === 1 ? 'published' : 'draft',
        authorId,
        story.nid,
        aliasMap[story.nid] || null,
        story.created,
        story.changed
      ]);
      storyCount++;

      if (storyCount % 50 === 0) {
        console.log(`  Stories: ${storyCount}/${stories.length}`);
      }
    } catch (e) {
      storyErrors++;
      console.warn(`Story ${story.nid} error: ${e.message}`);
    }
  }
  console.log(`✅ Migrated ${storyCount} stories (${storyErrors} errors)`);

  // ── STEP E: Migrate PAGES ──────────────

  const [pages] = await conn.execute(`
    SELECT
      n.nid, n.title,
      n.status, n.uid,
      n.created, n.changed,
      b.body_value as body
    FROM node_field_data n
    LEFT JOIN node__body b
      ON b.entity_id = n.nid AND b.deleted = 0
    WHERE n.type = 'page'
    ORDER BY n.nid
  `);

  let pageCount = 0;
  let pageErrors = 0;

  for (const page of pages) {
    try {
      const authorResult = await pgPool.query(
        'SELECT id FROM authors WHERE old_uid = $1',
        [page.uid]
      );
      const authorId = authorResult.rows[0]?.id || null;

      const baseSlug = aliasMap[page.nid] || generateSlug(page.title);
      const slug = baseSlug;

      const body = (page.body || '')
        .replace(/\/sites\/assam\.org\/files\//g, '/uploads/legacy/')
        .replace(/\/sites\/default\/files\//g, '/uploads/legacy/');

      await pgPool.query(`
        INSERT INTO pages (
          title, slug, body,
          status, author_id, old_node_id, old_alias,
          published_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,
                  to_timestamp($8), to_timestamp($9))
        ON CONFLICT (old_node_id) DO NOTHING
      `, [
        page.title,
        slug,
        body,
        page.status === 1 ? 'published' : 'draft',
        authorId,
        page.nid,
        aliasMap[page.nid] || null,
        page.created,
        page.changed
      ]);
      pageCount++;
    } catch (e) {
      pageErrors++;
      console.warn(`Page ${page.nid} error: ${e.message}`);
    }
  }
  console.log(`✅ Migrated ${pageCount} pages (${pageErrors} errors)`);

  // ── STEP F: Add default editor user ──────────────

  await pgPool.query(`
    INSERT INTO authors (username, display_name, email)
    VALUES ('editor', 'Editor', 'editor@assam.org')
    ON CONFLICT (username) DO NOTHING;
  `);

  // ── STEP G: Summary ──────────────

  const articleCount = await pgPool.query('SELECT COUNT(*) FROM articles');
  const pagesCount = await pgPool.query('SELECT COUNT(*) FROM pages');
  const authorsCount = await pgPool.query('SELECT COUNT(*) FROM authors');

  console.log('\n=== Migration Complete ===');
  console.log(`Authors:  ${authorsCount.rows[0].count}`);
  console.log(`Articles: ${articleCount.rows[0].count}`);
  console.log(`Pages:    ${pagesCount.rows[0].count}`);
  console.log('========================\n');

  await conn.end();
  await pgPool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
