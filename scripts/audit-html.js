const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const LEGACY = new Set(["culture.html", "news.html"]);
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith(".html"));
const errors = [];
const canonicalGroups = new Map();
const titleGroups = new Map();
const descriptionGroups = new Map();

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

function decode(text) {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// Read the actual NAV constant from js/app.js so the audit follows the site's source of truth.
const navMatch = APP.match(/const\s+NAV\s*=\s*\[([\s\S]*?)\];/);
if (!navMatch) {
  report("js/app.js", "global NAV constant not found");
} else {
  const NAV = [...navMatch[1].matchAll(/\[\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\]/g)]
    .map(m => [m[1], m[2]]);

  if (!NAV.length) report("js/app.js", "global NAV contains no links");

  const seenNavHrefs = new Set();
  for (const [href, label] of NAV) {
    if (seenNavHrefs.has(href)) report("js/app.js", "duplicate global NAV target", `${href} (${label})`);
    seenNavHrefs.add(href);
    if (!fs.existsSync(path.join(ROOT, href))) report("js/app.js", "global NAV target missing", `${href} (${label})`);
  }

  const expectedLabels = new Map([
    ["index.html", "Home"],
    ["latest-news.html", "Culture"],
    ["current-affairs.html", "Literature"],
    ["politics.html", "Geography"],
    ["sports.html", "Sports"],
    ["history.html", "History"],
    ["showbiz.html", "Showbiz"],
    ["about.html", "About"]
  ]);
  for (const [href, label] of NAV) {
    if (expectedLabels.has(href) && expectedLabels.get(href) !== label) {
      report("js/app.js", "unexpected global NAV label", `${href} is ${label}, expected ${expectedLabels.get(href)}`);
    }
  }
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => decode(m[1].replace(/<[^>]+>/g, "")));
  const descriptions = [...html.matchAll(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/gi)].map(m => attr(m[0], "content"));
  const canonicals = [...html.matchAll(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/gi)].map(m => attr(m[0], "href"));
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const noindex = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html)
    || /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["']/i.test(html);

  if (titles.length === 0) report(file, "missing <title>");
  if (titles.length > 1) report(file, "duplicate <title> tags", `${titles.length} found`);
  if (descriptions.length === 0 || !descriptions[0]) report(file, "missing meta description");
  if (descriptions.length > 1) report(file, "duplicate meta descriptions", `${descriptions.length} found`);
  if (canonicals.length === 0) report(file, "missing canonical URL");
  if (canonicals.length > 1) report(file, "duplicate canonical tags", `${canonicals.length} found`);
  if (h1s.length === 0) report(file, "missing H1");
  if (h1s.length > 1) report(file, "multiple H1 headings", `${h1s.length} found`);
  if (noindex && !LEGACY.has(file)) report(file, "unexpected noindex");

  const title = titles[0] || "";
  const description = descriptions[0] || "";
  const canonical = canonicals[0] || "";
  if (canonical) {
    const key = canonical.replace(/#.*$/, "");
    if (!canonicalGroups.has(key)) canonicalGroups.set(key, []);
    canonicalGroups.get(key).push(file);
  }
  if (title) {
    if (!titleGroups.has(title)) titleGroups.set(title, []);
    titleGroups.get(title).push(file);
  }
  if (description) {
    if (!descriptionGroups.has(description)) descriptionGroups.set(description, []);
    descriptionGroups.get(description).push(file);
  }

  const links = [...html.matchAll(/<(?:a|area|link)\b[^>]*(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
  for (const href of links) {
    const target = normalizeUrl(href, file);
    if (!target || !target.toLowerCase().endsWith(".html")) continue;
    if (!fs.existsSync(path.join(ROOT, target))) report(file, "broken internal link", href);
  }

  if (!LEGACY.has(file) && !/<script\b[^>]*src\s*=\s*["']js\/app\.js(?:[?#][^"']*)?["'][^>]*>/i.test(html)) {
    report(file, "missing js/app.js navigation source");
  }
}

for (const [canonical, files] of canonicalGroups) {
  if (files.length > 1) report(files.join(", "), "duplicate canonical URL", canonical);
}

for (const [title, files] of titleGroups) {
  if (files.length > 1) report(files.join(", "), "duplicate page title", title);
}

for (const [description, files] of descriptionGroups) {
  if (files.length > 1) report(files.join(", "), "duplicate meta description", description);
}

console.log(`HTML files audited: ${htmlFiles.length}`);
console.log(`Issues found: ${errors.length}`);
if (errors.length) {
  for (const e of errors) console.log(`- ${e}`);
  process.exitCode = 1;
} else {
  console.log("All HTML checks passed.");
}
