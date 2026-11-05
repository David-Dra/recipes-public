// Copies the Cookbook share into dataDir: index.json (all recipes) + img/<fileid>-<etag8>-{full,thumb}.jpg.
// Only folders whose ETag changed are looked at again; the index is swapped in with one rename, so a reader never
// sees half a sync, and any error keeps the last good copy.
import { mkdirSync, readFileSync, writeFileSync, renameSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseRecipe, assignSlugs } from './recipe.js';

const IMAGES = { full: 'full.jpg', thumb: 'thumb.jpg' };

export function loadIndex(dataDir) {
  try {
    const index = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8'));
    return Array.isArray(index?.recipes) ? index : null;
  } catch {
    return null;
  }
}

function writeIndex(dataDir, index) {
  const tmp = join(dataDir, `index.json.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(index));
  renameSync(tmp, join(dataDir, 'index.json'));
}

// One folder -> {recipe, source} or null (no or broken recipe.json). `prev` is that folder's last result.
async function readFolder(dav, dir, prev, imgDir) {
  const files = Object.fromEntries((await dav.list(dir.path)).filter((f) => !f.isDir).map((f) => [f.name, f]));
  const json = files['recipe.json'];
  if (!json) return null;
  let recipe;
  if (prev && prev.source.json === json.etag) {
    recipe = { ...prev.recipe, image: { ...prev.recipe.image } };
  } else {
    recipe = parseRecipe((await dav.get(json.path)).toString('utf8'), { id: dir.fileId, folder: dir.name, etag: json.etag });
    if (!recipe) return null;
  }
  const source = { folder: dir.etag, json: json.etag };
  for (const [kind, name] of Object.entries(IMAGES)) {
    const f = files[name];
    if (!f) { recipe.image[kind] = null; continue; }
    const file = `${dir.fileId}-${f.etag.replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase().padEnd(8, '0')}-${kind}.jpg`;
    if (!existsSync(join(imgDir, file))) writeFileSync(join(imgDir, file), await dav.get(f.path));
    recipe.image[kind] = file;
    source[kind] = f.etag;
  }
  return { recipe, source };
}

export async function syncOnce({ dav, sharePath, dataDir, log = console.log }) {
  const imgDir = join(dataDir, 'img');
  mkdirSync(imgDir, { recursive: true });
  const old = loadIndex(dataDir);
  const before = new Map((old?.recipes || []).map((r) => [r.id, { recipe: r, source: old.sources?.[r.id] || {} }]));

  let dirs;
  try {
    dirs = (await dav.list(sharePath)).filter((e) => e.isDir && /^[0-9]+$/.test(e.fileId));
  } catch (e) {
    log(`sync: ${e.message} (keeping the last copy)`);
    return { count: old?.recipes.length || 0, changed: 0, skipped: 0 };
  }

  const recipes = [];
  const sources = {};
  let changed = 0;
  let skipped = 0;
  for (const dir of dirs) {
    const prev = before.get(dir.fileId);
    let got;
    if (prev && prev.source.folder === dir.etag) {
      got = prev;
    } else {
      try {
        got = await readFolder(dav, dir, prev, imgDir);
      } catch (e) {
        log(`sync: ${dir.name}: ${e.message}`);
        got = prev || null;
      }
      if (!got) { skipped++; log(`sync: ${dir.name}: no readable recipe.json, skipped`); continue; }
      if (got !== prev) changed++;
    }
    recipes.push(got.recipe);
    sources[got.recipe.id] = got.source;
  }

  assignSlugs(recipes);
  writeIndex(dataDir, { synced: new Date().toISOString(), recipes, sources });
  const keep = new Set(recipes.flatMap((r) => [r.image.full, r.image.thumb]).filter(Boolean));
  for (const f of readdirSync(imgDir)) if (!keep.has(f)) rmSync(join(imgDir, f), { force: true });
  return { count: recipes.length, changed, skipped };
}

// Runs at once, then every `minutes`; onIndex gets each new index. Never throws.
export function startSync({ minutes, onIndex = () => {}, log = console.log, ...opts }) {
  let timer = null;
  let stopped = false;
  const run = async () => {
    try {
      const res = await syncOnce({ ...opts, log });
      log(`sync: ${res.count} recipes (${res.changed} changed, ${res.skipped} skipped)`);
      onIndex(loadIndex(opts.dataDir));
    } catch (e) {
      log(`sync: failed: ${e.message}`);
    }
    if (!stopped) timer = setTimeout(run, minutes * 60_000);
  };
  run();
  return { stop() { stopped = true; clearTimeout(timer); } };
}
