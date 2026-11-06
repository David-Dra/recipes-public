// Colour-coded sort pills: each value shows in its pill's colour; protein per 100 kcal comes first and biggest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderHome, renderRecipe } from '../src/render.js';
import { createApp, PALETTE } from '../src/server.js';
import { DEFAULTS } from '../src/settings.js';
import { SORTS } from '../public/sort.js';

const S = { ...DEFAULTS };
const r = { id: '7', slug: 'bowl', name: 'Bowl', description: '', estimated: false, reelUrl: null, creator: null, minutes: 10, servings: 1,
  category: '', cuisine: '', keywords: [], ingredients: [], steps: [], kcal: 400, protein: 40, carbs: 1, fat: 1, ratio: 10,
  created: null, image: { full: null, thumb: null } };

test('each pill carries its colour class', () => {
  const html = renderHome({ recipes: [r] }, S);
  for (const k of Object.keys(SORTS)) assert.match(html, new RegExp(`class="pill v-${k}" data-sort="${k}"`));
});

test('card: protein per 100 kcal first and big, the other values in their colours', () => {
  const html = renderHome({ recipes: [r] }, S);
  const stats = /<p class="stats">([\s\S]*?)<\/p>/.exec(html)[1];
  assert.match(stats, /^<span class="v-ratio big-ratio"><b>10<\/b> g protein \/ 100 kcal<\/span>/);
  assert.match(stats, /<span class="v-protein">40 g protein<\/span>/);
  assert.match(stats, /<span class="v-kcal">400 kcal<\/span>/);
  assert.match(stats, /<span class="v-quick">10 min<\/span>/);
  assert.match(html, /<span class="badge v-ratio">/);
  assert.match(html, /<div class="big v-ratio">/);
});

test('recipe page: ratio tile first, tiles coloured', () => {
  const html = renderRecipe(r, S);
  const tiles = /<section class="tiles">([\s\S]*?)<\/section>/.exec(html)[1];
  assert.match(tiles.trim(), /^<div class="tile glass key v-ratio"><b>10<\/b><span>g protein \/ 100 kcal<\/span>/);
  assert.match(tiles, /tile glass v-protein/);
  assert.match(tiles, /tile glass v-kcal/);
});

test('/theme.css defines a colour per sort, ratio = accent', async (t) => {
  const app = createApp({ settings: { ...S, accent: '#123456' }, dataDir: mkdtempSync(join(tmpdir(), 'c-')), getIndex: () => null });
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => app.close(ok)));
  const css = await (await fetch(`http://127.0.0.1:${app.address().port}/theme.css`)).text();
  assert.match(css, /--c-ratio: #123456;/);
  for (const k of Object.keys(SORTS)) assert.match(css, new RegExp(`--c-${k}: #[0-9a-f]{6};`, 'i'));
  assert.equal(new Set(Object.values(PALETTE)).size, Object.keys(PALETTE).length);
});

// WCAG AA (4.5:1) for each colour as text on the darkest glass the site uses
test('colours are readable on the glass', () => {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const glass = '#1c1c2a';
  for (const [k, c] of Object.entries({ ratio: DEFAULTS.accent, ...PALETTE })) {
    const ratio = (lum(c) + 0.05) / (lum(glass) + 0.05);
    assert.ok(ratio >= 4.5, `${k} ${c}: ${ratio.toFixed(2)}`);
  }
});
