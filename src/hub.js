// Client for the Nexus hub's recipe-site API (token scoped to /api/recipe-site/). It never throws and never makes
// a page wait long: an unreachable or slow hub means "adding is paused", the rest of the site is not affected.
import { berlinDay } from './ipcap.js';

const PAUSED = { status: 503, body: { message: 'paused' } };
const MAX_AGE = 60_000;   // a cached queue older than this is not shown (the count would be stale)

export function makeHub({ url = '', token = '', timeoutMs = 5000, cacheMs = 10000, now = Date.now } = {}) {
  const base = url.replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let last = null;       // { at, value }
  let pending = null;    // the queue request in flight, shared by everyone asking meanwhile

  async function call(method, path, body) {
    const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs) });
    let json = {};
    try { json = await res.json(); } catch { /* empty or not JSON */ }
    return { status: res.status, body: json && typeof json === 'object' ? json : {} };
  }
  const isQueue = (q) => q && Number.isInteger(q.limit) && Number.isInteger(q.left) && Array.isArray(q.entries);

  const hub = {
    configured: Boolean(base && token),
    down: false,   // the last call failed: the box says adding is paused
    // The newest queue, if it is fresh and of today (Berlin): for pages that must not wait on the hub.
    cached() {
      if (!last || now() - last.at > MAX_AGE) return null;
      return last.value.day && last.value.day !== berlinDay(now()) ? null : last.value;
    },
    async queue() {
      if (!base || !token) return null;
      if (last && now() - last.at < cacheMs) return last.value;
      pending ??= (async () => {
        try {
          const r = await call('GET', '/api/recipe-site/queue');
          if (r.status !== 200 || !isQueue(r.body)) { hub.down = true; return null; }
          hub.down = false;
          last = { at: now(), value: r.body };
          return r.body;
        } catch {
          hub.down = true;
          return null;
        } finally {
          pending = null;
        }
      })();
      return pending;
    },
    async submit(link) {
      if (!base || !token) return PAUSED;
      try {
        const r = await call('POST', '/api/recipe-site/submit', { url: link });
        if (r.status >= 500 || r.status === 401 || r.status === 403) { hub.down = true; return PAUSED; }
        if (r.status === 200 && !r.body.id) return PAUSED;   // not an entry: treat as paused, never crash
        hub.down = false;
        last = null;   // the count changed
        return r;
      } catch {
        hub.down = true;
        return PAUSED;
      }
    },
  };
  return hub;
}

// The site's secrets (site secret set NEXUS_HUB_URL / NEXUS_HUB_TOKEN); without both the box stays hidden.
export const hubFromEnv = (env) => makeHub({ url: env.NEXUS_HUB_URL || '', token: env.NEXUS_HUB_TOKEN || '' });
