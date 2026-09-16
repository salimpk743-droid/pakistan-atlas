const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";

// These files are intentionally not indexable sitemap destinations.
const excluded = new Set([
  "province.html",
  "district.html",
  "404.html",
  "google316eb4b51e11f5de.html",
  "culture.html",
  "news.html",
  "contact.html",
  "privacy.html",
  "terms.html",
  "disclaimer.html",
  "bajur.html",
  "dgkhan.html",
  "dikhan.html",
  "rykhan.html",
  "nankana.html",
  "tts.html",
  "lakki.html",
  "swa-lower.html",
  "swa-upper.html"
]);

function getCanonical(html) {
  const match = html.match(/<link\\b[^>]*rel\\s*=\\s*["']canonical["'][^>]*>/i);
  if (!match) return "";
  const href = match[0].match(/href\\s*=\\s*["']([^"']+)["']/i);
  return href ? href[1].trim() : "";
}

function hasNoindex(html) {
  return /<meta\\b[^>]*name\\s*=\\s*["']robots["'][^>]*content\\s*=\\s*["'][^"']*noindex/i.test(html)
    || /<meta\\b[^>]*content\\s*=\\s*["'][^"']*noindex[^"']*["'][^>]*name\\s*=\\s*["']robots["']/i.test(html);
}

const candidates = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !excluded.has(name))
  .sort();

const urls = [];
const seen = new Set();

for (const name of candidates) {
  const html = fs.readFileSync(path.join(ROOT, name), "utf8");
  if (hasNoindex(html)) continue;

  const expected = `${SITE}/${name === "index.html" ? "" : name}`;
  const canonical = getCanonical(html);

  // Only include a page when its declared canonical is exactly itself.
  // This automatically removes aliases, redirects, and accidental duplicate URLs.
  if (canonical !== expected) continue;
  if (seen.has(canonical)) continue;

  seen.add(canonical);
  urls.push(canonical);
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
  '</urlset>',
  ''
].join("\n");

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`Generated ${urls.length} self-canonical, indexable sitemap URLs.`);
