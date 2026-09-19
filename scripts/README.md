# MyBook.Pk maintenance scripts

- `generate-sitemap.js` builds the canonical sitemap from root HTML pages and excludes legacy/utility URLs.
- `audit-html.js` checks every root HTML page for title, meta description, canonical, H1, noindex, duplicate canonicals, broken local HTML links, and the intended navigation map.
- `fix-legacy-pages.js` documents the legacy-page cleanup used for `culture.html` and `news.html`.

Run locally with:

```bash
node scripts/audit-html.js
node scripts/generate-sitemap.js
```
