// Front page: sort pills, search, Grid/List switch (remembered per visitor). Recipe page: servings − / +.
import { sortRecipes } from './sort.js';
import { scaleLine } from './scale.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode: just not remembered */ } },
};

function home() {
  const main = $('main.recipes');
  if (!main) return;
  const cards = $$('a.card', main).map((el) => {
    const n = (k) => (el.dataset[k] === undefined ? null : Number(el.dataset[k]));
    return { el, name: el.dataset.name, search: el.dataset.search, ratio: n('ratio'), protein: n('protein'), kcal: n('kcal'),
      minutes: n('minutes'), created: el.dataset.created ?? null };
  });

  const setView = (view) => {
    main.dataset.view = view;
    for (const b of $$('[data-view-set]')) b.setAttribute('aria-pressed', String(b.dataset.viewSet === view));
  };
  const saved = store.get('recipes.view');
  if (saved === 'grid' || saved === 'list') setView(saved);
  for (const b of $$('[data-view-set]')) b.addEventListener('click', () => { setView(b.dataset.viewSet); store.set('recipes.view', b.dataset.viewSet); });

  for (const pill of $$('[data-sort]')) {
    pill.addEventListener('click', () => {
      for (const p of $$('[data-sort]')) p.setAttribute('aria-pressed', String(p === pill));
      for (const c of sortRecipes(cards, pill.dataset.sort)) main.append(c.el);
    });
  }

  const search = $('input.search');
  const empty = $('.empty');
  search?.addEventListener('input', () => {
    const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const c of cards) {
      const hit = words.every((w) => c.search.includes(w));
      c.el.hidden = !hit;
      shown += hit;
    }
    if (empty) empty.hidden = shown > 0 || cards.length === 0;
  });
}

function servings() {
  const box = $('.serv');
  if (!box) return;
  const base = Number(box.dataset.servings);
  let now = base;
  const out = $('output', box);
  for (const b of $$('button[data-step]', box)) {
    b.addEventListener('click', () => {
      now = Math.max(1, Math.min(99, now + Number(b.dataset.step)));
      out.textContent = String(now);
      for (const li of $$('.ingredients li')) li.textContent = scaleLine(li.dataset.line, now / base);
    });
  }
}

home();
servings();
