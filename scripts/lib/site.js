// Shared data and helpers for the MyBook.Pk build scripts.
// Everything here is deterministic: the same repository state always yields the same output,
// which is what keeps the generate-sitemap workflow idempotent.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://mybook.pk";
const OG_IMAGE = `${SITE}/images/og/mybook-pk-1200x630.png`;

const provinceRoutes = {
  punjab: "punjab.html",
  sindh: "sindh.html",
  kpk: "khyber-pakhtunkhwa.html",
  balochistan: "balochistan.html",
  gb: "gilgit-baltistan.html",
  ajk: "azad-kashmir.html",
  ict: "islamabad-capital-territory.html"
};
const hubRoutes = {
  punjab: "districts-of-punjab.html",
  sindh: "districts-of-sindh.html",
  kpk: "districts-of-khyber-pakhtunkhwa.html",
  balochistan: "districts-of-balochistan.html",
  gb: "districts-of-gilgit-baltistan.html",
  ajk: "districts-of-azad-kashmir.html",
  ict: "districts-of-islamabad-capital-territory.html"
};
const PROVINCES_HUB = "provinces.html";
const DISTRICTS_HUB = "districts.html";
const provinceOrder = ["punjab", "sindh", "kpk", "balochistan", "gb", "ajk", "ict"];
const shortProvince = { punjab: "Punjab", sindh: "Sindh", kpk: "KP", balochistan: "Balochistan", gb: "Gilgit-Baltistan", ajk: "AJK", ict: "ICT" };

// Files that must never be rewritten by any script (search-engine verification files etc.).
function isVerificationFile(name) {
  return /^google[0-9a-f]{8,}\.html$/i.test(name) || /^yandex_[0-9a-f]+\.html$/i.test(name) ||
    /^BingSiteAuth\.xml$/i.test(name) || /^pinterest-[0-9a-f]+\.html$/i.test(name);
}
// JavaScript shells / utility pages: kept out of the index.
const NOINDEX_PAGES = new Set(["district.html", "province.html", "404.html"]);

function readJson(rel) { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
const provinces = readJson("data/provinces.json");
const districts = readJson("data/districts.json");
const provinceById = Object.fromEntries(provinces.units.map((u) => [u.id, u]));

const districtIndex = new Map();
for (const pid of provinceOrder) {
  for (const d of districts[pid]?.districts || []) {
    districtIndex.set(d.slug, { district: d, provinceId: pid, province: provinceById[pid] });
  }
}
function districtsOf(pid) { return (districts[pid]?.districts || []).slice(); }
function sortedDistrictsOf(pid) { return districtsOf(pid).sort((a, b) => a.name.localeCompare(b.name, "en")); }
function exists(file) { return fs.existsSync(path.join(ROOT, file)); }
function htmlFiles() { return fs.readdirSync(ROOT).filter((n) => n.endsWith(".html")).sort(); }

// Parent / successor relationships used for internal links (not adjacency).
const relatedPairs = [
  ["rawalpindi", "murree"], ["chakwal", "talagang"], ["gujranwala", "wazirabad"], ["muzaffargarh", "kotaddu"],
  ["dera-ghazi-khan", "taunsa"], ["dera-ismail-khan", "paharpur"], ["battagram", "allai"], ["lasbela", "hub"],
  ["jafarabad", "usta-muhammad"], ["swat", "bar-swat"], ["chitral-lower", "chitral-upper"], ["swa-upper", "swa-lower"],
  ["upper-kohistan", "lower-kohistan"], ["upper-kohistan", "kolai-palas"], ["lower-dir", "upper-dir"]
];
const extraRelated = { "swa-upper": ["south-waziristan.html"], "swa-lower": ["south-waziristan.html"] };

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function stripTags(s) { return String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function decodeEntities(s) {
  return String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
}
function fmtInt(n) { return Number(n).toLocaleString("en-US"); }
function fmtNum(n, digits = 0) { return Number(n).toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }); }

const unitWord = { tehsil: "Tehsil", taluka: "Taluka", "sub-division": "Sub-division", "sub-tehsil": "Sub-tehsil", area: "Area" };
function unitsOf(d) { return Array.isArray(d.census_units_2023) ? d.census_units_2023 : []; }
function unitType(d) {
  const types = new Set(unitsOf(d).map((u) => u.type));
  return types.size === 1 ? [...types][0] : "mixed";
}
// Plural noun for the district's tehsil-level units, e.g. "tehsils", "talukas", "sub-divisions".
function unitNoun(d, count) {
  const t = unitType(d);
  const base = t === "taluka" ? "taluka" : t === "sub-division" ? "sub-division" : "tehsil";
  return count === 1 ? base : base + "s";
}
function cleanHq(hq) {
  const v = String(hq || "").trim();
  if (!v || /notified|belt|\?|see |n\/a/i.test(v)) return "";
  return v;
}
function listText(items, max = items.length) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`;
  if (shown.length <= 1) return shown.join("");
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
}
function districtLabel(d) { return /district/i.test(d.name) ? d.name : `${d.name} District`; }

module.exports = {
  ROOT, SITE, OG_IMAGE, provinceRoutes, hubRoutes, PROVINCES_HUB, DISTRICTS_HUB, provinceOrder, shortProvince,
  isVerificationFile, NOINDEX_PAGES, provinces, districts, provinceById, districtIndex, districtsOf, sortedDistrictsOf,
  exists, htmlFiles, relatedPairs, extraRelated, esc, stripTags, decodeEntities, fmtInt, fmtNum, unitWord, unitsOf,
  unitType, unitNoun, cleanHq, listText, districtLabel
};
