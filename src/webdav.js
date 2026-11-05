// Read-only WebDAV client for a Nextcloud user's files: list a folder (PROPFIND Depth 1) and download a file.
import { XMLParser } from 'fast-xml-parser';

export class DavError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;   // HTTP status, 0 when the server was not reachable
  }
}

const PROPFIND = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns"><d:prop>` +
  `<d:getetag/><d:resourcetype/><d:getcontentlength/><oc:fileid/></d:prop></d:propfind>`;

const xml = new XMLParser({ removeNSPrefix: true, isArray: (name) => name === 'response' || name === 'propstat' });
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

export function makeDav({ url, user, password, timeoutMs = 30000 }) {
  const base = `${url.replace(/\/+$/, '')}/remote.php/dav/files/${encodeURIComponent(user)}`;
  const basePath = new URL(base).pathname;
  const headers = { authorization: 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64') };

  async function call(method, path, extra = {}) {
    let res;
    try {
      res = await fetch(base + encodePath(path), { method, headers: { ...headers, ...extra.headers }, body: extra.body,
        redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw new DavError(`${method} ${path}: ${e.cause?.code || e.name}`, 0);
    }
    if (res.status !== (extra.expect || 200)) throw new DavError(`${method} ${path}: HTTP ${res.status}`, res.status);
    return res;
  }

  return {
    async list(path) {
      const res = await call('PROPFIND', path, { headers: { depth: '1', 'content-type': 'application/xml' }, body: PROPFIND, expect: 207 });
      const doc = xml.parse(await res.text());
      const self = path.replace(/\/+$/, '');
      return (doc.multistatus?.response || []).map((r) => {
        const href = decodeURIComponent(String(r.href)).replace(/\/+$/, '');
        const ok = (r.propstat || []).find((p) => String(p.status).includes(' 200 '));
        const prop = ok?.prop || {};
        const rel = href.startsWith(basePath) ? href.slice(basePath.length) : href;
        return {
          name: rel.split('/').pop(),
          path: rel,
          isDir: prop.resourcetype != null && typeof prop.resourcetype === 'object' && 'collection' in prop.resourcetype,
          etag: String(prop.getetag ?? '').replace(/"/g, ''),
          fileId: String(prop.fileid ?? ''),
          size: Number(prop.getcontentlength ?? 0),
        };
      }).filter((e) => e.path !== self);
    },
    async get(path) {
      const res = await call('GET', path);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
