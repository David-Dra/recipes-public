// Impressum data (name, address, e-mail) from SITE_DATA/impressum.toml. It lives on the server only, never in this
// public repo. Missing or invalid: null, and the pages and their footer links are left out. Logs name keys, not values.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'smol-toml';

const text = (v) => typeof v === 'string' && v.trim() !== '' && v.length <= 200;
const CHECKS = {
  name: (v) => text(v) || 'text in quotes',
  address: (v) => (Array.isArray(v) && v.length >= 1 && v.length <= 6 && v.every(text)) || 'a list of 1 to 6 lines',
  email: (v) => (typeof v === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(v)) || 'an e-mail address',
  phone: (v) => (typeof v === 'string' && /^[+0-9 ()/-]{0,30}$/.test(v)) || 'a phone number',
};

export function loadLegal(dataDir, log = console.log) {
  let raw;
  try {
    raw = parse(readFileSync(join(dataDir, 'impressum.toml'), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') log('impressum.toml: not readable TOML, pages left out');
    return null;
  }
  const out = { phone: '', ...raw };
  for (const key of ['name', 'address', 'email', 'phone']) {
    const ok = CHECKS[key](out[key]);
    if (ok !== true) { log(`impressum.toml: ${key}: must be ${ok}; pages left out`); return null; }
  }
  return { name: out.name, address: out.address, email: out.email, phone: out.phone };
}
