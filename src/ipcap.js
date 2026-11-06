// Links per visitor and Berlin day, so one person cannot use up the whole day. Only a salted hash of the IP is kept,
// in memory: it is gone at restart, and the salt is new each start, so the hashes mean nothing outside this process.
import { createHash, randomBytes } from 'node:crypto';

const DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' });
export const berlinDay = (ms) => DAY.format(new Date(ms));

export function makeIpCap(limit, now = Date.now) {
  const salt = randomBytes(16);
  let day = '';
  const counts = new Map();
  const key = (ip) => createHash('sha256').update(salt).update(String(ip)).digest('hex');
  const roll = () => {
    const d = berlinDay(now());
    if (d !== day) { day = d; counts.clear(); }
  };
  return {
    take(ip) {
      roll();
      const k = key(ip);
      const n = counts.get(k) || 0;
      if (n >= limit) return false;
      counts.set(k, n + 1);
      return true;
    },
    give(ip) {
      roll();
      const k = key(ip);
      const n = counts.get(k) || 0;
      if (n > 0) counts.set(k, n - 1);
    },
    _keys: () => counts.keys(),
  };
}
