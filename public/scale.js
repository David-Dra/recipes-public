// Scales the amount at the start of an ingredient line ("400 g", "1,5 l", "1/2 tsp", "1 ½ cups") for other servings.
// Lines without a leading amount stay as they are.
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const AMOUNT = /^(\d+\/\d+|\d+(?:[.,]\d+)?(?:\s+\d+\/\d+)?)?(\s*[½¼¾⅓⅔])?/;

function value(num, frac) {
  let v = 0;
  for (const part of (num || '').trim().split(/\s+/).filter(Boolean)) {
    const [a, b] = part.split('/');
    v += b ? Number(a) / Number(b) : Number(a.replace(',', '.'));
  }
  return v + (frac ? FRACTIONS[frac.trim()] : 0);
}

function format(v, decimal, comma) {
  if (decimal) {
    const s = String(Math.round(v * 100) / 100);
    return comma ? s.replace('.', ',') : s;
  }
  if (v >= 10) return String(Math.round(v));
  // Below 2 in quarters, below 10 in halves; never rounds down to nothing.
  const step = v < 2 ? 4 : 2;
  const parts = Math.max(1, Math.round(v * step));
  const whole = Math.floor(parts / step);
  const frac = { 0: '', 1: step === 4 ? '¼' : '½', 2: '½', 3: '¾' }[parts % step];
  return frac ? (whole ? `${whole} ${frac}` : frac) : String(whole);
}

export function scaleLine(line, factor) {
  const m = AMOUNT.exec(line);
  if (!m || !m[0].trim() || factor === 1) return line;
  const decimal = /[.,]/.test(m[1] || '');
  return format(value(m[1], m[2]) * factor, decimal, (m[1] || '').includes(',')) + line.slice(m[0].length);
}
