const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const errors = [];
const redirectSources = new Set([
  "index.html",
  "province.html",
  "bajur.html",
  "dgkhan.html",
  "dikhan.html",
  "rykhan.html",
  "nankana.html",
  "tts.html",
  "lakki.html",
  "swa-lower.html",
  "swa-upper.html",
  "culture.html",
  "news.html"
]);
const majorSections = [
  "latest-news.html",
  "current-affairs.html",
  "politics.html",
  "sports.html",
  "history.html",
  "showbiz.html"
];

function report(file, issue, detail = "") {
  errors.push(`${file}: ${issue}${detail ? ` — ${detail}` : ""}`);
}

function localTarget(href, fromFile) {
  if (!href || /^(#|mailto:|tel:|javascript:|https?:\/\/|\/\/)/i.test(href)) return null;
  if (href.includes("${") || href.includes("}")) return null;
  const clean = href.split("#")[0].split("?")[0];
  if (!clean) return null;
  if (clean === "/") return "index.html";
  const resolved = path.normalize(path.join(path.dirname(path.join(ROOT, fromFile)), clean));
  return path.relative(ROOT, resolved).replaceAll(path.sep, "/");
}

function linksFor(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
}

const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith(".html"));

for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (/<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html)) continue;

  const targets = linksFor(file).map(href => ({ href, target: localTarget(href, file) })).filter(x => x.target);
  for (const { href, target } of targets) {
    if (redirectSources.has(target)) report(file, "internal link points to redirect/legacy URL", href);
    else if (target.toLowerCase().endsWith(".html") && !fs.existsSync(path.join(ROOT, target))) {
      report(file, "broken internal HTML link", href);
    }
  }

  const title = (html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || ["", ""])[1];
  if (/District/i.test(title) && !targets.some(x => x.target && x.target !== file && x.target.endsWith(".html"))) {
    report(file, "district page has no crawlable related HTML link");
  }
}

const homeLinks = linksFor("index.html").map(href => localTarget(href, "index.html")).filter(Boolean);
for (const section of majorSections) {
  if (!homeLinks.includes(section)) report("index.html", "missing major-section link", section);
}

console.log(`HTML pages checked: ${htmlFiles.length}`);
console.log(`Issues found: ${errors.length}`);
if (errors.length) {
  for (const e of errors) console.log(`- ${e}`);
  process.exitCode = 1;
} else {
  console.log("Internal link checks passed.");
}
