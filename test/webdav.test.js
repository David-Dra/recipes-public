import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDav, DavError } from '../src/webdav.js';
import { startFakeDav } from './fake-webdav.js';

const tree = () => ({
  '/Shared/Recipes': { dir: true },
  '/Shared/Recipes/Pancakes': { dir: true, id: '501' },
  '/Shared/Recipes/Pancakes/recipe.json': { body: '{"name":"Pancakes"}', id: '502' },
  '/Shared/Recipes/Käse & Spätzle': { dir: true, id: '601' },
});

test('lists folders with etag and fileid', async (t) => {
  const fake = await startFakeDav(tree());
  t.after(fake.close);
  const dav = makeDav({ url: fake.url, user: fake.user, password: fake.password });
  const entries = await dav.list('/Shared/Recipes');
  assert.equal(entries.length, 2);
  const p = entries.find((e) => e.name === 'Pancakes');
  assert.equal(p.isDir, true);
  assert.equal(p.fileId, '501');
  assert.equal(p.path, '/Shared/Recipes/Pancakes');
  assert.match(p.etag, /^[0-9a-f]{40}$/);
  const files = await dav.list('/Shared/Recipes/Pancakes');
  assert.deepEqual(files.map((f) => [f.name, f.isDir, f.size, f.fileId]), [['recipe.json', false, 19, '502']]);
});

test('get returns bytes', async (t) => {
  const fake = await startFakeDav(tree());
  t.after(fake.close);
  const dav = makeDav({ url: fake.url, user: fake.user, password: fake.password });
  const buf = await dav.get('/Shared/Recipes/Pancakes/recipe.json');
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.toString(), '{"name":"Pancakes"}');
});

test('401 throws DavError 401', async (t) => {
  const fake = await startFakeDav(tree());
  t.after(fake.close);
  const dav = makeDav({ url: fake.url, user: fake.user, password: 'wrong' });
  await assert.rejects(dav.list('/Shared/Recipes'), (e) => e instanceof DavError && e.status === 401);
});

test('names with spaces and umlauts round-trip', async (t) => {
  const fake = await startFakeDav(tree());
  t.after(fake.close);
  const dav = makeDav({ url: fake.url, user: fake.user, password: fake.password });
  const entries = await dav.list('/Shared/Recipes');
  const k = entries.find((e) => e.fileId === '601');
  assert.equal(k.name, 'Käse & Spätzle');
  assert.deepEqual(await dav.list(k.path), []);
});

test('unreachable server throws DavError', async () => {
  const dav = makeDav({ url: 'http://127.0.0.1:1', user: 'u', password: 'p' });
  await assert.rejects(dav.list('/x'), (e) => e instanceof DavError && e.status === 0);
});
