// Reel links: POST /submit, GET /queue, GET /queue.json, the box on the home page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.js';
import { DEFAULTS } from '../src/settings.js';
import { makeHub } from '../src/hub.js';
import { startFakeHub } from './fake-hub.js';

const recipe = {
  id: '7', slug: 'pancakes', name: 'Pancakes', description: '', estimated: false, reelUrl: 'https://www.instagram.com/reel/SAVED1/',
  creator: null, minutes: 15, servings: 2, category: '', cuisine: '', keywords: [], ingredients: ['2 eggs'], steps: ['Fry.'],
  kcal: 400, protein: 30, carbs: 40, fat: 10, ratio: 7.5, created: null, image: { full: null, thumb: null },
};

async function start(t, { index = null, settings = {}, hub = true } = {}) {
  const fake = await startFakeHub();
  t.after(fake.close);
  const app = createApp({ settings: { ...DEFAULTS, ...settings }, dataDir: mkdtempSync(join(tmpdir(), 'srv-')), getIndex: () => index,
    hub: hub ? makeHub({ url: fake.url, token: fake.token, timeoutMs: 300 }) : undefined });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => { app.closeAllConnections(); app.close(r); }));
  return { base: `http://127.0.0.1:${app.address().port}`, fake };
}

const post = (base, body, headers = {}) => fetch(base + '/submit', { method: 'POST', redirect: 'manual', body,
  headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers } })
  .then(async (r) => ({ status: r.status, headers: r.headers, body: await r.text() }));
const form = (url) => new URLSearchParams({ url }).toString();
const get = (base, path) => fetch(base + path).then(async (r) => ({ status: r.status, body: await r.text() }));

test('a share link goes to the hub normalised, then 303 to the queue', async (t) => {
  const { base, fake } = await start(t);
  const r = await post(base, form('https://instagram.com/reel/ABC/?igsh=1'));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/queue#e1');
  assert.deepEqual(JSON.parse(fake.requests.at(-1).body), { url: 'https://www.instagram.com/reel/ABC/' });
});

test('JSON answer for the script on the page', async (t) => {
  const { base } = await start(t);
  const r = await post(base, form('https://www.instagram.com/reel/ABC/'), { accept: 'application/json' });
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(r.body).entry.id, 'e1');
});

test('a bad link is refused without asking the hub', async (t) => {
  const { base, fake } = await start(t);
  const r = await post(base, form('https://evil.com/reel/ABC'));
  assert.equal(r.status, 400);
  assert.match(r.body, /Instagram reel/);
  assert.equal(fake.requests.length, 0);
});

test('no limit per visitor: every link from one visitor reaches the hub', async (t) => {
  const { base, fake } = await start(t);
  const ip = { 'cf-connecting-ip': '198.51.100.7' };
  for (let i = 0; i < 5; i++) assert.equal((await post(base, form(`https://www.instagram.com/reel/A${i}/`), ip)).status, 303);
  assert.equal(fake.requests.length, 5);
});

test('cap reached: ask David for more, and when the next slot frees up', async (t) => {
  const { base, fake } = await start(t);
  fake.state.submit = { status: 429, body: { detail: { message: 'limit reached', left: 0, next_free_at: '2026-11-06T13:40:00+00:00' } } };
  const r = await post(base, form('https://www.instagram.com/reel/C1/'));
  assert.equal(r.status, 429);
  assert.match(r.body, /Ask David for more/);
  assert.match(r.body, /14:40/);
  const j = await post(base, form('https://www.instagram.com/reel/C2/'), { accept: 'application/json' });
  assert.match(JSON.parse(j.body).message, /Ask David for more\..*14:40/);
});

test('hub down: adding is paused', async (t) => {
  const { base, fake } = await start(t);
  fake.state.hang = true;
  const r = await post(base, form('https://www.instagram.com/reel/ABC/'));
  assert.equal(r.status, 503);
  assert.match(r.body, /paused/);
});

test('submit_enabled = false: no /submit and no box', async (t) => {
  const { base } = await start(t, { settings: { submit_enabled: false } });
  assert.equal((await post(base, form('https://www.instagram.com/reel/ABC/'))).status, 404);
  assert.doesNotMatch((await get(base, '/')).body, /action="\/submit"/);
});

test('no hub configured: no box', async (t) => {
  const { base } = await start(t, { hub: false });
  assert.doesNotMatch((await get(base, '/')).body, /action="\/submit"/);
  assert.equal((await post(base, form('https://www.instagram.com/reel/ABC/'))).status, 404);
});

test('another site posting the form is refused', async (t) => {
  const { base, fake } = await start(t);
  const r = await post(base, form('https://www.instagram.com/reel/ABC/'), { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal(fake.requests.length, 0);
  assert.equal((await post(base, form('https://www.instagram.com/reel/ABC/'), { origin: 'https://recipes.ksi.berlin' })).status, 303);
});

test('a big body is refused', async (t) => {
  const { base } = await start(t);
  assert.equal((await post(base, 'url=' + 'a'.repeat(3000))).status, 413);
});

test('/queue.json links saved entries to their recipe page', async (t) => {
  const { base, fake } = await start(t, { index: { recipes: [recipe] } });
  fake.state.queue.body.entries = [{ id: 'e9', shortcode: 'SAVED1', url: 'https://www.instagram.com/reel/SAVED1/', state: 'saved',
    position: null, reason: null, created_at: '2026-11-06T09:00:00Z', counts: true }];
  const q = JSON.parse((await get(base, '/queue.json')).body);
  assert.equal(q.entries[0].slug, 'pancakes');
  assert.equal(q.left, 9);
});

test('/queue renders, then the home shows the box with the count', async (t) => {
  const { base } = await start(t);
  const q = await get(base, '/queue');
  assert.equal(q.status, 200);
  assert.match(q.body, /9 of 10 left · 10 links every 3 hours/);
  const home = await get(base, '/');
  assert.match(home.body, /action="\/submit"/);
  assert.match(home.body, /9 of 10 left · 10 links every 3 hours/);
});

test('the home never waits for a hanging hub', async (t) => {
  const { base, fake } = await start(t);
  fake.state.hang = true;
  const started = Date.now();
  const home = await get(base, '/');
  assert.ok(Date.now() - started < 250, `took ${Date.now() - started} ms`);
  assert.match(home.body, /action="\/submit"/);
  assert.doesNotMatch(home.body, /of 10 left/);
});

test('hub down: the home box says paused', async (t) => {
  const { base, fake } = await start(t);
  fake.state.hang = true;
  await get(base, '/queue');                  // the failed call marks the hub down
  const home = await get(base, '/');
  assert.match(home.body, /paused/);
  assert.match(home.body, /<input[^>]* disabled/);
});

test('a strange hub answer never takes the site down', async (t) => {
  const { base, fake } = await start(t);
  fake.state.queue.body = { weird: true };
  const q = await get(base, '/queue');
  assert.ok([200, 503].includes(q.status));
  fake.state.submit = { status: 200, body: null };
  const r = await post(base, form('https://www.instagram.com/reel/ABC/'));
  assert.ok(r.status < 600);
  assert.equal((await get(base, '/healthz')).status, 200);
});
