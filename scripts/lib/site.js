// Shared data and helpers for the MyBook.Pk build scripts.
// Everything here is deterministic: the same repository state always yields the same output,
// which is what keeps the generate-sitemap workflow idempotent.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://mybook.pk";
// Google AdSense publisher confirmed by the site owner (matches ads.txt). build-site.js writes these two
// tags, exactly once, directly after <head> on every page except search-engine verification files.
const ADSENSE_CLIENT = "ca-pub-3672700167787763";
const ADSENSE_SCRIPT = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>`;
const ADSENSE_META = `<meta name="google-adsense-account" content="${ADSENSE_CLIENT}">`;
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
// A district counts towards a province's total unless it has been split ("former") or only announced.
function isCurrent(d) { return !d.status; }
const byName = (a, b) => a.name.localeCompare(b.name, "en");
function districtsOf(pid) { return (districts[pid]?.districts || []).filter(isCurrent); }
function sortedDistrictsOf(pid) { return districtsOf(pid).sort(byName); }
// Former (split) and announced-but-not-notified districts that still have a page.
function otherDistrictsOf(pid) { return (districts[pid]?.districts || []).filter((d) => !isCurrent(d)).sort(byName); }
// Sourced official count; generators fail if the data list disagrees with it.
function districtCount(pid) {
  const c = districts[pid]?.district_count;
  const n = districtsOf(pid).length;
  if (!c || c.count !== n) throw new Error(`${pid}: district_count ${c && c.count} does not match ${n} current districts in data/districts.json`);
  return c;
}
function totalDistricts() { return provinceOrder.reduce((a, pid) => a + districtCount(pid).count, 0); }
// How a district's PBS 2023 total relates to its current boundaries.
function popQualifier(d) {
  if (d.population_2023 == null || !d.census_boundary_note) return "";
  if (/is the sum of/.test(d.population_source || "")) return ""; // total of the successor's own 2023 rows
  if (d.status === "former") return "undivided district";
  if (d.boundary_change_2026 && !/before .* was created/.test(d.census_boundary_note)) return "2023 boundaries";
  return "pre-split boundaries";
}
function statusLabel(d) { return d.status === "former" ? "former district" : d.status === "announced" ? "announced, not yet notified" : ""; }
function exists(file) { return fs.existsSync(path.join(ROOT, file)); }
function htmlFiles() { return fs.readdirSync(ROOT).filter((n) => n.endsWith(".html")).sort(); }

// Parent / successor relationships used for internal links (not adjacency).
const relatedPairs = [
  ["rawalpindi", "murree"], ["chakwal", "talagang"], ["gujranwala", "wazirabad"], ["muzaffargarh", "kotaddu"],
  ["dera-ghazi-khan", "taunsa"], ["dera-ismail-khan", "paharpur"], ["battagram", "allai"], ["lasbela", "hub"],
  ["jafarabad", "usta-muhammad"], ["swat", "bar-swat"], ["chitral-lower", "chitral-upper"], ["swa-upper", "swa-lower"],
  ["upper-kohistan", "lower-kohistan"], ["upper-kohistan", "kolai-palas"], ["lower-dir", "upper-dir"],
  ["quetta", "quetta-east"], ["quetta", "quetta-west"], ["quetta-east", "quetta-west"], ["dera-bugti", "north-dera-bugti"],
  ["dera-bugti", "south-dera-bugti"], ["north-dera-bugti", "south-dera-bugti"], ["khuzdar", "wadh"], ["khuzdar", "surab"],
  ["kech", "tump"], ["pishin", "barshore"]
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
  ADSENSE_CLIENT,
  ADSENSE_SCRIPT,
  ADSENSE_META,
  ROOT, SITE, OG_IMAGE, provinceRoutes, hubRoutes, PROVINCES_HUB, DISTRICTS_HUB, provinceOrder, shortProvince,
  isVerificationFile, NOINDEX_PAGES, provinces, districts, provinceById, districtIndex, districtsOf, sortedDistrictsOf,
  isCurrent, otherDistrictsOf, districtCount, totalDistricts, statusLabel, popQualifier,
  exists, htmlFiles, relatedPairs, extraRelated, esc, stripTags, decodeEntities, fmtInt, fmtNum, unitWord, unitsOf,
  unitType, unitNoun, cleanHq, listText, districtLabel
};
