// Background photo: settings `background` names a set of files in public/bg; credit in the footer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { loadSettings, DEFAULTS } from '../src/settings.js';

async function start(t, settings) {
  const app = createApp({ settings: { ...DEFAULTS, ...settings }, dataDir: mkdtempSync(join(tmpdir(), 'bg-')), getIndex: () => ({ recipes: [] }) });
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => app.close(ok)));
  const base = `http://127.0.0.1:${app.address().port}`;
  return (p) => fetch(base + p).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), body: await r.text() }));
}

test('the repo settings use the Crete photo, credited', () => {
  const s = loadSettings('settings.toml');
  assert.equal(s.background, 'crete');
  assert.match(s.background_credit, /Arthur Yeti/);
  assert.match(s.background_url, /^https:\/\/unsplash\.com\//);
});

test('theme.css: image-set with AVIF, WebP and JPEG, a portrait crop and a 4K size', async (t) => {
  const get = await start(t, { background: 'crete' });
  const css = (await get('/theme.css')).body;
  assert.match(css, /image-set\(url\("\/bg\/crete-1920\.avif"\) type\("image\/avif"\), url\("\/bg\/crete-1920\.webp"\) type\("image\/webp"\), url\("\/bg\/crete-1920\.jpg"\) type\("image\/jpeg"\)\)/);
  assert.match(css, /@media \(orientation: portrait\)[^}]*crete-portrait\.avif/);
  assert.match(css, /crete-3840\.avif/);
});

test('no background setting: no photo rule', async (t) => {
  const get = await start(t, { background: '' });
  assert.doesNotMatch((await get('/theme.css')).body, /\/bg\//);
});

test('/bg serves the photo files with long caching, nothing else', async (t) => {
  const get = await start(t, { background: 'crete' });
  const avif = await get('/bg/crete-1920.avif');
  assert.equal(avif.status, 200);
  assert.equal(avif.type, 'image/avif');
  assert.equal((await get('/bg/LICENSE.txt')).status, 404);
  assert.equal((await get('/bg/../package.json')).status, 404);
});

test('footer credits the photographer', async (t) => {
  const get = await start(t, { background: 'crete', background_credit: 'Photo: Arthur Yeti / Unsplash',
    background_url: 'https://unsplash.com/photos/rmrR8xasP2g' });
  assert.match((await get('/')).body, /<footer[^>]*>[\s\S]*<a href="https:\/\/unsplash\.com\/photos\/rmrR8xasP2g"[^>]*>Photo: Arthur Yeti \/ Unsplash<\/a>/);
});

test('a background without its files is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'set-'));
  writeFileSync(join(dir, 'settings.toml'), 'background = "nowhere"\n');
  assert.throws(() => loadSettings(join(dir, 'settings.toml')), /settings\.toml: background: /);
});
