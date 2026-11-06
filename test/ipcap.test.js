import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeIpCap, berlinDay } from '../src/ipcap.js';
import { normalise } from '../src/link.js';

test('three links a day per visitor, then no', () => {
  const cap = makeIpCap(3, () => Date.UTC(2026, 10, 6, 10));
  assert.deepEqual([1, 2, 3, 4].map(() => cap.take('1.2.3.4')), [true, true, true, false]);
  assert.equal(cap.take('5.6.7.8'), true);
});

test('give() hands a slot back', () => {
  const cap = makeIpCap(1, () => 0);
  assert.equal(cap.take('a'), true);
  cap.give('a');
  assert.equal(cap.take('a'), true);
});

test('a new Berlin day resets the count', () => {
  let t = Date.UTC(2026, 11, 1, 22, 50);   // 23:50 in Berlin
  const cap = makeIpCap(1, () => t);
  assert.equal(cap.take('a'), true);
  assert.equal(cap.take('a'), false);
  t = Date.UTC(2026, 11, 1, 23, 10);       // 00:10 next day in Berlin
  assert.equal(cap.take('a'), true);
});

test('berlinDay uses Europe/Berlin', () => {
  assert.equal(berlinDay(Date.UTC(2026, 11, 1, 23, 30)), '2026-12-02');
});

test('no IP is stored in clear', () => {
  const cap = makeIpCap(3, () => 0);
  cap.take('203.0.113.9');
  assert.doesNotMatch(JSON.stringify([...cap._keys()]), /203\.0\.113\.9/);
});

test('normalise share links like the hub', () => {
  assert.equal(normalise(' https://instagram.com/reel/ABC_1/?igsh=x '), 'https://www.instagram.com/reel/ABC_1/');
  assert.equal(normalise('https://www.instagram.com/reels/Xy-9'), 'https://www.instagram.com/reel/Xy-9/');
  assert.equal(normalise('http://m.instagram.com/p/PostA/?img_index=1'), 'https://www.instagram.com/p/PostA/');
  for (const bad of ['https://evil.com/reel/ABC', 'javascript:x', 'https://instagram.com.evil.com/reel/ABC', '', 'x'.repeat(600)]) {
    assert.equal(normalise(bad), null, bad);
  }
});
