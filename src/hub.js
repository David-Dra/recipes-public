// Client for the Nexus hub's recipe-site API (token scoped to /api/recipe-site/). It never throws and never makes
// a page wait long: an unreachable or slow hub means "adding is paused", the rest of the site is not affected.
const PAUSED = { status: 503, body: { message: 'paused' } };

export function makeHub({ url = '', token = '', timeoutMs = 5000, cacheMs = 10000, now = Date.now } = {}) {
  const base = url.replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let last = null;   // { at, value }

  async function call(method, path, body) {
    const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body), redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs) });
    let json = {};
    try { json = await res.json(); } catch { /* empty or not JSON */ }
    return { status: res.status, body: json };
  }

  return {
    configured: Boolean(base && token),
    // The newest queue this process has seen (or null): for pages that must not wait on the hub.
    cached: () => last?.value ?? null,
    async queue() {
      if (!base || !token) return null;
      if (last && now() - last.at < cacheMs) return last.value;
      try {
        const r = await call('GET', '/api/recipe-site/queue');
        if (r.status !== 200) return null;
        last = { at: now(), value: r.body };
        return r.body;
      } catch {
        return null;
      }
    },
    async submit(link) {
      if (!base || !token) return PAUSED;
      try {
        const r = await call('POST', '/api/recipe-site/submit', { url: link });
        if (r.status >= 500 || r.status === 401 || r.status === 403) return PAUSED;
        last = null;   // the count changed
        return r;
      } catch {
        return PAUSED;
      }
    },
  };
}

// The site's secrets (site secret set NEXUS_HUB_URL / NEXUS_HUB_TOKEN); without both the box stays hidden.
export const hubFromEnv = (env) => makeHub({ url: env.NEXUS_HUB_URL || '', token: env.NEXUS_HUB_TOKEN || '' });
