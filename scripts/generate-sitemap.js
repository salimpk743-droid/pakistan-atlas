const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";

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

function getTag(html, tagName, predicate) {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) || [];
  return tags.find(predicate) || "";
}

function getAttr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match ? match[1].trim() : "";
}

function getCanonical(html) {
  const tag = getTag(html, "link", (value) => /\brel\s*=\s*["']canonical["']/i.test(value));
  return getAttr(tag, "href");
}

function hasNoindex(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  return tags.some((tag) => /\bname\s*=\s*["']robots["']/i.test(tag) && /\bcontent\s*=\s*["'][^"']*noindex/i.test(tag));
}

const candidates = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !excluded.has(name))
  .sort();

const urls = [];
const seen = new Set();
const skipped = [];

for (const name of candidates) {
  const html = fs.readFileSync(path.join(ROOT, name), "utf8");
  if (hasNoindex(html)) {
    skipped.push(`${name}: noindex`);
    continue;
  }

  const expected = `${SITE}/${name === "index.html" ? "" : name}`;
  const canonical = getCanonical(html);
  if (canonical !== expected) {
    skipped.push(`${name}: canonical is ${canonical || "missing"}`);
    continue;
  }
  if (seen.has(canonical)) {
    skipped.push(`${name}: duplicate canonical ${canonical}`);
    continue;
  }

  seen.add(canonical);
  urls.push(canonical);
}

if (!urls.length) {
  console.error("Sitemap generation aborted: no self-canonical indexable pages were found.");
  process.exit(1);
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
console.log(`Skipped ${skipped.length} non-sitemap candidates.`);
