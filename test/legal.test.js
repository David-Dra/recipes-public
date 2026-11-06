// Impressum and Datenschutz: data from SITE_DATA/impressum.toml, never from the repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadLegal } from '../src/legal.js';
import { createApp } from '../src/server.js';
import { DEFAULTS } from '../src/settings.js';

const dir = () => mkdtempSync(join(tmpdir(), 'legal-'));

test('the example file parses', () => {
  const d = dir();
  copyFileSync('impressum.example.toml', join(d, 'impressum.toml'));
  assert.deepEqual(loadLegal(d), { name: 'Max Mustermann', address: ['Musterstraße 1', '10115 Berlin', 'Deutschland'],
    email: 'kontakt@example.org', phone: '' });
});

test('missing or broken file: null, and the log names no values', () => {
  const logs = [];
  assert.equal(loadLegal(dir(), (m) => logs.push(m)), null);
  const d = dir();
  writeFileSync(join(d, 'impressum.toml'), 'name = "Secret Person"\nemail = "not-an-email"\naddress = ["x"]\n');
  assert.equal(loadLegal(d, (m) => logs.push(m)), null);
  assert.ok(logs.some((l) => /impressum\.toml: email/.test(l)));
  assert.ok(!logs.join(' ').includes('Secret Person'));
});

async function start(t, legalFile) {
  const d = dir();
  if (legalFile) writeFileSync(join(d, 'impressum.toml'), legalFile);
  const app = createApp({ settings: DEFAULTS, dataDir: d, getIndex: () => ({ recipes: [] }) });
  await new Promise((ok) => app.listen(0, '127.0.0.1', ok));
  t.after(() => new Promise((ok) => app.close(ok)));
  const base = `http://127.0.0.1:${app.address().port}`;
  return (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.text() }));
}

const FILE = 'name = "Anna <b>Test</b>"\naddress = ["Weg 2", "12345 Ort"]\nemail = "anna@example.org"\n';

test('with the file: both pages, escaped, and linked in the footer', async (t) => {
  const get = await start(t, FILE);
  const imp = await get('/impressum');
  assert.equal(imp.status, 200);
  assert.match(imp.body, /Anna &lt;b&gt;Test&lt;\/b&gt;/);
  assert.match(imp.body, /Weg 2<br>12345 Ort/);
  assert.match(imp.body, /href="mailto:anna@example.org"/);
  assert.match(imp.body, /§ 5 DDG/);
  const ds = await get('/datenschutz');
  assert.equal(ds.status, 200);
  for (const w of ['Cloudflare', 'Nextcloud', 'Nexus', 'keine Cookies', 'Hash', 'Neustart', 'anna@example.org']) {
    assert.match(ds.body, new RegExp(w), w);
  }
  const home = await get('/');
  assert.match(home.body, /<footer[\s\S]*href="\/impressum"[\s\S]*href="\/datenschutz"/);
});

test('without the file: no pages, no links', async (t) => {
  const get = await start(t, null);
  assert.equal((await get('/impressum')).status, 404);
  assert.equal((await get('/datenschutz')).status, 404);
  assert.doesNotMatch((await get('/')).body, /impressum/);
});

test('no real impressum.toml is tracked in git', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  assert.ok(!files.some((f) => /(^|\/)impressum\.toml$/.test(f)));
});
