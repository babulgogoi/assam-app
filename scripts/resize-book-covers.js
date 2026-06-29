#!/usr/bin/env node
'use strict';

/**
 * Resize book cover images to three variants:
 *   {name}.jpg      — 999px wide (detail page)
 *   {name}-md.jpg   — 300px wide (catalogue grid)
 *   {name}-sm.jpg   — 200px wide (admin thumbnails)
 *
 * All output as progressive JPEG regardless of input format.
 * Overwrites existing variants.
 * Usage: node scripts/resize-book-covers.js [--dry-run]
 */

const sharp  = require('sharp');
const path   = require('path');
const fs     = require('fs');

const BOOKS_DIR = '/home/assam/web/assam.org/public_html/uploads/books';
const DRY_RUN   = process.argv.includes('--dry-run');

const VARIANTS = [
  { suffix: '',    width: 800 },
  { suffix: '-md', width: 300 },
  { suffix: '-sm', width: 200 },
];

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

async function processFile(filename) {
  const ext     = path.extname(filename).toLowerCase();
  const base    = path.basename(filename, ext);
  const inPath  = path.join(BOOKS_DIR, filename);

  let meta;
  try {
    meta = await sharp(inPath).metadata();
  } catch (err) {
    console.error(`  ✗ can't read ${filename}: ${err.message}`);
    return { ok: false };
  }

  const origKB  = Math.round(fs.statSync(inPath).size / 1024);
  console.log(`${filename}  ${meta.width}×${meta.height}  ${origKB}KB`);

  for (const { suffix, width } of VARIANTS) {
    const outName = `${base}${suffix}.jpg`;
    const outPath = path.join(BOOKS_DIR, outName);

    if (DRY_RUN) {
      const action = (meta.width > width) ? `resize → ${width}px` : `copy (≤${width}px)`;
      console.log(`  [dry] ${outName}  ${action}`);
      continue;
    }

    // Write to a temp file first so we never partially-overwrite the source
    const tmpPath = outPath + '.tmp';
    try {
      await sharp(inPath)
        .resize(width, null, { withoutEnlargement: true, fit: 'inside' })
        .jpeg({ quality: 82, progressive: true })
        .toFile(tmpPath);

      fs.renameSync(tmpPath, outPath);
      const outKB = Math.round(fs.statSync(outPath).size / 1024);
      const saved = origKB - outKB;
      console.log(`  ✓ ${outName}  ${outKB}KB${saved > 0 ? `  (−${saved}KB)` : ''}`);
    } catch (err) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      console.error(`  ✗ ${outName}: ${err.message}`);
    }
  }

  // If the original was .jpeg (not .jpg), delete it now that .jpg variant exists
  if (ext === '.jpeg' && !DRY_RUN) {
    const jpgPath = path.join(BOOKS_DIR, `${base}.jpg`);
    if (fs.existsSync(jpgPath)) {
      fs.unlinkSync(inPath);
      console.log(`  ✓ removed original .jpeg`);
    }
  }

  return { ok: true };
}

async function main() {
  const files = fs.readdirSync(BOOKS_DIR).sort();

  // Separate originals from already-processed variants
  const originals = files.filter(f => {
    const ext  = path.extname(f).toLowerCase();
    const base = path.basename(f, ext);
    return IMAGE_EXTS.has(ext) && !base.endsWith('-md') && !base.endsWith('-sm');
  });

  console.log(`Books dir: ${BOOKS_DIR}`);
  console.log(`Total files: ${files.length}  |  Originals to process: ${originals.length}`);
  if (DRY_RUN) console.log('(DRY RUN — no files written)\n');
  console.log('');

  let ok = 0, failed = 0;
  for (const f of originals) {
    const result = await processFile(f);
    result.ok ? ok++ : failed++;
  }

  if (!DRY_RUN) {
    const { execSync } = require('child_process');
    const du = execSync(`du -sh "${BOOKS_DIR}"`).toString().split('\t')[0];
    console.log(`\nFolder size after: ${du}`);
  }
  console.log(`\nDone.  OK: ${ok}  Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });
