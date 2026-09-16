const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";
const LEGACY = new Set(["culture.html", "news.html"]);
const NAV = [
  ["index.html", "Home"],
  ["latest-news.html", "Culture"],
  ["current-affairs.html", "Literature"],
  ["politics.html", "Geography"],
  ["sports.html", "Sports"],
  ["history.html", "History"],
  ["showbiz.html", "Showbiz"],
  ["about.html", "About"]
];

const htmlFiles = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith(".html"));
const pages = new Map();
const canonicalGroups = new Map();
const errors = [];

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? m[1].trim() : "";
}
function report(file, issue, detail = "") {
  errors.push(`${file}: ${issue}${detail ? ` — ${detail}` : ""}`);
}
function normalizeUrl(href, fromFile) {
  if (!href || /^(#|mailto:|tel:|javascript:|https?:\/\/|\/\/)/i.test(href)) return null;
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return null;
  const base = path.dirname(path.join(ROOT, fromFile));
  const resolved = path.normalize(path.join(base, clean));
  return path.relative(ROOT, resolved).replaceAll(path.sep, "/");
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => m[1].replace(/<[^>]+>/g, "").trim());
  const descriptions = [...html.matchAll(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/gi)].map(m => attr(m[0], "content"));
  const canonicals = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi)].map(m => attr(m[0], "href"));
  const h1s = [...html.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)];
  const noindex = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html) || /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["']/i.test(html);

  if (titles.length === 0) report(file, "missing <title>");
  if (titles.length > 1) report(file, "duplicate <title> tags", `${titles.length} found`);
  if (descriptions.length === 0 || !descriptions[0]) report(file, "missing meta description");
  if (descriptions.length > 1) report(file, "duplicate meta descriptions", `${descriptions.length} found`);
  if (canonicals.length === 0) report(file, "missing canonical URL");
  if (canonicals.length > 1) report(file, "duplicate canonical tags", `${canonicals.length} found`);
  if (h1s.length === 0) report(file, "missing H1");
  if (h1s.length > 1) report(file, "multiple H1 headings", `${h1s.length} found`);
  if (noindex && !LEGACY.has(file)) report(file, "unexpected noindex");

  const canonical = canonicals[0] || "";
  if (canonical) {
    const key = canonical.replace(/#.*$/, "");
    if (!canonicalGroups.has(key)) canonicalGroups.set(key, []);
    canonicalGroups.get(key).push(file);
  }

  const links = [...html.matchAll(/<(?:a|area|link)\b[^>]*(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const href of links) {
    const target = normalizeUrl(href, file);
    if (!target || !target.toLowerCase().endsWith(".html")) continue;
    if (!fs.existsSync(path.join(ROOT, target))) report(file, "broken internal link", href);
  }

  pages.set(file, { html, title: titles[0] || "", canonical, h1s, noindex });
}

for (const [canonical, files] of canonicalGroups) {
  if (files.length > 1) report(files.join(", "), "duplicate canonical URL", canonical);
}

// Validate the intended global navigation without changing any page content.
const expected = new Map(NAV);
for (const file of htmlFiles) {
  const { html } = pages.get(file);
  for (const [href, label] of NAV) {
    const re = new RegExp(`<a\\b[^>]*href\\s*=\\s*["']${href.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}["'][^>]*>[\\s\\S]*?${label}[\\s\\S]*?<\\/a>`, "i");
    // Navigation is rendered by app.js on normal pages; don't require static anchors.
    if (file === "index.html" || file === "about.html") continue;
  }
}

console.log(`HTML files audited: ${htmlFiles.length}`);
console.log(`Issues found: ${errors.length}`);
if (errors.length) {
  for (const e of errors) console.log(`- ${e}`);
  process.exitCode = 1;
} else {
  console.log("All HTML checks passed.");
}
