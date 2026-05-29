// Converts heavy raster assets in /public to WebP (keeps originals as fallback).
// Run with: node scripts/optimize-images.mjs
import sharp from 'sharp';
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const PUBLIC_DIR = new URL('../public', import.meta.url).pathname;

// PWA / manifest icons must stay PNG — skip them.
const SKIP = new Set([
  '48x48.png',
  '180x180.png',
  '192x192.png',
  '512x512.png',
]);

const EXTS = new Set(['.png', '.jpg', '.jpeg']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'rive-backups') continue;
      out.push(...(await walk(full)));
    } else if (EXTS.has(extname(entry.name).toLowerCase()) && !SKIP.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = await walk(PUBLIC_DIR);
let savedTotal = 0;

for (const file of files) {
  const out = file.replace(/\.(png|jpe?g)$/i, '.webp');
  const before = (await stat(file)).size;
  await sharp(file)
    .webp({ quality: 78, effort: 6 })
    .toFile(out);
  const after = (await stat(out)).size;
  savedTotal += before - after;
  const rel = file.replace(PUBLIC_DIR + '/', '');
  console.log(
    `${rel.padEnd(28)} ${(before / 1024).toFixed(0).padStart(6)} KB -> ${(after / 1024).toFixed(0).padStart(6)} KB  (-${(((before - after) / before) * 100).toFixed(0)}%)`
  );
}

console.log(`\nTotal saved: ${(savedTotal / 1024 / 1024).toFixed(2)} MB`);
