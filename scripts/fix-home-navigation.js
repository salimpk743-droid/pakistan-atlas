const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const file = path.join(ROOT, "index.html");
const marker = "<!-- HOME CURRENT NEWS + CULTURE FIX -->";

let html = fs.readFileSync(file, "utf8");
if (html.includes(marker)) {
  console.log("Homepage navigation is already fixed.");
  process.exit(0);
}

const archivesStart = html.indexOf('<div class="atlas-archives">');
if (archivesStart === -1) {
  console.error("Could not find homepage archive container.");
  process.exit(1);
}

const before = html.slice(0, archivesStart);
const afterStart = html.slice(archivesStart);
const match = afterStart.match(/<article class="atlas-archive">[\s\S]*?<\/article>/);
if (!match) {
  console.error("Could not find the first homepage archive card.");
  process.exit(1);
}

const cultureCard = match[0].replace(/latest-news\.html/g, "culture.html");

let currentNewsCard = match[0];
currentNewsCard = currentNewsCard
  .replace(/<span class="atlas-plate">People & traditions<\/span>/, '<span class="atlas-plate">Headlines & Pakistan today</span>')
  .replace(/<h3>\s*<a href="latest-news\.html">\s*Culture\s*<\/a>\s*<\/h3>/, '<h3>\n              <a href="latest-news.html">\n                Current News\n              </a>\n            </h3>')
  .replace(/People, traditions, languages, arts and everyday\s*life across Pakistan\./, "Current news, national developments, and important stories from Pakistan.");

const replacement = `${marker}\n\n        ${currentNewsCard}\n\n\n        ${cultureCard}`;
html = html.slice(0, archivesStart) + afterStart.replace(match[0], replacement);

fs.writeFileSync(file, html, "utf8");
console.log("Homepage fixed: Current News and Culture now have separate archive cards.");
