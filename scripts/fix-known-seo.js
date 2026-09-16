const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";

const canonicalPages = ["haveli.html", "islamabad.html", "sudhanoti.html"];
const descriptions = {
  "latest-news.html": "Explore Pakistan's cultures, languages, traditions, food, music, clothing, crafts, festivals, architecture and heritage across the country.",
  "current-affairs.html": "Explore Pakistan's literary heritage through Urdu poetry, writers, fiction, Sufi traditions, regional languages, books and literary movements.",
  "politics.html": "Explore Pakistan's geography through the Indus basin, mountains, deserts, plateaus, glaciers, coastline, climate and major regions."
};

function addCanonical(file) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, "utf8");
  if (/<link\b[^>]*rel\s*=\s*["']canonical["']/i.test(html)) return false;

  const canonical = `${SITE}/${file}`;
  const description = html.match(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/i);
  if (!description) return false;

  html = html.replace(description[0], `${description[0]}\n  <link rel="canonical" href="${canonical}">`);
  fs.writeFileSync(full, html, "utf8");
  return true;
}

function fixPoliticsTitle() {
  const full = path.join(ROOT, "politics.html");
  let html = fs.readFileSync(full, "utf8");
  let seen = false;
  const fixed = html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, (tag) => {
    if (seen) return "";
    seen = true;
    return tag;
  });
  if (fixed === html) return false;
  fs.writeFileSync(full, fixed, "utf8");
  return true;
}

function fixDescription(file, description) {
  const full = path.join(ROOT, file);
  let html = fs.readFileSync(full, "utf8");
  const tagRe = /<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/gi;
  let count = 0;
  const fixed = html.replace(tagRe, () => {
    count += 1;
    return count === 1 ? `<meta name="description" content="${description}">` : "";
  });
  if (count === 0 || fixed === html) return false;
  fs.writeFileSync(full, fixed, "utf8");
  return true;
}

const changed = [];
for (const file of canonicalPages) if (addCanonical(file)) changed.push(file);
if (fixPoliticsTitle()) changed.push("politics.html title");
for (const [file, description] of Object.entries(descriptions)) {
  if (fixDescription(file, description)) changed.push(`${file} description`);
}

console.log(changed.length ? `Fixed: ${changed.join(", ")}` : "No known SEO fixes were needed.");
