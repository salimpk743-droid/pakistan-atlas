const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { pinnedDate } = require("./lib/site");

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
]);
// Every path redirected in vercel.json is not a 200 URL and must stay out of the sitemap.
for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8")).redirects || []) {
  if (!r.has && /^\/[a-z0-9-]+\.html$/i.test(r.source)) excluded.add(r.source.slice(1));
}

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

// Last commit date of the file itself (needs full history: actions/checkout with fetch-depth: 0),
// as a UTC calendar date. Files with uncommitted changes get today's UTC date, which is the date the
// workflow's commit will carry, so re-running after that commit produces the same sitemap.
const dirty = new Set();
try {
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "*.html"], { cwd: ROOT, encoding: "utf8" });
  for (const line of status.split("\n")) if (line.trim()) dirty.add(line.slice(3).trim().replace(/^"|"$/g, ""));
} catch (_) {}
const todayUtc = new Date().toISOString().slice(0, 10);
function getLastModified(name) {
  const pinned = pinnedDate(name, fs.readFileSync(path.join(ROOT, name)));
  if (pinned) return pinned;
  // Use the page's own visible "Last updated" date (written by build-site.js), so site-wide chrome changes
  // that do not move that date do not move lastmod either.
  const shown = fs.readFileSync(path.join(ROOT, name), "utf8").match(/<time datetime="(\d{4}-\d{2}-\d{2})" data-mb-updated>/);
  if (shown) return shown[1];
  if (dirty.has(name)) return todayUtc;
  try {
    const value = execFileSync("git", ["log", "-1", "--format=%ct", "--", name], { cwd: ROOT, encoding: "utf8" }).trim();
    if (/^\d+$/.test(value)) return new Date(Number(value) * 1000).toISOString().slice(0, 10);
  } catch (_) {}
  return "";
}

const candidates = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith(".html"))
  .filter((name) => !excluded.has(name) && !/^google[0-9a-f]+\.html$/i.test(name))
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
  if (name === "district.html" || name === "province.html") {
    skipped.push(`${name}: dynamic template`);
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
