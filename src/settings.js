// settings.toml: every value that can change per website. Read once at start; a bad value stops the app,
// so the website template keeps the previous release live and reports why.
import { readFileSync } from 'node:fs';
import { parse } from 'smol-toml';

export const DEFAULTS = Object.freeze({
  title: 'Recipes',
  tagline: '',
  base_url: 'https://recipes.ksi.berlin',
  indexable: false,
  language: 'en',
  accent: '#38bdf8',
  default_view: 'grid',
  default_sort: 'ratio',
  share_path: '/Shared/Recipes',
  sync_minutes: 5,
  show_estimated_mark: true,
  credit_creators: true,
});

const oneOf = (...xs) => (v) => xs.includes(v) || `one of ${xs.join(', ')}`;
const isString = (v) => typeof v === 'string' || 'text in quotes';
const isBool = (v) => typeof v === 'boolean' || 'true or false';

const CHECKS = {
  title: (v) => (typeof v === 'string' && v.trim() !== '') || 'non-empty text',
  tagline: isString,
  base_url: (v) => (typeof v === 'string' && /^https?:\/\/[^\s/]+(\/[^\s]*[^/\s])?$/.test(v)) || 'a URL like https://recipes.example.org (no trailing slash)',
  indexable: isBool,
  language: (v) => (typeof v === 'string' && /^[a-z]{2}$/.test(v)) || 'two letters, like en',
  accent: (v) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) || 'a colour like #38bdf8',
  default_view: oneOf('grid', 'list'),
  default_sort: oneOf('ratio', 'protein', 'kcal', 'quick', 'newest'),
  share_path: (v) => (typeof v === 'string' && v.startsWith('/') && !v.includes('..')) || 'a folder path starting with /',
  sync_minutes: (v) => (Number.isInteger(v) && v >= 1 && v <= 1440) || 'a whole number from 1 to 1440',
  show_estimated_mark: isBool,
  credit_creators: isBool,
};

export function loadSettings(path) {
  const raw = parse(readFileSync(path, 'utf8'));
  const out = { ...DEFAULTS };
  for (const [key, value] of Object.entries(raw)) {
    if (!(key in CHECKS)) throw new Error(`settings.toml: ${key}: unknown key`);
    const ok = CHECKS[key](value);
    if (ok !== true) throw new Error(`settings.toml: ${key}: must be ${ok}`);
    out[key] = value;
  }
  return out;
}
