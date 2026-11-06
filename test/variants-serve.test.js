import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { renderHome, renderRecipe } from '../src/render.js';
import { DEFAULTS } from '../src/settings.js';

const S = { ...DEFAULTS };
const img = { full: '7-abcdef12-full.jpg', thumb: '7-abcdef12-thumb.jpg', w480: '7-abcdef12-480.webp', w960: '7-abcdef12-960.webp',
  w1600: '7-abcdef12-1600.webp' };
const r = { id: '7', slug: 'bowl', name: 'Bowl', description: '', estimated: false, reelUrl: null, creator: null, minutes: 10, servings: 1,
  category: '', cuisine: '', keywords: [], ingredients: [], steps: [], kcal: 400, protein: 40, carbs: 1, fat: 1, ratio: 10,
  created: null, image: img };

test('cards use the WebP sizes with srcset', () => {
  const html = renderHome({ recipes: [r] }, S);
  assert.match(html, /src="\/img\/7-abcdef12-480\.webp"/);
  assert.match(html, /srcset="\/img\/7-abcdef12-480\.webp 480w, \/img\/7-abcdef12-960\.webp 960w"/);
  assert.match(html, /sizes="/);
  assert.match(html, /og:image" content="https:\/\/recipes\.ksi\.berlin\/img\/7-abcdef12-full\.jpg"/);
});

test('recipe hero uses the big size', () => {
  const html = renderRecipe(r, S);
  assert.match(html, /class="heroimg" src="\/img\/7-abcdef12-1600\.webp"/);
  assert.match(html, /og:image" content="[^"]*-full\.jpg"/);
});

test('without sizes (older index) the old photos are used', () => {
  const old = { ...r, image: { full: img.full, thumb: img.thumb } };
  assert.match(renderHome({ recipes: [old] }, S), /src="\/img\/7-abcdef12-thumb\.jpg"/);
});

test('/img serves the WebP sizes, nothing else', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'srv-'));
  mkdirSync(join(dataDir, 'img'));
  writeFileSync(join(dataDir, 'img', '7-abcdef12-960.webp'), 'RIFF....WEBP');
  const app = createApp({ settings: S, dataDir, getIndex: () => null });
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => app.close(ok)));
  const base = `http://127.0.0.1:${app.address().port}`;
  const good = await fetch(`${base}/img/7-abcdef12-960.webp`);
  assert.equal(good.status, 200);
  assert.equal(good.headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(`${base}/img/7-abcdef12-961.webp`)).status, 404);
  assert.equal((await fetch(`${base}/img/7-abcdef12-960.webp.tmp`)).status, 404);
});
