import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleLine } from '../public/scale.js';

test('400 g doubled', () => assert.equal(scaleLine('400 g chicken thigh', 2), '800 g chicken thigh'));
test('1,5 l halved', () => assert.equal(scaleLine('1,5 l milk', 0.5), '0,75 l milk'));
test('1/2 tsp tripled', () => assert.equal(scaleLine('1/2 tsp cumin', 3), '1 ½ tsp cumin'));
test('1 ½ doubled', () => assert.equal(scaleLine('1 ½ cups oats', 2), '3 cups oats'));
test('salt to taste unchanged', () => assert.equal(scaleLine('salt to taste', 3), 'salt to taste'));
test('factor 1 keeps the line exactly', () => assert.equal(scaleLine('1/2 tsp cumin', 1), '1/2 tsp cumin'));
test('big amounts round to whole numbers', () => assert.equal(scaleLine('150 g skyr', 1.5), '225 g skyr'));
test('odd small amounts round to halves', () => assert.equal(scaleLine('1 egg', 1.5), '1 ½ egg'));
test('small amounts keep quarters', () => assert.equal(scaleLine('1/2 tsp cumin', 1.5), '¾ tsp cumin'));
test('number glued to the unit', () => assert.equal(scaleLine('200g rice', 0.5), '100g rice'));
