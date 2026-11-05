// One Cookbook recipe.json (schema.org Recipe, as Nexus writes it) -> the fields the site shows.
// Anything missing or unreadable becomes null and is simply not shown; only a missing name drops the recipe.

const ESTIMATED = /\s*Nährwerte pro Portion geschätzt[^\n]*/;
const DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?$/;
const REEL = /^https:\/\/(www\.)?instagram\.com\/[^\s"'<>]+$/;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

export function number(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = /-?\d+(?:[.,]\d+)?/.exec(text(v));
  return m ? Number(m[0].replace(',', '.')) : null;
}

export function minutes(v) {
  const m = DURATION.exec(text(v));
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] || 0) * 60 + Number(m[2] || 0);
}

const list = (xs) => (Array.isArray(xs) ? xs : []).map((x) => text(typeof x === 'object' && x ? x.text : x)).filter(Boolean);

export function parseRecipe(raw, meta) {
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== 'object' || !text(d.name)) return null;

  const nut = d.nutrition && typeof d.nutrition === 'object' ? d.nutrition : {};
  const kcal = number(nut.calories);
  const protein = number(nut.proteinContent);
  const description = text(d.description);
  const author = d.author && typeof d.author === 'object' ? d.author : null;
  const total = minutes(d.totalTime);
  const prep = minutes(d.prepTime);
  const cook = minutes(d.cookTime);
  const steps = typeof d.recipeInstructions === 'string'
    ? d.recipeInstructions.split('\n').map((s) => s.trim()).filter(Boolean)
    : list(d.recipeInstructions);

  return {
    id: String(meta.id),
    slug: '',
    name: text(d.name).slice(0, 200),
    description: description.replace(ESTIMATED, '').trim(),
    estimated: ESTIMATED.test(description),
    reelUrl: REEL.test(text(d.url)) ? text(d.url) : null,
    creator: author && text(author.name) && REEL.test(text(author.url)) ? { name: text(author.name), url: text(author.url) } : null,
    minutes: total ?? (prep !== null || cook !== null ? (prep || 0) + (cook || 0) : null),
    servings: number(d.recipeYield) || null,
    category: text(d.recipeCategory),
    cuisine: text(d.recipeCuisine),
    keywords: text(d.keywords).split(',').map((k) => k.trim()).filter(Boolean),
    ingredients: list(d.recipeIngredient),
    steps,
    kcal,
    protein,
    carbs: number(nut.carbohydrateContent),
    fat: number(nut.fatContent),
    ratio: protein !== null && kcal ? Math.round((protein / kcal) * 1000) / 10 : null,
    created: text(d.dateCreated) || null,
    image: { full: null, thumb: null },
  };
}

const UMLAUT = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

function baseSlug(name) {
  return name
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

// Same set in, same slugs out: of recipes sharing a name, the oldest (lowest Nextcloud file id) keeps the plain slug.
export function assignSlugs(recipes) {
  const byId = [...recipes].sort((a, b) => Number(a.id) - Number(b.id) || a.id.localeCompare(b.id));
  const taken = new Set();
  for (const r of byId) {
    let slug = baseSlug(r.name) || `recipe-${r.id}`;
    if (taken.has(slug)) slug = `${slug}-${r.id.slice(-4)}`;
    while (taken.has(slug)) slug = `${slug}-${r.id}`;
    taken.add(slug);
    r.slug = slug;
  }
}
