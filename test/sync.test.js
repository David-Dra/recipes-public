import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncOnce, loadIndex } from '../src/sync.js';
import { makeDav } from '../src/webdav.js';
import { startFakeDav } from './fake-webdav.js';

const R = '/Shared/Recipes';
const recipe = (name, extra = {}) => JSON.stringify({ name, nutrition: { calories: '400 kcal', proteinContent: '40 g' }, ...extra });

function tree() {
  return {
    [R]: { dir: true },
    [`${R}/Pancakes`]: { dir: true, id: '101' },
    [`${R}/Pancakes/recipe.json`]: { body: recipe('Pancakes') },
    [`${R}/Pancakes/full.jpg`]: { body: 'FULL-PANCAKES' },
    [`${R}/Pancakes/thumb.jpg`]: { body: 'THUMB-PANCAKES' },
    [`${R}/Chili`]: { dir: true, id: '202' },
    [`${R}/Chili/recipe.json`]: { body: recipe('Turkey Chili') },
  };
}

async function setup(t, tr = tree()) {
  const fake = await startFakeDav(tr);
  t.after(fake.close);
  const dataDir = mkdtempSync(join(tmpdir(), 'sync-'));
  const logs = [];
  const opts = { dav: makeDav({ url: fake.url, user: fake.user, password: fake.password }), sharePath: R, dataDir, log: (m) => logs.push(m) };
  return { fake, tr, dataDir, logs, opts };
}

test('first sync writes index and images', async (t) => {
  const { dataDir, opts } = await setup(t);
  const res = await syncOnce(opts);
  assert.deepEqual(res, { count: 2, changed: 2, skipped: 0 });
  const index = loadIndex(dataDir);
  assert.equal(index.recipes.length, 2);
  const p = index.recipes.find((r) => r.name === 'Pancakes');
  assert.equal(p.id, '101');
  assert.equal(p.slug, 'pancakes');
  assert.match(p.image.full, /^101-[0-9a-f]{8}-full\.jpg$/);
  assert.match(p.image.thumb, /^101-[0-9a-f]{8}-thumb\.jpg$/);
  assert.ok(existsSync(join(dataDir, 'img', p.image.full)));
  const c = index.recipes.find((r) => r.name === 'Turkey Chili');
  assert.deepEqual(c.image, { full: null, thumb: null });
});

test('second sync with nothing changed downloads nothing', async (t) => {
  const { fake, opts } = await setup(t);
  await syncOnce(opts);
  const before = fake.gets.length;
  const res = await syncOnce(opts);
  assert.equal(fake.gets.length, before);
  assert.deepEqual(res, { count: 2, changed: 0, skipped: 0 });
});

test('changed recipe.json is re-read', async (t) => {
  const { tr, dataDir, opts } = await setup(t);
  await syncOnce(opts);
  tr[`${R}/Chili/recipe.json`] = { body: recipe('Turkey Chili Deluxe') };
  const res = await syncOnce(opts);
  assert.equal(res.changed, 1);
  assert.ok(loadIndex(dataDir).recipes.some((r) => r.name === 'Turkey Chili Deluxe'));
});

test('changed photo replaces the old image file', async (t) => {
  const { tr, dataDir, opts } = await setup(t);
  await syncOnce(opts);
  const old = loadIndex(dataDir).recipes.find((r) => r.id === '101').image.full;
  tr[`${R}/Pancakes/full.jpg`] = { body: 'NEW-PHOTO' };
  await syncOnce(opts);
  const now = loadIndex(dataDir).recipes.find((r) => r.id === '101').image.full;
  assert.notEqual(now, old);
  assert.ok(existsSync(join(dataDir, 'img', now)));
  assert.ok(!existsSync(join(dataDir, 'img', old)));
});

test('deleted folder leaves the index and its images are removed', async (t) => {
  const { tr, dataDir, opts } = await setup(t);
  await syncOnce(opts);
  for (const k of Object.keys(tr)) if (k.startsWith(`${R}/Pancakes`)) delete tr[k];
  const res = await syncOnce(opts);
  assert.equal(res.count, 1);
  assert.deepEqual(loadIndex(dataDir).recipes.map((r) => r.id), ['202']);
  assert.deepEqual(readdirSync(join(dataDir, 'img')), []);
});

test('broken recipe.json is skipped and counted', async (t) => {
  const tr = tree();
  tr[`${R}/Broken`] = { dir: true, id: '303' };
  tr[`${R}/Broken/recipe.json`] = { body: '{oops' };
  tr[`${R}/Empty`] = { dir: true, id: '404' };
  const { dataDir, logs, opts } = await setup(t, tr);
  const res = await syncOnce(opts);
  assert.deepEqual(res, { count: 2, changed: 2, skipped: 2 });
  assert.equal(loadIndex(dataDir).recipes.length, 2);
  assert.ok(logs.some((l) => l.includes('Broken')));
});

test('server down keeps old index', async (t) => {
  const { fake, dataDir, logs, opts } = await setup(t);
  await syncOnce(opts);
  fake.setStatus(503);
  const res = await syncOnce(opts);
  assert.deepEqual(res, { count: 2, changed: 0, skipped: 0 });
  assert.equal(loadIndex(dataDir).recipes.length, 2);
  assert.ok(logs.some((l) => l.includes('503')));
});

test('no index yet and server down returns count 0 without throwing', async (t) => {
  const { fake, dataDir, opts } = await setup(t);
  fake.setStatus(401);
  assert.deepEqual(await syncOnce(opts), { count: 0, changed: 0, skipped: 0 });
  assert.equal(loadIndex(dataDir), null);
});

test('a corrupt index.json counts as no index', async (t) => {
  const { dataDir } = await setup(t);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(dataDir, 'index.json'), '{half');
  assert.equal(loadIndex(dataDir), null);
});
