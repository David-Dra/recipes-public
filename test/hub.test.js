import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHub } from '../src/hub.js';
import { startFakeHub } from './fake-hub.js';

test('submit sends the link with the bearer token', async (t) => {
  const fake = await startFakeHub();
  t.after(fake.close);
  const hub = makeHub({ url: fake.url, token: fake.token });
  const r = await hub.submit('https://www.instagram.com/reel/ABC/');
  assert.equal(r.status, 200);
  assert.equal(r.body.state, 'waiting');
  const req = fake.requests.at(-1);
  assert.equal(req.auth, 'Bearer rs-token');
  assert.deepEqual(JSON.parse(req.body), { url: 'https://www.instagram.com/reel/ABC/' });
});

test('queue is cached for cacheMs', async (t) => {
  const fake = await startFakeHub();
  t.after(fake.close);
  let clock = 0;
  const hub = makeHub({ url: fake.url, token: fake.token, cacheMs: 10000, now: () => clock });
  assert.equal((await hub.queue()).left, 9);
  await hub.queue();
  assert.equal(fake.requests.length, 1);
  clock = 10001;
  await hub.queue();
  assert.equal(fake.requests.length, 2);
});

test('cached() gives the last queue without waiting', async (t) => {
  const fake = await startFakeHub();
  t.after(fake.close);
  const hub = makeHub({ url: fake.url, token: fake.token });
  assert.equal(hub.cached(), null);
  await hub.queue();
  assert.equal(hub.cached().limit, 10);
});

test('a hanging hub gives null / 503 quickly', async (t) => {
  const fake = await startFakeHub();
  t.after(fake.close);
  fake.state.hang = true;
  const hub = makeHub({ url: fake.url, token: fake.token, timeoutMs: 200 });
  const started = Date.now();
  assert.equal(await hub.queue(), null);
  assert.deepEqual(await hub.submit('https://www.instagram.com/reel/ABC/'), { status: 503, body: { message: 'paused' } });
  assert.ok(Date.now() - started < 2000);
});

test('a 429 from the hub is passed through', async (t) => {
  const fake = await startFakeHub();
  t.after(fake.close);
  fake.state.submit = { status: 429, body: { detail: { message: 'daily limit reached', left: 0 } } };
  const hub = makeHub({ url: fake.url, token: fake.token });
  const r = await hub.submit('https://www.instagram.com/reel/ABC/');
  assert.equal(r.status, 429);
  assert.equal(r.body.detail.left, 0);
});

test('without a hub url nothing is sent', async () => {
  const hub = makeHub({});
  assert.equal(hub.configured, false);
  assert.equal(await hub.queue(), null);
  assert.deepEqual(await hub.submit('x'), { status: 503, body: { message: 'paused' } });
});

test('hubFromEnv reads NEXUS_HUB_URL and NEXUS_HUB_TOKEN', async () => {
  const { hubFromEnv } = await import('../src/hub.js');
  assert.equal(hubFromEnv({}).configured, false);
  assert.equal(hubFromEnv({ NEXUS_HUB_URL: 'http://192.0.2.1:8090' }).configured, false);
  assert.equal(hubFromEnv({ NEXUS_HUB_URL: 'http://192.0.2.1:8090', NEXUS_HUB_TOKEN: 't' }).configured, true);
});
