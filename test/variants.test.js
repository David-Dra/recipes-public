// Own WebP sizes made from Cookbook's full.jpg (its thumb.jpg is only 144 px).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { syncOnce, loadIndex } from '../src/sync.js';
import { makeDav } from '../src/webdav.js';
import { startFakeDav } from './fake-webdav.js';

const R = '/Shared/Recipes';
const jpeg = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toBuffer();

async function setup(t, full) {
  const tr = {
    [R]: { dir: true },
    [`${R}/Bowl`]: { dir: true, id: '301' },
    [`${R}/Bowl/recipe.json`]: { body: JSON.stringify({ name: 'Bowl' }) },
    [`${R}/Bowl/full.jpg`]: { body: full },
  };
  const fake = await startFakeDav(tr);
  t.after(fake.close);
  const dataDir = mkdtempSync(join(tmpdir(), 'var-'));
  const logs = [];
  return { tr, dataDir, logs, opts: { dav: makeDav({ url: fake.url, user: fake.user, password: fake.password }), sharePath: R, dataDir,
    log: (m) => logs.push(m) } };
}

test('three WebP sizes, never wider than the photo', async (t) => {
  const { dataDir, opts } = await setup(t, await jpeg(1200, 2000));
  await syncOnce(opts);
  const img = loadIndex(dataDir).recipes[0].image;
  assert.match(img.w480, /^301-[0-9a-f]{8}-480\.webp$/);
  const widths = await Promise.all(['w480', 'w960', 'w1600'].map(async (k) => (await sharp(join(dataDir, 'img', img[k])).metadata())));
  assert.deepEqual(widths.map((m) => [m.format, m.width]), [['webp', 480], ['webp', 960], ['webp', 1200]]);
});

test('an unchanged photo is not made again', async (t) => {
  const { dataDir, opts } = await setup(t, await jpeg(800, 1400));
  await syncOnce(opts);
  const file = join(dataDir, 'img', loadIndex(dataDir).recipes[0].image.w480);
  const before = statSync(file).mtimeMs;
  await syncOnce(opts);
  assert.equal(statSync(file).mtimeMs, before);
});

test('an index from before the variants gets them on the next sync', async (t) => {
  const { dataDir, opts } = await setup(t, await jpeg(800, 1400));
  await syncOnce(opts);
  const index = loadIndex(dataDir);
  for (const r of index.recipes) { delete r.image.w480; delete r.image.w960; delete r.image.w1600; }
  writeFileSync(join(dataDir, 'index.json'), JSON.stringify(index));
  for (const f of readdirSync(join(dataDir, 'img'))) if (f.endsWith('.webp')) statSync(join(dataDir, 'img', f));
  await syncOnce(opts);
  assert.match(loadIndex(dataDir).recipes[0].image.w960, /-960\.webp$/);
});

test('a broken photo gives no variants and is logged, the recipe stays', async (t) => {
  const { dataDir, logs, opts } = await setup(t, Buffer.from('not an image'));
  await syncOnce(opts);
  const r = loadIndex(dataDir).recipes[0];
  assert.equal(r.name, 'Bowl');
  assert.equal(r.image.w480, null);
  assert.ok(logs.some((l) => /Bowl: photo/.test(l)), logs.join('\n'));
});

test('a huge photo is refused, not decoded', async (t) => {
  const { dataDir, opts } = await setup(t, await jpeg(8000, 8000));
  await syncOnce(opts);
  assert.equal(loadIndex(dataDir).recipes[0].image.w480, null);
});
