const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const file = path.join(ROOT, "index.html");
const marker = "<!-- HOME CURRENT NEWS + CULTURE FIX -->";
const cultureImage = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Truck_Art_of_Pakistan.jpg/1280px-Truck_Art_of_Pakistan.jpg";
const cultureCredit = '<span class="atlas-photo-credit"><a href="https://commons.wikimedia.org/wiki/File:Truck_Art_of_Pakistan.jpg" rel="noopener noreferrer">Photo: Baharwassan / Wikimedia Commons</a> · CC BY-SA 4.0</span>';

let html = fs.readFileSync(file, "utf8");

function applyCultureImage(doc) {
  const archive = doc.match(/<div class="atlas-archives">[\s\S]*?<\/div>\s*<\/div>/);
  if (!archive) return doc;

  const cards = [...archive[0].matchAll(/<article class="atlas-archive">[\s\S]*?<\/article>/g)];
  if (cards.length < 2) return doc;

  const second = cards[1][0];
  const updatedSecond = second
    .replace(/<img\b([^>]*?)\bsrc="[^"]+"([^>]*)>/i, `<img$1src="${cultureImage}"$2>`)
    .replace(/<img\b([^>]*?)\balt="[^"]*"([^>]*)>/i, '<img$1alt="Pakistani truck art, a vibrant tradition of Pakistani visual culture"$2>')
    .replace(/<span class="atlas-photo-credit">[\s\S]*?<\/span>/i, cultureCredit);

  if (updatedSecond === second) return doc;
  return doc.replace(second, updatedSecond);
}

function ensureCacheBustedApp(doc) {
  return doc.replace(/<script\s+src="js\/app\.js(?:\?[^\"]*)?"\s*><\/script>/i, '<script src="js/app.js?v=3"></script>');
}

if (!html.includes(marker)) {
  const archivesStart = html.indexOf('<div class="atlas-archives">');
  if (archivesStart === -1) {
    console.error("Could not find homepage archive container.");
    process.exit(1);
  }

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
}

html = applyCultureImage(html);
html = ensureCacheBustedApp(html);
fs.writeFileSync(file, html, "utf8");
console.log("Homepage fixed: Current News is between Home and Culture, and the Culture card uses credited Pakistani truck art.");
