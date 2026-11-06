import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSettings, DEFAULTS } from '../src/settings.js';

function file(text) {
  const dir = mkdtempSync(join(tmpdir(), 'settings-'));
  const path = join(dir, 'settings.toml');
  writeFileSync(path, text);
  return path;
}

test('defaults when file has only title', () => {
  const s = loadSettings(file('title = "My Kitchen"\n'));
  assert.equal(s.title, 'My Kitchen');
  assert.equal(s.indexable, false);
  assert.equal(s.default_sort, 'ratio');
  assert.equal(s.default_view, 'grid');
  assert.equal(s.sync_minutes, 5);
  assert.equal(s.share_path, '/Shared/Recipes');
  assert.equal(s.base_url, 'https://recipes.ksi.berlin');
  assert.equal(s.accent, '#38bdf8');
});

test('rejects unknown key', () => {
  assert.throws(() => loadSettings(file('colour = "red"\n')), /settings\.toml: colour: unknown key/);
});

test('rejects default_sort "fast"', () => {
  assert.throws(() => loadSettings(file('default_sort = "fast"\n')), /settings\.toml: default_sort:/);
});

test('rejects accent "blue"', () => {
  assert.throws(() => loadSettings(file('accent = "blue"\n')), /settings\.toml: accent:/);
});

test('rejects sync_minutes 0', () => {
  assert.throws(() => loadSettings(file('sync_minutes = 0\n')), /settings\.toml: sync_minutes:/);
});

test('rejects base_url with trailing slash', () => {
  assert.throws(() => loadSettings(file('base_url = "https://x.example/"\n')), /settings\.toml: base_url:/);
});

test('rejects indexable as a string', () => {
  assert.throws(() => loadSettings(file('indexable = "yes"\n')), /settings\.toml: indexable:/);
});

test('repo settings.toml loads', () => {
  const s = loadSettings(new URL('../settings.toml', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
  const photo = { background: DEFAULTS.background, background_credit: DEFAULTS.background_credit, background_url: DEFAULTS.background_url };
  assert.deepEqual({ ...s, title: DEFAULTS.title, tagline: DEFAULTS.tagline, ...photo }, DEFAULTS);   // the photo: background.test.js
});

test('submit settings: defaults and checks', () => {
  assert.equal(DEFAULTS.submit_enabled, true);
  assert.equal(DEFAULTS.ask_for_more, 'Ask David for more.');
  assert.throws(() => loadSettings(file('ip_daily_limit = 3\n')), /ip_daily_limit: unknown key/);   // no limit per visitor any more
  assert.throws(() => loadSettings(file('ask_for_more = 5\n')), /ask_for_more: must be/);
  assert.throws(() => loadSettings(file('submit_enabled = "yes"\n')), /submit_enabled: must be true or false/);
});
