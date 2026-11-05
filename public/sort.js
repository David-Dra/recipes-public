// Sort orders, shared by the server (first render) and the browser (pills). Recipes without the value go last.
export const SORTS = {
  ratio: { field: 'ratio', dir: -1 },
  protein: { field: 'protein', dir: -1 },
  kcal: { field: 'kcal', dir: 1 },
  quick: { field: 'minutes', dir: 1 },
  newest: { field: 'created', dir: -1 },
};

export function sortRecipes(recipes, key) {
  const { field, dir } = SORTS[key] || SORTS.ratio;
  return [...recipes].sort((a, b) => {
    const x = a[field] ?? null;
    const y = b[field] ?? null;
    if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
    if (x < y) return -dir;
    if (x > y) return dir;
    return a.name.localeCompare(b.name);
  });
}
