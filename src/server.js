// HTTP server: pages, images from SITE_DATA, a few static files. Started directly it also runs the sync.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderHome, renderRecipe, renderNotFound, renderQueue, renderImpressum, renderDatenschutz, esc } from './render.js';
import { loadLegal } from './legal.js';
import { makeHub, hubFromEnv } from './hub.js';
import { berlinClock } from './berlin.js';
import { normalise } from './link.js';
import T from './strings.js';

// Colours of the sort pills and their values (protein per 100 kcal uses the accent). Readable on the dark glass.
export const PALETTE = { protein: '#4ade80', kcal: '#fb923c', quick: '#c084fc', newest: '#f472b6' };

// Logo files at the paths browsers and phones look for (public/icons; made from logo.svg)
const ICONS = { '/favicon.svg': ['logo.svg', 'image/svg+xml'], '/favicon.ico': ['favicon-32.png', 'image/png'],
  '/favicon-32.png': ['favicon-32.png', 'image/png'], '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
  '/icon-192.png': ['icon-192.png', 'image/png'], '/icon-512.png': ['icon-512.png', 'image/png'] };
const BG = /^\/bg\/([a-z0-9-]{1,40}-(?:3840|1920|portrait)\.(avif|webp|jpg))$/;
const BG_TYPES = { avif: 'image/avif', webp: 'image/webp', jpg: 'image/jpeg' };

// The background photo behind the glass, darkened so text stays readable: 1920 px, 3840 px on big or sharp screens,
// a portrait crop on phones. AVIF, WebP and (1920 only) JPEG: the browser takes the first it can show.
function backgroundCss(name) {
  if (!name) return '';
  const set = (size) => `image-set(${[['avif', 'image/avif'], ['webp', 'image/webp'], ['jpg', 'image/jpeg']]
    .filter(([ext]) => size === '1920' || ext !== 'jpg')
    .map(([ext, type]) => `url("/bg/${name}-${size}.${ext}") type("${type}")`).join(', ')})`;
  const layer = (size) => `body::before { background-image: linear-gradient(rgba(6, 10, 30, 0.42), rgba(6, 10, 30, 0.62)), ${set(size)}; }`;
  return `body::before { content: ""; position: fixed; inset: 0; z-index: -1; background-size: cover; background-position: center; }
${layer('1920')}
@media (min-width: 1921px), (min-width: 1100px) and (min-resolution: 2dppx) { ${layer('3840')} }
@media (orientation: portrait) { ${layer('portrait')} }
`;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { 'app.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
  'sort.js': 'text/javascript; charset=utf-8', 'scale.js': 'text/javascript; charset=utf-8' };
const IMAGE = /^\/img\/([0-9]+-[0-9a-f]{8}-(?:(?:full|thumb)\.jpg|(?:480|960|1600)\.webp))$/;
const HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

const MAX_BODY = 2048;

function readBody(req) {   // resolves the body, or null when it is bigger than MAX_BODY
  return new Promise((resolve) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => { size += c.length; if (size <= MAX_BODY) parts.push(c); });
    req.on('end', () => resolve(size > MAX_BODY ? null : Buffer.concat(parts).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}

// Saved entries get their recipe page once the sync has the recipe (matched by the reel's shortcode).
function withSlugs(queue, index) {
  if (!queue) return null;
  const bySc = new Map((index?.recipes || []).filter((r) => r.reelUrl).map((r) => [r.reelUrl.split('/').filter(Boolean).at(-1), r.slug]));
  return { ...queue, entries: queue.entries.map((e) => (bySc.has(e.shortcode) ? { ...e, slug: bySc.get(e.shortcode) } : e)) };
}

export function createApp({ settings: base, dataDir, getIndex, hub = makeHub({}) }) {
  let s = base;
  // impressum.toml is read again only when it changes (David pushes it onto the CT while the site runs)
  let legalAt = null;
  let legal = null;
  const refreshLegal = () => {
    let at = 0;
    try { at = statSync(join(dataDir, 'impressum.toml')).mtimeMs; } catch { /* no file */ }
    if (at !== legalAt) { legalAt = at; legal = at ? loadLegal(dataDir) : null; s = { ...base, legal: Boolean(legal) }; }
  };
  const submitOn = s.submit_enabled && hub.configured;
  const origin = new URL(s.base_url).origin;
  const statics = Object.fromEntries(Object.keys(STATIC).map((f) => [f, readFileSync(join(ROOT, 'public', f))]));
  const icons = Object.fromEntries(Object.entries(ICONS).map(([p, [f]]) => [p, readFileSync(join(ROOT, 'public', 'icons', f))]));
  const manifest = JSON.stringify({ name: s.title, short_name: s.title.slice(0, 12), start_url: '/', scope: '/', display: 'standalone',
    background_color: '#0b1026', theme_color: '#0b1026', lang: s.language,
    icons: [192, 512].map((n) => ({ src: `/icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png', purpose: 'any' })) });
  const colours = Object.entries({ ratio: s.accent, ...PALETTE }).map(([k, c]) => ` --c-${k}: ${c};`).join('');
  const theme = `:root { --accent: ${s.accent};${colours} }\n${backgroundCss(s.background)}`;

  async function submit(req, index, html, json) {
    const wantsJson = (req.headers.accept || '').includes('application/json');
    const fail = (status, message) => (wantsJson ? json(status, { ok: false, message }) : html(status, renderQueue(hub.cached(), s, { message })));
    if (req.headers.origin && req.headers.origin !== origin) return fail(403, 'forbidden');
    const body = await readBody(req);
    if (body === null) return fail(413, 'too big');
    const link = normalise(new URLSearchParams(body).get('url'));
    if (!link) return fail(400, T.badLink);
    const r = await hub.submit(link);
    // The hub's cap counts everyone together (10 per 3 h); there is no limit per visitor.
    if (r.status === 429) return fail(429, T.fullNow(s.ask_for_more, berlinClock(r.body?.detail?.next_free_at)));
    if (r.status === 400) return fail(400, T.badLink);
    if (r.status !== 200) return fail(503, T.paused);
    if (wantsJson) return json(200, { ok: true, message: T.added, entry: r.body });
    const res = html.res;
    res.writeHead(303, { location: `/queue#${encodeURIComponent(r.body.id)}`, 'cache-control': 'no-store' });
    return res.end();
  }

  return createServer((req, res) => {
    refreshLegal();
    const send = (status, type, body, extra = {}) => {
      res.writeHead(status, { ...HEADERS, ...(s.indexable ? {} : { 'x-robots-tag': 'noindex' }), 'content-type': type, ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const html = (status, body) => send(status, 'text/html; charset=utf-8', body, { 'cache-control': 'no-cache' });
    html.res = res;
    const path = req.url.split('?')[0];
    const index = getIndex();
    const json = (status, body) => send(status, 'application/json', JSON.stringify(body), { 'cache-control': 'no-store' });
    if (path === '/submit') {
      if (!submitOn) return html(404, renderNotFound(s));
      if (req.method === 'POST') {
        return submit(req, index, html, json).catch(() => html(503, renderQueue(null, s, { message: T.paused })));
      }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'method not allowed', { allow: 'GET, HEAD' });

    if (path === '/healthz') return send(200, 'text/plain', 'ok');
    if (path === '/') {
      if (submitOn) hub.queue();   // refreshes the cached count for the next visitor; this page never waits for it
      return html(200, renderHome(index, s, { submit: submitOn, queue: submitOn ? hub.cached() : null, paused: hub.down }));
    }
    if (submitOn && (path === '/queue' || path === '/queue.json')) {
      return hub.queue().then((q) => {
        const queue = withSlugs(q, getIndex());
        if (path === '/queue.json') return json(200, queue || { paused: true, unavailable: true, entries: [] });
        return html(200, renderQueue(queue, s));
      }).catch(() => html(503, renderQueue(null, s)));   // never an unhandled rejection: that would stop the site
    }
    if (path.startsWith('/r/')) {
      const r = index?.recipes.find((x) => x.slug === path.slice(3));
      return r ? html(200, renderRecipe(r, s)) : html(404, renderNotFound(s));
    }
    const img = IMAGE.exec(path);
    if (img) {
      let data = null;
      try {
        data = readFileSync(join(dataDir, 'img', img[1]));
      } catch {
        // missing, or deleted by the sync a moment ago: a 404, never a crash
      }
      if (data) return send(200, img[1].endsWith('.webp') ? 'image/webp' : 'image/jpeg', data, { 'cache-control': 'public, max-age=31536000, immutable' });
    }
    if (Object.hasOwn(ICONS, path)) return send(200, ICONS[path][1], icons[path], { 'cache-control': 'public, max-age=86400' });
    if (path === '/manifest.webmanifest') return send(200, 'application/manifest+json', manifest, { 'cache-control': 'public, max-age=3600' });
    const bg = BG.exec(path);
    if (bg) {
      let data = null;
      try { data = readFileSync(join(ROOT, 'public', 'bg', bg[1])); } catch { /* not there: 404 below */ }
      if (data) return send(200, BG_TYPES[bg[2]], data, { 'cache-control': 'public, max-age=604800' });
    }
    if (path.startsWith('/static/') && Object.hasOwn(statics, path.slice(8))) {
      return send(200, STATIC[path.slice(8)], statics[path.slice(8)], { 'cache-control': 'public, max-age=300' });
    }
    if (legal && path === '/impressum') return html(200, renderImpressum(legal, s));
    if (legal && path === '/datenschutz') return html(200, renderDatenschutz(legal, s));
    if (path === '/theme.css') return send(200, 'text/css; charset=utf-8', theme, { 'cache-control': 'public, max-age=300' });
    if (path === '/robots.txt') {
      return send(200, 'text/plain', s.indexable ? `User-agent: *\nAllow: /\nSitemap: ${s.base_url}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n');
    }
    if (path === '/sitemap.xml' && s.indexable) {
      const urls = ['/', ...(index?.recipes || []).map((r) => `/r/${r.slug}`)];
      return send(200, 'application/xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
        urls.map((u) => `<url><loc>${esc(s.base_url + u)}</loc></url>`).join('\n')}\n</urlset>\n`);
    }
    return html(404, renderNotFound(s));
  });
}

async function main() {
  const { loadSettings } = await import('./settings.js');
  const { startSync, loadIndex } = await import('./sync.js');
  const { makeDav } = await import('./webdav.js');
  if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));
  const settings = loadSettings(join(ROOT, 'settings.toml'));
  const dataDir = process.env.SITE_DATA || join(ROOT, 'data');
  let index = loadIndex(dataDir);
  const { NEXTCLOUD_URL: url, NEXTCLOUD_USER: user, NEXTCLOUD_APP_PASSWORD: password } = process.env;
  if (url && user && password) {
    startSync({ dav: makeDav({ url, user, password }), sharePath: settings.share_path, dataDir, minutes: settings.sync_minutes,
      onIndex: (i) => { if (i) index = i; } });
  } else {
    console.log('sync off: NEXTCLOUD_URL, NEXTCLOUD_USER and NEXTCLOUD_APP_PASSWORD are not all set');
  }
  const port = Number(process.env.PORT) || 3000;
  const hub = hubFromEnv(process.env);
  if (!hub.configured) console.log('reel links off: NEXUS_HUB_URL and NEXUS_HUB_TOKEN are not both set');
  createApp({ settings, dataDir, getIndex: () => index, hub }).listen(port, () => console.log(`recipes on :${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
