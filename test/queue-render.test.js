import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome, renderQueue } from '../src/render.js';
import { DEFAULTS } from '../src/settings.js';

const S = { ...DEFAULTS };
const index = { synced: '2026-11-05T10:00:00Z', recipes: [] };
const entry = (over) => ({ id: 'e1', shortcode: 'ABC', url: 'https://www.instagram.com/reel/ABC/', state: 'waiting', position: 2,
  reason: null, created_at: '2026-11-06T09:05:00Z', counts: true, ...over });

test('queue page: every state in plain words', () => {
  const q = { day: '2026-11-06', limit: 10, left: 3, paused: false, entries: [
    entry({}), entry({ id: 'e2', state: 'waiting_pc', position: 1 }), entry({ id: 'e3', state: 'watching', position: null }),
    entry({ id: 'e4', state: 'writing', position: null }), entry({ id: 'e5', state: 'saved', position: null, slug: 'pancakes' }),
    entry({ id: 'e6', state: 'failed', position: null, reason: 'no recipe in this video' }),
    entry({ id: 'e7', state: 'already', position: null }),
    entry({ id: 'e8', state: 'failed', position: null, reason: 'reel is private or deleted' }),
    entry({ id: 'e9', state: 'failed', position: null, reason: 'not your link: try again later' }),
  ] };
  const html = renderQueue(q, S);
  for (const words of ['#2 in line', 'kitchen PC is off', 'Watching the video', 'Writing the recipe', 'Saved',
    'no recipe in this video', 'Already a recipe', 'reel is private or deleted', 'not your link: try again later',
    '3 of 10 left today']) assert.match(html, new RegExp(words), words);
  assert.match(html, /href="\/r\/pancakes"/);
  assert.match(html, /data-entry="e1"/);
  assert.doesNotMatch(html, /style=|<script>/);
});

test('queue page without the hub says adding is paused', () => {
  assert.match(renderQueue(null, S), /paused/);
});

test('queue page with no links today', () => {
  assert.match(renderQueue({ limit: 10, left: 10, entries: [] }, S), /No links yet today/);
});

test('home box: count, full day, and no count without a queue', () => {
  const box = (q) => renderHome(index, S, { submit: true, queue: q });
  assert.match(box({ limit: 10, left: 4, entries: [] }), /4 of 10 left today/);
  const full = box({ limit: 10, left: 0, entries: [] });
  assert.match(full, /<input[^>]* disabled/);
  assert.match(full, /again after midnight/);
  const none = box(null);
  assert.match(none, /name="url"/);
  assert.doesNotMatch(none, /left today/);
  assert.doesNotMatch(renderHome(index, S), /action="\/submit"/);
});

test('queue values are escaped', () => {
  const html = renderQueue({ limit: 10, left: 1, entries: [entry({ shortcode: '<b>x' })] }, S);
  assert.doesNotMatch(html, /<b>x/);
});

test('queue times are Berlin time', () => {
  const html = renderQueue({ limit: 10, left: 1, entries: [entry({ created_at: '2026-11-06T09:05:00Z' })] }, S);
  assert.match(html, /<time[^>]*>10:05<\/time>/);
});
