const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const ALLOWED_NOINDEX = new Set([
  "404.html",
  "province.html",
  "district.html",
  "google316eb4b51e11f5de.html",
  "news.html"
]);
const UTILITY = new Set(["google316eb4b51e11f5de.html"]);
const VERIFICATION = { "google316eb4b51e11f5de.html": "google-site-verification: google316eb4b51e11f5de.html\n" };
const SITE = "https://mybook.pk";
// Sources of permanent redirects in vercel.json: internal links must point at the destination instead.
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
const redirectedFiles = new Set((vercel.redirects || [])
  .filter(r => !r.has && r.source !== "/index.html" && /^\/[a-z0-9-]+\.html$/i.test(r.source))
  .map(r => r.source.slice(1)));
const htmlFiles = fs.readdirSync(ROOT).filter(f => f.toLowerCase().endsWith(".html"));
const errors = [];
const warnings = [];
const canonicalGroups = new Map();
const titleGroups = new Map();
const descriptionGroups = new Map();

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}

// Quote-aware attribute parsing prevents apostrophes in text such as "Pakistan's" from truncating values.
function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return m ? m[2].trim() : "";
}

function report(file, issue, detail = "") {
  errors.push(`${file}: ${issue}${detail ? ` — ${detail}` : ""}`);
}

function warn(file, issue, detail = "") {
  warnings.push(`${file}: ${issue}${detail ? ` — ${detail}` : ""}`);
}

function normalizeUrl(href, fromFile) {
  if (!href || /^(#|mailto:|tel:|javascript:|https?:\/\/|\/\/)/i.test(href)) return null;
  if (href.includes("${") || href.includes("}")) return null;
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return null;
  const base = path.dirname(path.join(ROOT, fromFile));
  const resolved = path.normalize(path.join(base, clean));
  return path.relative(ROOT, resolved).replaceAll(path.sep, "/");
}

function decode(text) {
  return text.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

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
    const target = href === "/" ? "index.html" : href;
    if (!fs.existsSync(path.join(ROOT, target))) report("js/app.js", "global NAV target missing", `${href} (${label})`);
  }

  const expectedLabels = new Map([
    ["/", "Home"],
    ["culture.html", "Culture"],
    ["literature.html", "Literature"],
    ["geography.html", "Geography"],
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

for (const [file, expected] of Object.entries(VERIFICATION)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) report(file, "search-engine verification file missing");
  else if (fs.readFileSync(full, "utf8") !== expected) report(file, "search-engine verification file was modified", "it must contain exactly the token line Google issued");
}

{
  const adsTxt = fs.existsSync(path.join(ROOT, "ads.txt")) ? fs.readFileSync(path.join(ROOT, "ads.txt"), "utf8") : "";
  if (!/^google\.com,\s*pub-3672700167787763,\s*DIRECT/m.test(adsTxt)) report("ads.txt", "must list google.com, pub-3672700167787763, DIRECT");
  if (/pub-(?!3672700167787763)\d+/.test(adsTxt)) report("ads.txt", "lists an unexpected publisher ID");
}

// Structural guards: these catch the failure modes seen in 2026 (a generator that appended the same
// block up to 17 times, markdown fences pasted into pages, and pages cut off mid-element).
function structuralChecks(file, html) {
  const withoutPre = html.replace(/<(pre|code|script|style)\b[\s\S]*?<\/\1>/gi, "");
  if (/```/.test(withoutPre)) report(file, "stray markdown code fence (```) in page");
  // Chat-assistant paste residue: citation tokens, private-use citation markers, raw markdown links, tracking tags.
  if (/:contentReference\[oaicite:\d+\]|\uE200|\uE201|\uE202|\bciteturn\d/.test(withoutPre)) report(file, "chat-assistant citation artifact in page text");
  if (/\]\(https?:\/\/[^)\s]+\)/.test(withoutPre)) report(file, "raw markdown link in page text");
  if (/utm_source=chatgpt\.com/.test(html)) report(file, "utm_source=chatgpt.com tracking parameter in a link");
  if (!/^\s*<!DOCTYPE html>/i.test(html)) report(file, "page does not start with <!DOCTYPE html>");
  const counts = (re) => (html.match(re) || []).length;
  if (counts(/<html[\s>]/gi) !== 1) report(file, "expected exactly one <html> element", `${counts(/<html[\s>]/gi)} found`);
  if (counts(/<body[\s>]/gi) !== 1 || counts(/<\/body>/gi) !== 1) report(file, "expected exactly one <body> … </body>");
  const head = (html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [])[1] || "";
  const headText = head
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|title|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (headText) report(file, "stray text inside <head> (pasted code or broken markup)", JSON.stringify(headText.slice(0, 80)));
  // AdSense: exactly one loader with the owner-confirmed publisher (ads.txt), inside <head>.
  const adsScript = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3672700167787763" crossorigin="anonymous"></script>';
  const loaders = html.match(/<script\b[^>]*adsbygoogle\.js[^>]*>/gi) || [];
  if (loaders.length !== 1 || head.split(adsScript).length !== 2) report(file, "AdSense loader must appear exactly once in <head> in the confirmed form", `${loaders.length} loader(s)`);
  const pubIds = [...new Set((html.match(/ca-pub-\d+/g) || []))].filter((id) => id !== "ca-pub-3672700167787763");
  if (pubIds.length) report(file, "unexpected AdSense publisher ID", pubIds.join(", "));
  if ((head.match(/<meta\b[^>]*google-adsense-account[^>]*>/gi) || []).length !== 1) report(file, "google-adsense-account meta must appear exactly once in <head>");
  if (!/<\/html>\s*$/i.test(html)) report(file, "page is truncated or has content after </html>", JSON.stringify(html.trimEnd().slice(-60)));
  if (counts(/<head[\s>]/gi) !== 1 || counts(/<\/head>/gi) !== 1) report(file, "expected exactly one <head> … </head>");
  for (const cls of ["district-search-answers", "seo-related-reading"]) {
    const n = counts(new RegExp(`<section class="${cls}"`, "g"));
    if (n > 1) report(file, "repeated generated block", `${cls} appears ${n} times`);
  }
  for (const marker of ["quick-answers", "related", "head", "header", "footer"]) {
    const n = counts(new RegExp(`<!-- mb:${marker}:start -->`, "g"));
    if (n > 1) report(file, "repeated managed block", `mb:${marker} appears ${n} times`);
  }
  // Any sizeable <section> repeated verbatim is a duplication bug.
  const seen = new Map();
  for (const m of html.matchAll(/<section\b[^>]*>[\s\S]*?<\/section>/gi)) {
    const body = m[0].replace(/\s+/g, " ");
    if (body.length < 300) continue;
    seen.set(body, (seen.get(body) || 0) + 1);
  }
  for (const [body, n] of seen) if (n > 1) report(file, "identical section repeated", `${n}× "${body.slice(0, 70)}…"`);
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); } catch (e) { report(file, "invalid JSON-LD", e.message); }
  }
}

for (const file of htmlFiles) {
  if (UTILITY.has(file)) continue;
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  structuralChecks(file, html);
  const titles = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map(m => decode(m[1].replace(/<[^>]+>/g, "")));
  const descriptions = tags(html, "meta")
    .filter(tag => /\bname\s*=\s*(["'])description\1/i.test(tag))
    .map(tag => attr(tag, "content"));
  const canonicals = tags(html, "link")
    .filter(tag => /\brel\s*=\s*(["'])canonical\1/i.test(tag))
    .map(tag => attr(tag, "href"));
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
  const noindex = tags(html, "meta").some(tag =>
    /\bname\s*=\s*(["'])robots\1/i.test(tag) && /\bcontent\s*=\s*(["'])[^"']*noindex/i.test(tag)
  );

  if (titles.length === 0) report(file, "missing <title>");
  if (titles.length > 1) report(file, "duplicate <title> tags", `${titles.length} found`);
  if (descriptions.length === 0 || !descriptions[0]) report(file, "missing meta description");
  if (descriptions.length > 1) report(file, "duplicate meta descriptions", `${descriptions.length} found`);
  if (canonicals.length === 0) report(file, "missing canonical URL");
  const selfUrl = file === "index.html" ? `${SITE}/` : `${SITE}/${file}`;
  if (canonicals.length && canonicals[0] !== selfUrl) report(file, "canonical does not point to the page itself", canonicals[0]);
  if (!noindex && (!html.includes("<!-- mb:header:start -->") || !html.includes("<!-- mb:footer:start -->"))) report(file, "static header/footer missing (run scripts/build-site.js)");
  if (!noindex) {
    const footer = (html.match(/<!-- mb:footer:start -->([\s\S]*?)<!-- mb:footer:end -->/) || [])[1] || "";
    for (const page of ["about.html", "sources-methodology.html", "contact.html", "privacy.html", "terms.html", "disclaimer.html"]) {
      if (!footer.includes(`href="${page}"`)) report(file, `footer link to ${page} missing (run scripts/build-site.js)`);
    }
    if (!/<time datetime="\d{4}-\d{2}-\d{2}" data-mb-updated>\d{1,2} [A-Z][a-z]+ \d{4}<\/time>/.test(footer)) report(file, "visible 'Last updated' date missing (run scripts/build-site.js)");
    if (/@@MB_DATE/.test(html)) report(file, "unreplaced date placeholder");
  }
  if (canonicals.length > 1) report(file, "duplicate canonical tags", `${canonicals.length} found`);
  if (h1s.length === 0) report(file, "missing H1");
  if (noindex && !ALLOWED_NOINDEX.has(file)) report(file, "unexpected noindex");
  if (!noindex && file !== "404.html" && !ALLOWED_NOINDEX.has(file) && !/name="robots"[^>]*content="[^"]*index/i.test(html)) report(file, "missing explicit indexable robots directive");

  const title = titles[0] || "";
  if (title.length > 65) warn(file, "title too long", `${title.length} chars`);
  if (title.length < 20) warn(file, "title too short", `${title.length} chars`);
  const description = descriptions[0] || "";
  if (description.length > 170) warn(file, "meta description too long", `${description.length} chars`);
  if (description.length < 70) warn(file, "meta description too short", `${description.length} chars`);
  const canonical = canonicals[0] || "";
  if (canonical && !(noindex && ALLOWED_NOINDEX.has(file))) {
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
    if (redirectedFiles.has(target)) report(file, "internal link to a redirected URL", href);
    else if (!fs.existsSync(path.join(ROOT, target))) report(file, "broken internal link", href);
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
console.log(`Errors found: ${errors.length}`);
console.log(`SEO warnings: ${warnings.length}`);
if (errors.length) {
  for (const e of errors) console.log(`- ${e}`);
  process.exitCode = 1;
} else {
  console.log("All critical HTML checks passed.");
}
if (warnings.length) {
  console.log("Warnings (non-blocking):");
  for (const w of warnings) console.log(`- ${w}`);
}
