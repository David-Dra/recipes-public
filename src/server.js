// HTTP server: pages, images from SITE_DATA, a few static files. Started directly it also runs the sync.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderHome, renderRecipe, renderNotFound, esc } from './render.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = { 'app.css': 'text/css; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8',
  'sort.js': 'text/javascript; charset=utf-8', 'scale.js': 'text/javascript; charset=utf-8' };
const IMAGE = /^\/img\/([0-9]+-[0-9a-f]{8}-(?:full|thumb)\.jpg)$/;
const HEADERS = {
  'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export function createApp({ settings: s, dataDir, getIndex }) {
  const statics = Object.fromEntries(Object.keys(STATIC).map((f) => [f, readFileSync(join(ROOT, 'public', f))]));
  const theme = `:root { --accent: ${s.accent}; }\n`;

  return createServer((req, res) => {
    const send = (status, type, body, extra = {}) => {
      res.writeHead(status, { ...HEADERS, ...(s.indexable ? {} : { 'x-robots-tag': 'noindex' }), 'content-type': type, ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    const html = (status, body) => send(status, 'text/html; charset=utf-8', body, { 'cache-control': 'no-cache' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'method not allowed', { allow: 'GET, HEAD' });

    const path = req.url.split('?')[0];
    const index = getIndex();
    if (path === '/healthz') return send(200, 'text/plain', 'ok');
    if (path === '/') return html(200, renderHome(index, s));
    if (path.startsWith('/r/')) {
      const r = index?.recipes.find((x) => x.slug === path.slice(3));
      return r ? html(200, renderRecipe(r, s)) : html(404, renderNotFound(s));
    }
    const img = IMAGE.exec(path);
    if (img) {
      const file = join(dataDir, 'img', img[1]);
      if (existsSync(file)) return send(200, 'image/jpeg', readFileSync(file), { 'cache-control': 'public, max-age=31536000, immutable' });
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
