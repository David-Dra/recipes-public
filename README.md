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

## Adding recipes from reel links

The box on the home page sends an Instagram link to a Nexus hub, which writes the recipe into Cookbook. The site needs
two secrets for it: `NEXUS_HUB_URL` and `NEXUS_HUB_TOKEN` (a hub token scoped to `/api/recipe-site/`). Without them the
box is hidden. `/queue` shows today's links and their state. `submit_enabled` and `ip_daily_limit` are in
`settings.toml`; the daily limit for all visitors is set in the hub.

## Impressum and Datenschutz

Name, address and e-mail never go into this repo. Fill in a copy of `impressum.example.toml` and put it into the site's
data folder as `impressum.toml` (on the website template: `pct push <ctid> impressum.toml /srv/site/data/impressum.toml`).
The site picks it up without a restart and adds `/impressum`, `/datenschutz` and their footer links. Without the file
they are left out. Check the wording of both pages yourself; it is a template, not legal advice.
