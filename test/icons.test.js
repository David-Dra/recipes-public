// Logo: favicon, home-screen icons (iPhone + Android) and the web manifest; the logo also sits in the top bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/server.js';
import { renderHome } from '../src/render.js';
import { DEFAULTS } from '../src/settings.js';

async function start(t) {
  const app = createApp({ settings: { ...DEFAULTS, title: 'Recipes' }, dataDir: mkdtempSync(join(tmpdir(), 'ic-')), getIndex: () => ({ recipes: [] }) });
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => app.close(ok)));
  const base = `http://127.0.0.1:${app.address().port}`;
  return (p) => fetch(base + p).then(async (r) => ({ status: r.status, type: r.headers.get('content-type'), buf: Buffer.from(await r.arrayBuffer()) }));
}

test('icons are served at their usual paths, PNGs at the right size', async (t) => {
  const get = await start(t);
  for (const [path, size] of [['/apple-touch-icon.png', 180], ['/icon-192.png', 192], ['/icon-512.png', 512], ['/favicon-32.png', 32]]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.equal(r.type, 'image/png', path);
    const m = await sharp(r.buf).metadata();
    assert.deepEqual([m.width, m.height], [size, size], path);
  }
  const svg = await get('/favicon.svg');
  assert.equal(svg.type, 'image/svg+xml');
  assert.match(svg.buf.toString(), /^<svg/);
  assert.equal((await get('/favicon.ico')).status, 200);
});

test('the home-screen icon has no transparent corners (iOS would show black)', async (t) => {
  const get = await start(t);
  const { data } = await sharp((await get('/apple-touch-icon.png')).buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[3], 255);   // top-left pixel is opaque
});

test('manifest: name, standalone, icons, colours', async (t) => {
  const get = await start(t);
  const r = await get('/manifest.webmanifest');
  assert.equal(r.type, 'application/manifest+json');
  const m = JSON.parse(r.buf.toString());
  assert.equal(m.name, 'Recipes');
  assert.equal(m.display, 'standalone');
  assert.equal(m.start_url, '/');
  assert.deepEqual(m.icons.map((i) => i.sizes), ['192x192', '512x512']);
});

test('every page links the icons and the manifest, and the top bar shows the logo', () => {
  const html = renderHome({ recipes: [] }, { ...DEFAULTS, title: 'Recipes' });
  assert.match(html, /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
  assert.match(html, /<link rel="icon" href="\/favicon-32\.png" sizes="32x32" type="image\/png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="Recipes">/);
  assert.match(html, /<a class="brand" href="\/"><img class="logo" src="\/favicon\.svg" alt="" width="30" height="30">Recipes/);
});
