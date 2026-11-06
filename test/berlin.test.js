import { test } from 'node:test';
import assert from 'node:assert/strict';
import { berlinDay, berlinClock } from '../src/berlin.js';
import { normalise } from '../src/link.js';

test('berlinDay uses Europe/Berlin', () => {
  assert.equal(berlinDay(Date.UTC(2026, 11, 1, 23, 30)), '2026-12-02');
});

test('berlinClock gives HH:MM in Berlin', () => {
  assert.equal(berlinClock('2026-11-06T13:40:00+00:00'), '14:40');
  assert.equal(berlinClock('not a date'), '');
});

test('normalise share links like the hub', () => {
  assert.equal(normalise(' https://instagram.com/reel/ABC_1/?igsh=x '), 'https://www.instagram.com/reel/ABC_1/');
  assert.equal(normalise('https://www.instagram.com/reels/Xy-9'), 'https://www.instagram.com/reel/Xy-9/');
  assert.equal(normalise('http://m.instagram.com/p/PostA/?img_index=1'), 'https://www.instagram.com/p/PostA/');
  for (const bad of ['https://evil.com/reel/ABC', 'javascript:x', 'https://instagram.com.evil.com/reel/ABC', '', 'x'.repeat(600)]) {
    assert.equal(normalise(bad), null, bad);
  }
});

test('profile-style links and upper-case hosts', () => {
  assert.equal(normalise('https://www.instagram.com/some.chef_1/reel/ABC12/?igsh=x'), 'https://www.instagram.com/reel/ABC12/');
  assert.equal(normalise('HTTPS://WWW.INSTAGRAM.COM/reel/ABC12/'), 'https://www.instagram.com/reel/ABC12/');
  assert.equal(normalise('https://www.instagram.com/a/b/reel/ABC12/'), null);
});
