const mysql = require('mysql2/promise');
const { Pool } = require('pg');

const mysqlConfig = {
  host: 'localhost',
  user: 'assam_db1',
  password: 'A212312JJHHg-gghssGHGF6777a',
  database: 'assam_db1'
};

const pgPool = new Pool({
  host: 'localhost',
  user: 'assam_user',
  password: 'golaghat1',
  database: 'assam_db'
});

async function backfill() {
  console.log('Connecting to D9 MySQL...');
  const conn = await mysql.createConnection(mysqlConfig);
  console.log('Connected.\n');

  // ── PAGES ──────────────────────────────────────
  console.log('Processing pages...');
  const pages = await pgPool.query(`
    SELECT id, title, old_node_id
    FROM pages
    WHERE old_node_id IS NOT NULL
    ORDER BY old_node_id
  `);
  console.log(`Found ${pages.rows.length} pages with old_node_id\n`);

  let pUpdated = 0;
  let pMissed = 0;

  for (const page of pages.rows) {
    const [rows] = await conn.execute(`
      SELECT nid, created, changed
      FROM node_field_data
      WHERE nid = ?
      LIMIT 1
    `, [page.old_node_id]);

    if (!rows.length) {
      pMissed++;
      console.log(`  NOT FOUND in D9: nid=${page.old_node_id} "${page.title}"`);
      continue;
    }

    const d9 = rows[0];
    await pgPool.query(`
      UPDATE pages SET
        d9_created_at = to_timestamp($1),
        d9_updated_at = to_timestamp($2)
      WHERE id = $3
    `, [d9.created, d9.changed, page.id]);

    pUpdated++;
  }
  console.log(`Pages — updated: ${pUpdated}, not found: ${pMissed}\n`);

  // ── ARTICLES ───────────────────────────────────
  console.log('Processing articles...');
  const articles = await pgPool.query(`
    SELECT id, title, old_node_id
    FROM articles
    WHERE old_node_id IS NOT NULL
    ORDER BY old_node_id
    LIMIT 600
  `);
  console.log(`Found ${articles.rows.length} articles\n`);

  let aUpdated = 0;
  let aMissed = 0;

  for (const article of articles.rows) {
    const [rows] = await conn.execute(`
      SELECT nid, created, changed
      FROM node_field_data
      WHERE nid = ?
      LIMIT 1
    `, [article.old_node_id]);

    if (!rows.length) { aMissed++; continue; }

    const d9 = rows[0];
    await pgPool.query(`
      UPDATE articles SET
        d9_created_at = to_timestamp($1),
        d9_updated_at = to_timestamp($2)
      WHERE id = $3
    `, [d9.created, d9.changed, article.id]);

    aUpdated++;
    if (aUpdated % 100 === 0) {
      console.log(`  ${aUpdated}/${articles.rows.length}...`);
    }
  }
  console.log(`Articles — updated: ${aUpdated}, not found: ${aMissed}\n`);

  // ── VERIFY ─────────────────────────────────────
  const sample = await pgPool.query(`
    SELECT title, old_node_id,
      d9_created_at::date as d9_created,
      d9_updated_at::date as d9_updated
    FROM pages
    WHERE d9_created_at IS NOT NULL
    LIMIT 5
  `);
  console.log('Sample pages with D9 dates:');
  sample.rows.forEach(r => {
    console.log(`  [${r.old_node_id}] ${r.title.slice(0, 40)} — created: ${r.d9_created} updated: ${r.d9_updated}`);
  });

  await conn.end();
  await pgPool.end();
  console.log('\nBackfill complete.');
}

backfill().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
