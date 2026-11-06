// A stand-in for the Nexus hub's /api/recipe-site/ endpoints: records requests, answers what the test sets.
import { createServer } from 'node:http';

export async function startFakeHub({ token = 'rs-token' } = {}) {
  const requests = [];
  const state = {
    hang: false,
    submit: { status: 200, body: { id: 'e1', shortcode: 'ABC', url: 'https://www.instagram.com/reel/ABC/', state: 'waiting',
      position: 1, reason: null, created_at: '2026-11-06T10:00:00Z', counts: true } },
    queue: { status: 200, body: { day: '2026-11-06', limit: 10, left: 9, paused: false, entries: [] } },
  };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      if (state.hang) return;   // never answers
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401); return res.end(); }
      const answer = req.method === 'POST' && req.url === '/api/recipe-site/submit' ? state.submit
        : req.method === 'GET' && req.url === '/api/recipe-site/queue' ? state.queue : { status: 404, body: {} };
      res.writeHead(answer.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, token, requests, state,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
