// Instagram reel/post links, normalised the same way as the hub (hub/recipe_site.py normalise): the site's check is
// only for quick feedback, the hub decides.
// also instagram.com/<user>/reel/<code>/, the form browsers show now; scheme and host in any case
const LINK = /^https?:\/\/(?:www\.|m\.)?instagram\.com\/(?:[A-Za-z0-9._]{1,30}\/)?(reel|reels|p)\/([A-Za-z0-9_-]{1,40})\/?(?:\?\S*)?$/;

export function normalise(url) {
  const s = String(url ?? '').trim().replace(/^[^/]*\/\/[^/]*/, (h) => h.toLowerCase());
  if (s.length > 500) return null;
  const m = LINK.exec(s);
  return m ? `https://www.instagram.com/${m[1] === 'p' ? 'p' : 'reel'}/${m[2]}/` : null;
}
