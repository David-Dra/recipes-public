import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRecipe, assignSlugs } from '../src/recipe.js';

const fixture = (name) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const meta = (id = '101') => ({ id, folder: 'Folder', etag: 'abc' });
const parse = (obj, id) => parseRecipe(JSON.stringify(obj), meta(id));

test('full recipe parses', () => {
  const r = parseRecipe(fixture('shawarma.json'), meta());
  assert.equal(r.name, 'Chicken Shawarma Bowl');
  assert.equal(r.protein, 48);
  assert.equal(r.kcal, 430);
  assert.equal(r.carbs, 38);
  assert.equal(r.fat, 12);
  assert.equal(r.ratio, 11.2);
  assert.equal(r.minutes, 25);
  assert.equal(r.servings, 2);
  assert.equal(r.reelUrl, 'https://www.instagram.com/reel/ABC123/');
  assert.deepEqual(r.creator, { name: 'somecreator', url: 'https://www.instagram.com/somecreator/' });
  assert.deepEqual(r.keywords, ['chicken', 'bowl']);
  assert.equal(r.ingredients.length, 4);
  assert.deepEqual(r.steps, ['Marinate the chicken.', 'Cook the rice.']);
  assert.deepEqual(r.image, { full: null, thumb: null });
  assert.equal(r.estimated, false);
});

test('german decimals', () => {
  const r = parse({ name: 'X', nutrition: { calories: '512,5 kcal', proteinContent: '48,5 g' } });
  assert.equal(r.kcal, 512.5);
  assert.equal(r.protein, 48.5);
});

test('duration PT1H20M is 80', () => {
  assert.equal(parse({ name: 'X', totalTime: 'PT1H20M' }).minutes, 80);
});

test('prep plus cook when no total', () => {
  assert.equal(parse({ name: 'X', prepTime: 'PT10M', cookTime: 'PT15M', totalTime: '' }).minutes, 25);
});

test('estimated sentence stripped', () => {
  const r = parse({ name: 'X', description: 'Tasty.\n\nNährwerte pro Portion geschätzt (Ollama).' });
  assert.equal(r.description, 'Tasty.');
  assert.equal(r.estimated, true);
});

test('non-instagram url gives no reel', () => {
  assert.equal(parse({ name: 'X', url: 'https://example.com/r/1' }).reelUrl, null);
  assert.equal(parse({ name: 'X', url: 'javascript:alert(1)' }).reelUrl, null);
});

test('author without url gives no creator', () => {
  assert.equal(parse({ name: 'X', author: { name: 'Tasty Tales | Food Page' } }).creator, null);
});

test('steps as one string', () => {
  assert.deepEqual(parse({ name: 'X', recipeInstructions: 'One\nTwo\n\nThree' }).steps, ['One', 'Two', 'Three']);
});

test('invalid json is null', () => {
  assert.equal(parseRecipe('{not json', meta()), null);
});

test('no name is null', () => {
  assert.equal(parse({ description: 'nameless' }), null);
});

test('nutrition missing gives null ratio', () => {
  const r = parse({ name: 'X' });
  assert.equal(r.ratio, null);
  assert.equal(r.kcal, null);
});

test('nutrition as a string gives nulls', () => {
  assert.equal(parse({ name: 'X', nutrition: '430 kcal' }).kcal, null);
});

test('duplicate names get distinct stable slugs', () => {
  const a = parse({ name: 'Pancakes' }, '1001');
  const b = parse({ name: 'Pancakes' }, '2002');
  const c = parse({ name: 'Turkey Chili' }, '3003');
  assignSlugs([a, b, c]);
  assert.notEqual(a.slug, b.slug);
  assert.equal(c.slug, 'turkey-chili');
  const a2 = parse({ name: 'Pancakes' }, '1001');
  const b2 = parse({ name: 'Pancakes' }, '2002');
  assignSlugs([b2, a2]);
  assert.equal(a2.slug, a.slug);
  assert.equal(b2.slug, b.slug);
});

test('umlaut slug', () => {
  const r = parse({ name: 'Käsespätzle mit Röstzwiebeln & Soße' });
  assignSlugs([r]);
  assert.equal(r.slug, 'kaesespaetzle-mit-roestzwiebeln-sosse');
});

test('name without letters still gets a slug', () => {
  const r = parse({ name: '🍜🍜' }, '4242');
  assignSlugs([r]);
  assert.equal(r.slug, 'recipe-4242');
});
