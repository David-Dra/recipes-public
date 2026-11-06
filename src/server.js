// HTTP server: pages, images from SITE_DATA, a few static files. Started directly it also runs the sync.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderHome, renderRecipe, renderNotFound, renderQueue, esc } from './render.js';
import { makeHub } from './hub.js';
import { makeIpCap } from './ipcap.js';
import { normalise } from './link.js';
import T from './strings.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { 'app.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
  'sort.js': 'text/javascript; charset=utf-8', 'scale.js': 'text/javascript; charset=utf-8' };
const IMAGE = /^\/img\/([0-9]+-[0-9a-f]{8}-(?:full|thumb)\.jpg)$/;
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

export function createApp({ settings: s, dataDir, getIndex, hub = makeHub({}) }) {
  const submitOn = s.submit_enabled && hub.configured;
  const ipcap = makeIpCap(s.ip_daily_limit);
  const origin = new URL(s.base_url).origin;
  const statics = Object.fromEntries(Object.keys(STATIC).map((f) => [f, readFileSync(join(ROOT, 'public', f))]));
  const theme = `:root { --accent: ${s.accent}; }\n`;

  async function submit(req, index, html, json) {
    const wantsJson = (req.headers.accept || '').includes('application/json');
    const fail = (status, message) => (wantsJson ? json(status, { ok: false, message }) : html(status, renderQueue(hub.cached(), s, { message })));
    if (req.headers.origin && req.headers.origin !== origin) return fail(403, 'forbidden');
    const body = await readBody(req);
    if (body === null) return fail(413, 'too big');
    const link = normalise(new URLSearchParams(body).get('url'));
    if (!link) return fail(400, T.badLink);
    const ip = req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';
    if (!ipcap.take(ip)) return fail(429, T.ipFull(s.ip_daily_limit));
    const r = await hub.submit(link);
    if (r.status !== 200 || r.body?.counts === false) ipcap.give(ip);   // nothing was added: the visitor keeps the slot
    if (r.status === 429) return fail(429, T.fullToday);
    if (r.status === 400) return fail(400, T.badLink);
    if (r.status !== 200) return fail(503, T.paused);
    if (wantsJson) return json(200, { ok: true, message: T.added, entry: r.body });
    const res = html.res;
    res.writeHead(303, { location: `/queue#${encodeURIComponent(r.body.id)}`, 'cache-control': 'no-store' });
    return res.end();
  }

  return createServer((req, res) => {
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
      if (req.method === 'POST') return submit(req, index, html, json);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'method not allowed', { allow: 'GET, HEAD' });

    if (path === '/healthz') return send(200, 'text/plain', 'ok');
    if (path === '/') {
      if (submitOn) hub.queue();   // refreshes the cached count for the next visitor; this page never waits for it
      return html(200, renderHome(index, s, { submit: submitOn, queue: submitOn ? hub.cached() : null }));
    }
    if (submitOn && (path === '/queue' || path === '/queue.json')) {
      return hub.queue().then((q) => {
        const queue = withSlugs(q, getIndex());
        if (path === '/queue.json') return json(200, queue || { paused: true, unavailable: true, entries: [] });
        return html(200, renderQueue(queue, s));
      });
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
      if (data) return send(200, 'image/jpeg', data, { 'cache-control': 'public, max-age=31536000, immutable' });
    }
    if (path.startsWith('/static/') && Object.hasOwn(statics, path.slice(8))) {
      return send(200, STATIC[path.slice(8)], statics[path.slice(8)], { 'cache-control': 'public, max-age=300' });
    }
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
  createApp({ settings, dataDir, getIndex: () => index }).listen(port, () => console.log(`recipes on :${port}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
