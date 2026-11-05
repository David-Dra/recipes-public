import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderRecipe, renderNotFound, esc } from '../src/render.js';
import { DEFAULTS } from '../src/settings.js';

const S = { ...DEFAULTS, title: 'Test Kitchen' };
const base = {
  slug: '', description: '', estimated: false, reelUrl: null, creator: null, minutes: 20, servings: 2, category: '', cuisine: '',
  keywords: [], ingredients: ['400 g chicken'], steps: ['Cook it.'], carbs: 30, fat: 10, created: '2026-10-01T12:00:00+0000',
  image: { full: null, thumb: null },
};
const r = (over) => ({ ...base, ...over });
const shawarma = r({ id: '1', slug: 'shawarma', name: 'Shawarma', kcal: 430, protein: 48, ratio: 11.2,
  image: { full: '1-aaaaaaaa-full.jpg', thumb: '1-aaaaaaaa-thumb.jpg' } });
const oats = r({ id: '2', slug: 'oats', name: 'Oats', kcal: 410, protein: 17, ratio: 4.1 });
const plain = r({ id: '3', slug: 'plain', name: 'Plain', kcal: null, protein: null, ratio: null });
const index = { synced: '2026-11-05T10:00:00Z', recipes: [oats, plain, shawarma] };

test('home lists recipes sorted by ratio', () => {
  const html = renderHome(index, S);
  const order = [...html.matchAll(/href="\/r\/([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ['shawarma', 'oats', 'plain']);
  assert.match(html, /11\.2/);
  assert.match(html, /<title>Test Kitchen<\/title>/);
});

test('home has the five sort pills in order with the default active', () => {
  const html = renderHome(index, S);
  const pills = [...html.matchAll(/data-sort="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(pills, ['ratio', 'protein', 'kcal', 'quick', 'newest']);
  assert.match(html, /data-sort="ratio"[^>]*aria-pressed="true"/);
});

test('home uses the default view from settings', () => {
  assert.match(renderHome(index, { ...S, default_view: 'list' }), /data-view="list"/);
});

test('home shows loading without index', () => {
  const html = renderHome(null, S);
  assert.match(html, /Recipes are loading/);
});

test('recipe page has reel button only with reelUrl', () => {
  assert.doesNotMatch(renderRecipe(shawarma, S), /instagram\.com/);
  const withReel = renderRecipe({ ...shawarma, reelUrl: 'https://www.instagram.com/reel/X1/' }, S);
  assert.match(withReel, /href="https:\/\/www\.instagram\.com\/reel\/X1\/"[^>]*rel="noopener noreferrer"/);
  assert.match(withReel, /Watch the original reel on Instagram/);
});

test('creator line hidden when credit_creators false', () => {
  const c = { ...shawarma, creator: { name: 'chef', url: 'https://www.instagram.com/chef/' } };
  assert.match(renderRecipe(c, S), /@chef/);
  assert.doesNotMatch(renderRecipe(c, { ...S, credit_creators: false }), /@chef/);
});

test('estimated mark follows the setting', () => {
  const e = { ...shawarma, estimated: true };
  assert.match(renderRecipe(e, S), /estimated/);
  assert.doesNotMatch(renderRecipe(e, { ...S, show_estimated_mark: false }), /estimated/);
});

test('missing nutrition hides the tiles', () => {
  assert.doesNotMatch(renderRecipe(plain, S), /protein \/ 100 kcal/);
});

test('noindex present when not indexable and absent when indexable', () => {
  assert.match(renderHome(index, S), /<meta name="robots" content="noindex">/);
  assert.match(renderRecipe(shawarma, S), /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(renderHome(index, { ...S, indexable: true }), /noindex/);
});

test('og image uses base_url', () => {
  const html = renderRecipe(shawarma, S);
  assert.match(html, /<meta property="og:image" content="https:\/\/recipes\.ksi\.berlin\/img\/1-aaaaaaaa-full\.jpg">/);
  assert.match(html, /<meta property="og:url" content="https:\/\/recipes\.ksi\.berlin\/r\/shawarma">/);
});

test('recipe without photo gets a letter tile', () => {
  assert.match(renderRecipe(oats, S), /class="[^"]*\bnoimg\b[^"]*"[^>]*>O</);
});

test('escapes hostile recipe text', () => {
  const evil = '</title><script>alert(1)</script>"\'&';
  const bad = r({ id: '9', slug: 'evil', name: evil, description: evil, kcal: 100, protein: 10, ratio: 10,
    ingredients: [evil], steps: [evil], keywords: [evil], category: evil });
  for (const html of [renderHome({ recipes: [bad] }, S), renderRecipe(bad, S)]) {
    assert.doesNotMatch(html, /<script>alert/);
    assert.doesNotMatch(html, /"'&<\//);
    assert.match(html, /&lt;\/title&gt;&lt;script&gt;/);
  }
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('not found page', () => {
  assert.match(renderNotFound(S), /not found/i);
});
