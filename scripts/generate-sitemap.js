const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mybook.pk";

const excluded = new Set([
  "province.html",
  "district.html",
  "404.html",
  "google316eb4b51e11f5de.html",
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
  const tag = getTag(html, "link", (value) => /\\brel\\s*=\\s*["']canonical["']/i.test(value));
  return getAttr(tag, "href");
}

function hasNoindex(html) {
  const tags = html.match(/<meta\\b[^>]*>/gi) || [];
  return tags.some((tag) => /\\bname\\s*=\\s*["']robots["']/i.test(tag) && /\\bcontent\\s*=\\s*["'][^"']*noindex/i.test(tag));
}

function getLastModified(name) {
  try {
    const value = execFileSync("git", ["log", "-1", "--format=%cs", "--", name], { cwd: ROOT, encoding: "utf8" }).trim();
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value;
  } catch (_) {}
  return "";
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
  urls.push({ url: canonical, lastmod: getLastModified(name) });
}

if (!urls.length) {
  console.error("Sitemap generation aborted: no self-canonical indexable pages were found.");
  process.exit(1);
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(({ url, lastmod }) => `  <url><loc>${url}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`),
  '</urlset>',
  ''
].join("\n");

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`Generated ${urls.length} self-canonical, indexable sitemap URLs with stable lastmod dates.`);
console.log(`Skipped ${skipped.length} non-sitemap candidates.`);
