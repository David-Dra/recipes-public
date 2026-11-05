// Local demo: a fake Nextcloud with made-up recipes, and the site on http://localhost:3000 synced from it.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { startFakeDav } from './fake-webdav.js';
import { makeDav } from '../src/webdav.js';
import { startSync } from '../src/sync.js';
import { createApp } from '../src/server.js';
import { DEFAULTS } from '../src/settings.js';

// A small solid-colour PNG (browsers sniff it fine even when served as image/jpeg in this demo).
function png(r, g, b, w = 64, h = 48) {
  const crc = (buf) => { let c, n = ~0; for (const x of buf) { c = (n ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; n = (n >>> 8) ^ c; } return ~n >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))]);
}

const R = '/Shared/Recipes';
const recipes = [
  ['Chicken Shawarma Bowl', 430, 48, 25, [245, 158, 11], 'https://www.instagram.com/reel/DEMO1/', 'demo.creator'],
  ['Skyr Pesto Pasta', 520, 51, 20, [132, 204, 22], 'https://www.instagram.com/reel/DEMO2/', null],
  ['Turkey Chili', 460, 42, 40, [244, 63, 94], null, null],
  ['Protein Pancakes', 400, 30, 15, [253, 230, 138], 'https://www.instagram.com/reel/DEMO3/', 'pancake.lab'],
  ['Salmon Rice Bowl', 540, 38, 30, null, null, null],
  ['Berry Overnight Oats', 410, 17, 5, [167, 139, 250], null, null],
];
const tree = { [R]: { dir: true } };
recipes.forEach(([name, kcal, protein, min, colour, url, handle], i) => {
  const dir = `${R}/${name}`;
  tree[dir] = { dir: true, id: String(100 + i) };
  tree[`${dir}/recipe.json`] = { body: JSON.stringify({
    name, description: 'A made-up demo recipe.\n\nNährwerte pro Portion geschätzt (Ollama).', url, recipeYield: 2, totalTime: `PT${min}M`,
    dateCreated: `2026-10-${String(10 + i).padStart(2, '0')}T12:00:00+0000`, keywords: 'demo,high protein',
    author: handle ? { name: handle, url: `https://www.instagram.com/${handle}/` } : undefined,
    recipeIngredient: ['400 g chicken thigh', '1,5 l water', '1/2 tsp cumin', 'salt to taste'],
    recipeInstructions: ['Prepare everything.', 'Cook it.', 'Serve.'],
    nutrition: { calories: `${kcal} kcal`, proteinContent: `${protein} g`, carbohydrateContent: '40 g', fatContent: '12 g' },
  }) };
  if (colour) {
    tree[`${dir}/full.jpg`] = { body: png(...colour, 640, 360) };
    tree[`${dir}/thumb.jpg`] = { body: png(...colour) };
  }
});

const fake = await startFakeDav(tree);
const dataDir = mkdtempSync(join(tmpdir(), 'recipes-demo-'));
let index = null;
startSync({ dav: makeDav({ url: fake.url, user: fake.user, password: fake.password }), sharePath: R, dataDir, minutes: 60, onIndex: (i) => (index = i) });
const port = Number(process.env.PORT) || 3000;
createApp({ settings: { ...DEFAULTS, title: 'Demo Kitchen', base_url: `http://localhost:${port}` }, dataDir, getIndex: () => index })
  .listen(port, () => console.log(`demo on http://localhost:${port}`));
