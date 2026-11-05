# Recipe site

A public, read-only website for a Nextcloud Cookbook collection: grid or list view, sorting by protein per
100 kcal, protein, calories, time or date, search, and one page per recipe with a link to the original reel.

It copies a (read-only) Nextcloud share over WebDAV every few minutes into its data folder and serves its own copy,
so the site keeps working while Nextcloud is down. Built for the website template (`site.toml`), runs anywhere with
Node 24.

## Run locally

```bash
npm install
cp .env.example .env    # fill in the Nextcloud user and its app password
npm start               # http://localhost:3000
npm test
```

Environment: `NEXTCLOUD_URL`, `NEXTCLOUD_USER`, `NEXTCLOUD_APP_PASSWORD` (an app password of a user that can only
read the recipe share), `PORT` (default 3000), `SITE_DATA` (default `./data`).

## Settings (`settings.toml`)

| Key | Default | What it does |
|---|---|---|
| `title` | `"Recipes"` | Name in the top bar and the browser tab |
| `tagline` | `""` | Short line under the title |
| `base_url` | `"https://recipes.ksi.berlin"` | The site's own address, for link previews; no trailing slash |
| `indexable` | `false` | `false`: search engines are told not to list the site. `true`: listing allowed, `/sitemap.xml` on |
| `language` | `"en"` | `<html lang>`; the texts are in `src/strings.js` |
| `accent` | `"#38bdf8"` | Accent colour |
| `default_view` | `"grid"` | `grid` or `list` for first-time visitors |
| `default_sort` | `"ratio"` | `ratio`, `protein`, `kcal`, `quick`, `newest` |
| `share_path` | `"/Shared/Recipes"` | The Cookbook folder as the Nextcloud user sees it |
| `sync_minutes` | `5` | How often to copy changes from Nextcloud (1–1440) |
| `show_estimated_mark` | `true` | Mark nutrition values that were estimated |
| `credit_creators` | `true` | Show "from a reel by @creator" |

An unknown key or a wrong value stops the app at start with a message naming the key.
