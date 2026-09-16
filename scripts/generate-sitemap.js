const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";

// Only canonical, indexable HTML pages belong in the sitemap.
const excluded = new Set([
  "province.html",
  "district.html",
  "404.html",
  "google316eb4b51e11f5de.html",
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

const urls = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith(".html") && !excluded.has(name))
  .sort()
  .map((name) => `${SITE}/${name === "index.html" ? "" : name}`);

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map((url) => `  <url><loc>${url}</loc></url>`),
  '</urlset>',
  ''
].join("\n");

fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml, "utf8");
console.log(`Generated ${urls.length} canonical sitemap URLs.`);
