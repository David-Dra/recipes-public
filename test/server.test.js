import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { createApp } from '../src/server.js';
import { DEFAULTS } from '../src/settings.js';

const recipe = {
  id: '7', slug: 'pancakes', name: 'Pancakes', description: '', estimated: false, reelUrl: null, creator: null, minutes: 15,
  servings: 2, category: '', cuisine: '', keywords: [], ingredients: ['2 eggs'], steps: ['Fry.'], kcal: 400, protein: 30,
  carbs: 40, fat: 10, ratio: 7.5, created: null, image: { full: '7-abcdef12-full.jpg', thumb: null },
};

let lastDataDir;
async function start(t, { index = null, settings = {} } = {}) {
  const dataDir = lastDataDir = mkdtempSync(join(tmpdir(), 'srv-'));
  mkdirSync(join(dataDir, 'img'));
  writeFileSync(join(dataDir, 'img', '7-abcdef12-full.jpg'), 'JPEGDATA');
  writeFileSync(join(dataDir, 'secret.txt'), 'nope');
  const app = createApp({ settings: { ...DEFAULTS, ...settings }, dataDir, getIndex: () => index });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => app.close(r)));
  return `http://127.0.0.1:${app.address().port}`;
}

// Raw request so paths like /img/../x reach the server unnormalised.
function raw(base, path, method = 'GET') {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path, method }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('healthz before any sync', async (t) => {
  const base = await start(t);
  const res = await raw(base, '/healthz');
  assert.equal(res.status, 200);
  assert.equal(res.body, 'ok');
});

test('home 200 with loading text when no index', async (t) => {
  const res = await raw(await start(t), '/');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/html; charset=utf-8/);
  assert.match(res.body, /Recipes are loading/);
});

test('recipe page by slug', async (t) => {
  const res = await raw(await start(t, { index: { recipes: [recipe] } }), '/r/pancakes');
  assert.equal(res.status, 200);
  assert.match(res.body, /<h1>Pancakes<\/h1>/);
});

test('recipe 404 for unknown slug', async (t) => {
  const res = await raw(await start(t, { index: { recipes: [recipe] } }), '/r/nothing-here');
  assert.equal(res.status, 404);
  assert.match(res.body, /Recipe not found/);
});

test('unreadable image is a 404 and the server keeps running', async (t) => {
  const base = await start(t);
  // The sync may delete a file between the exists check and the read; a directory in its place makes the read throw the same way.
  mkdirSync(join(lastDataDir, 'img', '8-abcdef12-full.jpg'));
  assert.equal((await raw(base, '/img/8-abcdef12-full.jpg')).status, 404);
  assert.equal((await raw(base, '/healthz')).status, 200);
});

test('image is served with long cache', async (t) => {
  const res = await raw(await start(t), '/img/7-abcdef12-full.jpg');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.match(res.headers['cache-control'], /immutable/);
  assert.equal(res.body, 'JPEGDATA');
});

test('image paths cannot escape', async (t) => {
  const base = await start(t);
  for (const p of ['/img/../secret.txt', '/img/%2e%2e%2fsecret.txt', '/img/..%2fsecret.txt', '/img/1-zzzzzzzz-full.jpg',
    '/img/7-abcdef12-full.jpg/', '/img/', '/static/../src/server.js', '/static/%2e%2e/package.json']) {
    const res = await raw(base, p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(res.body, /nope|import /, p);
  }
});

test('static files from the allow-list', async (t) => {
  const base = await start(t);
  const css = await raw(base, '/static/app.css');
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  const js = await raw(base, '/static/sort.js');
  assert.match(js.headers['content-type'], /text\/javascript/);
});

test('theme.css carries the accent', async (t) => {
  const res = await raw(await start(t, { settings: { accent: '#ff0066' } }), '/theme.css');
  assert.equal(res.status, 200);
  assert.match(res.body, /--accent:\s*#ff0066/);
});

test('robots disallow by default', async (t) => {
  const res = await raw(await start(t), '/robots.txt');
  assert.match(res.body, /Disallow: \//);
  assert.equal(res.headers['x-robots-tag'], 'noindex');
});

test('sitemap only when indexable', async (t) => {
  assert.equal((await raw(await start(t, { index: { recipes: [recipe] } }), '/sitemap.xml')).status, 404);
  const base = await start(t, { index: { recipes: [recipe] }, settings: { indexable: true } });
  const sm = await raw(base, '/sitemap.xml');
  assert.equal(sm.status, 200);
  assert.match(sm.body, /<loc>https:\/\/recipes\.ksi\.berlin\/r\/pancakes<\/loc>/);
  const robots = await raw(base, '/robots.txt');
  assert.match(robots.body, /Allow: \//);
  assert.match(robots.body, /Sitemap: https:\/\/recipes\.ksi\.berlin\/sitemap\.xml/);
  assert.equal(robots.headers['x-robots-tag'], undefined);
});

test('security headers on every response', async (t) => {
  const base = await start(t);
  for (const p of ['/', '/healthz', '/nope', '/img/7-abcdef12-full.jpg']) {
    const h = (await raw(base, p)).headers;
    assert.equal(h['content-security-policy'], "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'", p);
    assert.equal(h['x-content-type-options'], 'nosniff', p);
    assert.equal(h['referrer-policy'], 'strict-origin-when-cross-origin', p);
  }
});

test('POST is 405', async (t) => {
  assert.equal((await raw(await start(t), '/', 'POST')).status, 405);
});

test('HEAD works without a body', async (t) => {
  const res = await raw(await start(t), '/', 'HEAD');
  assert.equal(res.status, 200);
  assert.equal(res.body, '');
});
