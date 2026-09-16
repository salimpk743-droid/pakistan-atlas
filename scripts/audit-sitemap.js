const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";
const sitemap = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const htmlFiles = new Set(fs.readdirSync(ROOT).filter((name) => name.endsWith(".html")));
const errors = [];

function report(issue, detail = "") {
  errors.push(`${issue}${detail ? ` — ${detail}` : ""}`);
}

function canonicalFor(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const tag = html.match(/<link\b[^>]*rel\s*=\s*["']canonical["'][^>]*>/i);
  const href = tag && tag[0].match(/href\s*=\s*["']([^"']+)["']/i);
  return href ? href[1].trim() : "";
}

function noindex(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  return /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i.test(html)
    || /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']* ["'][^>]*name\s*=\s*["']robots["']/i.test(html);
}

const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
const seen = new Set();

for (const url of locs) {
  if (seen.has(url)) report("duplicate sitemap URL", url);
  seen.add(url);

  if (!url.startsWith(`${SITE}/`)) {
    report("sitemap URL is outside the canonical site", url);
    continue;
  }

  const relative = url.slice(`${SITE}/`.length);
  const file = relative === "" ? "index.html" : relative;
  if (!htmlFiles.has(file)) {
    report("sitemap URL does not map to an existing HTML file", url);
    continue;
  }

  const expected = `${SITE}/${file === "index.html" ? "" : file}`;
  const canonical = canonicalFor(file);
  if (canonical !== expected) report("sitemap URL is not self-canonical", `${file} → ${canonical || "missing canonical"}`);
  if (noindex(file)) report("sitemap URL is noindex", file);
}

console.log(`Sitemap URLs audited: ${locs.length}`);
console.log(`Issues found: ${errors.length}`);
if (errors.length) {
  for (const error of errors) console.log(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log("Sitemap integrity checks passed.");
}
