// A tiny stand-in for Nextcloud's WebDAV: PROPFIND (Depth 1) and GET over an in-memory tree, Basic auth.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const etag = (body) => createHash('sha1').update(body).digest('hex');

// tree: { '/Shared/Recipes': {dir: true}, '/Shared/Recipes/Pancakes/recipe.json': {body: '...'} }
// Paths are relative to /remote.php/dav/files/<user>. File ids are given or numbered in insertion order.
export async function startFakeDav(tree, { user = 'reader', password = 'secret' } = {}) {
  let status = 0;
  const gets = [];
  const ids = new Map();
  let next = 1000;
  const idOf = (p) => tree[p].id ?? ids.get(p) ?? (ids.set(p, String(next++)), ids.get(p));
  const root = `/remote.php/dav/files/${user}`;
  const auth = 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64');
  // Like Nextcloud: a folder's ETag changes whenever anything below it changes.
  const dirEtag = (p) => etag(Object.keys(tree).filter((k) => k.startsWith(p + '/')).sort()
    .map((k) => k + ':' + (tree[k].body ?? '')).join('|'));

  const server = createServer((req, res) => {
    if (status) { res.writeHead(status); return res.end(); }
    if (req.headers.authorization !== auth) { res.writeHead(401); return res.end(); }
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(root)) { res.writeHead(404); return res.end(); }
    const path = decodeURIComponent(url.pathname.slice(root.length)).replace(/\/$/, '') || '/';
    const node = tree[path];
    if (!node) { res.writeHead(404); return res.end(); }

    if (req.method === 'GET') {
      gets.push(path);
      res.writeHead(200);
      return res.end(node.body);
    }
    if (req.method === 'PROPFIND') {
      const children = Object.keys(tree).filter((p) => p !== path && p.startsWith(path + '/') && !p.slice(path.length + 1).includes('/'));
      const entry = (p) => {
        const n = tree[p];
        const href = root + p.split('/').map(encodeURIComponent).join('/') + (n.dir ? '/' : '');
        const body = n.body ?? '';
        return `<d:response><d:href>${href}</d:href><d:propstat><d:prop>` +
          `<d:getetag>&quot;${n.dir ? dirEtag(p) : etag(body)}&quot;</d:getetag>` +
          `<d:resourcetype>${n.dir ? '<d:collection/>' : ''}</d:resourcetype>` +
          (n.dir ? '' : `<d:getcontentlength>${Buffer.byteLength(body)}</d:getcontentlength>`) +
          `<oc:fileid>${idOf(p)}</oc:fileid>` +
          `</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
      };
      res.writeHead(207, { 'content-type': 'application/xml; charset=utf-8' });
      return res.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">` +
        [path, ...children].map(entry).join('') + `</d:multistatus>`);
    }
    res.writeHead(405);
    res.end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    user,
    password,
    gets,
    setStatus(code) { status = code; },
    close: () => new Promise((r) => server.close(r)),
  };
}
