// Server-side HTML. Recipe text comes from reels and a language model and is shown to strangers: everything
// that is not our own markup goes through esc(). No inline scripts or styles (the CSP forbids them).
import T from './strings.js';
import { SORTS, sortRecipes } from '../public/sort.js';

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ENT[c]);

const num = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const grams = (v) => `${num(v)} g`;

function page(s, { title, description = '', path, image, body, bodyClass = '' }) {
  const og = [
    ['og:type', 'website'], ['og:title', title], ['og:description', description || s.tagline],
    ['og:url', s.base_url + path], ...(image ? [['og:image', `${s.base_url}/img/${image}`]] : []),
  ];
  return `<!doctype html>
<html lang="${esc(s.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${s.indexable ? '' : '<meta name="robots" content="noindex">\n'}${description ? `<meta name="description" content="${esc(description)}">\n` : ''}${og.map(([p, c]) => `<meta property="${p}" content="${esc(c)}">`).join('\n')}
<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="theme-color" content="#0b1026">
<link rel="stylesheet" href="/static/app.css">
<link rel="stylesheet" href="/theme.css">
<script type="module" src="/static/app.js"></script>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;
}

const photo = (r, kind, cls) => r.image[kind]
  ? `<img class="${cls}" src="/img/${esc(r.image[kind])}" alt="" loading="lazy" decoding="async">`
  : `<div class="${cls} noimg" aria-hidden="true">${esc([...r.name][0]?.toUpperCase() || '?')}</div>`;

function stats(r) {
  return [r.protein !== null && `${grams(r.protein)} ${T.protein}`, r.kcal !== null && `${num(r.kcal)} ${T.kcal}`,
    r.minutes && `${r.minutes} ${T.min}`].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join('<span class="dot">·</span>');
}

function card(r, maxRatio) {
  const search = [r.name, r.category, r.cuisine, ...r.keywords, ...r.ingredients].join(' ').toLowerCase();
  const data = Object.entries({ ratio: r.ratio, protein: r.protein, kcal: r.kcal, minutes: r.minutes, created: r.created })
    .map(([k, v]) => (v === null || v === undefined ? '' : ` data-${k}="${esc(v)}"`)).join('');
  return `<a class="card glass" href="/r/${esc(r.slug)}" data-name="${esc(r.name)}" data-search="${esc(search)}"${data}>
  <div class="thumbwrap">${photo(r, 'thumb', 'thumb')}${r.ratio !== null ? `<span class="badge">${esc(num(r.ratio))} g</span>` : ''}</div>
  <div class="info"><h2>${esc(r.name)}</h2><p class="stats">${stats(r)}</p>${r.ratio !== null ? `<progress max="${esc(maxRatio)}" value="${esc(r.ratio)}"></progress>` : ''}</div>
  ${r.ratio !== null ? `<div class="big"><b>${esc(num(r.ratio))}</b><span>${esc(T.ratioShort)}</span></div>` : ''}
</a>`;
}

function topbar(s, withSearch) {
  return `<header class="top glass">
  <a class="brand" href="/">${esc(s.title)}${s.tagline ? `<small>${esc(s.tagline)}</small>` : ''}</a>
  ${withSearch ? `<input class="search" type="search" placeholder="${esc(T.search)}" aria-label="${esc(T.search)}">
  <div class="seg" role="group" aria-label="${esc(T.views)}">
    <button type="button" data-view-set="grid" aria-pressed="${s.default_view === 'grid'}">▦ ${esc(T.grid)}</button>
    <button type="button" data-view-set="list" aria-pressed="${s.default_view === 'list'}">☰ ${esc(T.list)}</button>
  </div>` : ''}
</header>`;
}

function addBox(queue) {
  const full = queue && queue.left <= 0;
  const count = queue ? `<span class="left">${esc(T.left(queue.left, queue.limit))}</span> · ` : '';
  return `<form class="addbox glass" method="post" action="/submit">
  <label for="add-url">${esc(T.addTitle)}</label>
  <div class="addrow"><input id="add-url" name="url" type="url" inputmode="url" autocomplete="off" required maxlength="500"
    placeholder="${esc(T.addPlaceholder)}"${full ? ' disabled' : ''}><button type="submit"${full ? ' disabled' : ''}>${esc(T.addButton)}</button></div>
  <p class="addnote" role="status">${full ? `${esc(T.fullToday)} · ` : count}<a href="/queue">${esc(T.queueLink)}</a></p>
</form>`;
}

export function renderHome(index, s, { submit = false, queue = null } = {}) {
  const recipes = index ? sortRecipes(index.recipes, s.default_sort) : [];
  const maxRatio = Math.max(1, ...recipes.map((r) => r.ratio || 0));
  const pills = Object.keys(SORTS).map((k) =>
    `<button type="button" class="pill" data-sort="${k}" aria-pressed="${k === s.default_sort}">${esc(T.sorts[k])}</button>`).join('');
  const body = `${topbar(s, true)}
${submit ? addBox(queue) : ''}
<nav class="pills" aria-label="Sort">${pills}</nav>
<main class="recipes" data-view="${esc(s.default_view)}">
${index ? recipes.map((r) => card(r, maxRatio)).join('\n') : `<p class="note">${esc(T.loading)}</p>`}
</main>
<p class="note empty" hidden>${esc(T.empty)}</p>`;
  const first = recipes.find((r) => r.image.full);
  return page(s, { title: s.title, description: s.tagline, path: '/', image: first?.image.full, body, bodyClass: 'home' });
}

function tiles(r, s) {
  if (r.kcal === null && r.protein === null) return '';
  const mark = r.estimated && s.show_estimated_mark ? `<p class="estimated">${esc(T.estimated)}</p>` : '';
  const tile = (v, label, key = '') => (v ? `<div class="tile glass${key}"><b>${esc(v)}</b><span>${esc(label)}</span></div>` : '');
  return `<section class="tiles">
  ${tile(r.ratio !== null && grams(r.ratio), T.ratio, ' key')}
  ${tile(r.protein !== null && grams(r.protein), T.protein)}
  ${tile(r.kcal !== null && num(r.kcal), T.kcal)}
  ${tile(r.carbs !== null && r.fat !== null && `${num(r.carbs)} / ${grams(r.fat)}`, T.carbsFat)}
</section>${mark}`;
}

export function renderRecipe(r, s) {
  const by = [
    s.credit_creators && r.creator && `${esc(T.fromReel)} <a href="${esc(r.creator.url)}" rel="noopener noreferrer">@${esc(r.creator.name.replace(/^@/, ''))}</a>`,
    r.minutes && esc(`${r.minutes} ${T.min}`),
    r.servings && esc(`${r.servings} ${T.servingsShort}`),
  ].filter(Boolean).join(' · ');
  const servings = r.servings ? `<div class="serv" data-servings="${esc(r.servings)}">${esc(T.servings)}
      <button type="button" data-step="-1" aria-label="${esc(T.less)}">−</button><output>${esc(r.servings)}</output>
      <button type="button" data-step="1" aria-label="${esc(T.more)}">+</button></div>` : '';
  const body = `${topbar(s, false)}
<main class="recipe">
  <div class="hero">${photo(r, 'full', 'heroimg')}<a class="back" href="/">← ${esc(T.back)}</a></div>
  <h1>${esc(r.name)}</h1>
  ${by ? `<p class="by">${by}</p>` : ''}
  ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
  ${r.reelUrl ? `<a class="ig" href="${esc(r.reelUrl)}" rel="noopener noreferrer">▶ ${esc(T.watchReel)}</a>` : ''}
  ${tiles(r, s)}
  <div class="cols">
    ${r.ingredients.length ? `<section class="box glass"><h2>${esc(T.ingredients)}</h2>${servings}<ul class="ingredients">${r.ingredients.map((i) => `<li data-line="${esc(i)}">${esc(i)}</li>`).join('')}</ul></section>` : ''}
    ${r.steps.length ? `<section class="box glass"><h2>${esc(T.steps)}</h2><ol>${r.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}
  </div>
</main>`;
  return page(s, { title: `${r.name} · ${s.title}`, description: r.description.slice(0, 200), path: `/r/${r.slug}`, image: r.image.full, body, bodyClass: 'detail' });
}

export function renderNotFound(s) {
  return page(s, { title: s.title, path: '/', body: `${topbar(s, false)}<main class="recipe"><p class="note">${esc(T.notFound)} <a href="/">← ${esc(T.back)}</a></p></main>` });
}

const CLOCK = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : CLOCK.format(d); };

export function renderQueue(queue, s, { message = '' } = {}) {
  const note = message ? `<p class="note flash" role="status">${esc(message)}</p>` : '';
  let list;
  if (!queue) {
    list = `<p class="note">${esc(T.queuePaused)}</p>`;
  } else if (!queue.entries.length) {
    list = `<p class="note">${esc(T.queueEmpty)}</p>`;
  } else {
    list = `<ol class="queue">${queue.entries.map((e) => {
      const word = (T.states[e.state] || T.states.failed)(e.position);
      const reason = e.reason ? `: ${esc(e.reason)}` : '';
      const open = e.slug ? ` · <a href="/r/${esc(e.slug)}">${esc(T.openRecipe)}</a>` : '';
      return `<li class="glass q-${esc(e.state)}" data-entry="${esc(e.id)}"><time datetime="${esc(e.created_at)}">${esc(clock(e.created_at))}</time>
  <a class="reel" href="${esc(e.url)}" rel="noopener" target="_blank">${esc(T.original)} ${esc(e.shortcode)}</a>
  <span class="qstate">${esc(word)}${reason}${open}</span></li>`;
    }).join('\n')}</ol>`;
  }
  const head = queue ? `<p class="addnote">${esc(T.left(queue.left, queue.limit))}${queue.paused ? ` · ${esc(T.pcOff)}` : ''}</p>` : '';
  const body = `${topbar(s, false)}
<main class="queuepage">
<section class="glass intro"><h1>${esc(T.queueTitle)}</h1><p>${esc(T.queueIntro)}</p>${head}</section>
${note}
<div class="queuelist" data-refresh="15">${list}</div>
<p class="note"><a class="backlink" href="/">← ${esc(T.back)}</a></p>
</main>`;
  return page(s, { title: `${T.queueTitle} · ${s.title}`, path: '/queue', body, bodyClass: 'queue-page' });
}
