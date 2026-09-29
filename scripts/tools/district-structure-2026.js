// Records the current (September 2026) district structure of every province and territory in
// data/districts.json and data/provinces.json, with sources. Run before scripts/tools/import-pbs-2023.js,
// which then fills in the PBS 2023 census fields. Idempotent: running it twice changes nothing.
//
// Rules: a district is counted when a government notification creating it has been reported by an
// official or reputable source. "status": "former" marks a district that has been split and no longer
// exists (its page is kept as an overview of the undivided district); "status": "announced" marks a
// district that has been announced but, per the latest official statements, not notified/operational.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "districts.json");
const PROV = path.join(ROOT, "data", "provinces.json");
const AS_OF = "2026-09-29";

const S = {
  balJul: { title: "Balochistan undergoes major restructuring", publisher: "Dawn", date: "2026-07-12", url: "https://www.dawn.com/news/2014773", note: "Reports the Balochistan Revenue Department notification of 8 July 2026 (11 divisions, 41 districts)." },
  balJul2: { title: "Quetta split into two districts as Balochistan undergoes administrative restructuring", publisher: "Dawn", date: "2026-07-11", url: "https://www.dawn.com/news/2014627" },
  balProPk: { title: "Balochistan Govt Notifies New Divisions and Districts", publisher: "ProPakistani", date: "2026-07-12", url: "https://propakistani.pk/2026/07/12/balochistan-govt-notifies-new-divisions-and-districts/", note: "8 divisions and 36 districts before, 11 divisions and 41 districts after." },
  balAry: { title: "Balochistan divided in 11 divisions and 41 districts", publisher: "ARY News", date: "2026-07", url: "https://arynews.tv/balochistan-divided-11-divisions-41-districts" },
  balDivList: { title: "Historic administrative reforms in Balochistan, 4 new divisions and 5 new districts established", publisher: "Daily Pakistan (via The Patriot)", date: "2026-07-12", url: "https://dailythepatriot.com/historic-administrative-reforms-in-balochistan/", note: "Only source seen with the full district list of every division." },
  balCabinetFeb: { title: "Balochistan Approves New Divisions and Districts", publisher: "ProPakistani", date: "2026-02-25", url: "https://propakistani.pk/2026/02/25/balochistan-approves-new-divisions-and-districts/", note: "Cabinet decisions of 19 January 2026: Barshor district, Pishin and Koh-e-Suleman divisions, Quetta to be split." },
  tump: { title: "Kech divided; new district Tump created (Revenue Department notification of 24 February 2026)", publisher: "Baldiyat Times", date: "2026-02-27", url: "https://baldiyattimes.com/?p=61791", note: "Tump: Tump and Mand sub-divisions/tehsils. Kech: Turbat, Buleda, Dasht (with Zamoran, Dasht and Balnigor sub-tehsils) and Hoshab." },
  tumpRadio: { title: "Tump enters new era of development after becoming district", publisher: "Radio Pakistan", date: "2026-05-12", url: "https://www.radio.gov.pk/12-05-2026/tump-enters-new-era-of-development-after-becoming-district" },
  udb: { title: "New Upper Dera Bugti district established with Bekhar as HQ", publisher: "Balochistan Express", date: "2026-02-26", url: "https://bexpress.com.pk/blog/69a08452418f8404bd6e3400" },
  kachhi: { title: "Kachhi at Dhadar: history of district", publisher: "Balochistan High Court (district judiciary)", url: "https://bhc.gov.pk/district-judiciary/kachhi/introduction/history" },
  punjab: { title: "New administrative map for divisions and tehsils issued by Punjab", publisher: "SUNO News", date: "2026-01-01", url: "https://english.sunonews.tv/pakistan/politics/new-administrative-map-for-divisions-and-tehsils-issued-by-punjab/1767247234-11790", note: "Punjab government notification: 10 divisions, 41 districts, 156 tehsils, with the district list of each division." },
  sindh: { title: "There are 30 districts in Sindh Province", publisher: "Sindh Human Rights Commission, Government of Sindh", url: "https://www.shrc.org.pk/info-districts.php" },
  barSwat: { title: "Bar Swat notified as separate district", publisher: "The News", date: "2026-01-28", url: "https://www.thenews.pk/print/1395600-bar-swat-notified-as-separate-district" },
  barSwatDawn: { title: "Swat bifurcation notified", publisher: "Dawn", date: "2026-01-28", url: "https://www.dawn.com/news/1969386" },
  paharpur: { title: "KP Govt notifies creation of new District Paharpur", publisher: "APP", date: "2025-11-26", url: "https://www.app.com.pk/domestic/kp-govt-notifies-creation-of-new-district-paharpur/" },
  allai2023: { title: "Allai tehsil of Battagram given district status", publisher: "Dawn", date: "2023-01", url: "https://www.dawn.com/news/1732891" },
  allai2025: { title: "Chief Minister KP announces district status for Allai", publisher: "APP", date: "2025-05-23", url: "https://www.app.com.pk/domestic/chief-minister-kp-announces-district-status-for-allai/" },
  allai2026: { title: "KP CM announces Rs200 billion uplift package for Hazara (\"Allai to be notified as district\")", publisher: "Dawn", date: "2026-02-25", url: "https://www.dawn.com/news/1975543" },
  allaiAug: { title: "KP CM Sohail Afridi Announces Rs2bn Battagram Package (\"Allai would be upgraded to district status\")", publisher: "The Public Purview", date: "2026-08-29", url: "https://thepublicpurview.com/kp-cm-sohail-afridi-announces-rs2bn-battagram-package/" },
  gb: { title: "Four new districts set up in GB", publisher: "Dawn", date: "2019-06", url: "https://www.dawn.com/news/1488851", note: "GB government notification of four new districts (Darel, Tangir, Roundu, Gupis-Yasin); 14 districts in total." },
  ajk: { title: "AJK at a Glance 2024", publisher: "Planning & Development Department, Government of AJK", date: "2024", url: "https://pndajk.gov.pk/uploadfiles/downloads/AJK%20At%20A%20Glance-2024.pdf", note: "Districts: 10." },
  ict: { title: "Islamabad Capital Territory Administration", publisher: "ICT Administration", url: "https://ictadministration.gov.pk/", note: "The capital territory is administered as a single district." }
};

const counts = {
  punjab: { count: 41, divisions: 10, basis: "Punjab government notification of the administrative structure (reported 1 January 2026): 10 divisions, 41 districts, 156 tehsils.", sources: [S.punjab] },
  sindh: { count: 30, divisions: 6, basis: "Government of Sindh (Sindh Human Rights Commission district list); no new district has been notified since the 2023 census.", sources: [S.sindh] },
  kpk: {
    count: 38, divisions: 7,
    basis: "35 districts in the PBS 2023 census tables (South Waziristan counted as one), plus the 2022 split of South Waziristan into Upper and Lower South Waziristan, Paharpur (notified 26 November 2025) and Bar Swat (notified 27 January 2026).",
    note: "Press totals disagree (The News: 37 after Bar Swat; MM News: 40). Allai is not counted: a January 2023 notification was never implemented, and KP chief ministers announced district status again in May 2025, February 2026 and August 2026 without a new notification.",
    sources: [S.paharpur, S.barSwat, S.barSwatDawn, S.allai2025, S.allai2026, S.allaiAug]
  },
  balochistan: {
    count: 41, divisions: 11,
    basis: "Balochistan Revenue Department notification of 8 July 2026: 11 divisions and 41 districts (up from 8 divisions and 36 districts).",
    note: "The five added districts are Quetta West (Quetta split into Quetta East and Quetta West), Wadh (from Khuzdar), Tump (from Kech, notified 24 February 2026), Barshore (from Pishin) and North Dera Bugti (Dera Bugti split into North and South Dera Bugti). The division of each district follows the only published full list (Daily Pakistan); Musakhel appears under both Zhob and Loralai in the February 2026 cabinet summary.",
    sources: [S.balJul, S.balJul2, S.balProPk, S.balAry, S.balDivList, S.balCabinetFeb, S.tump]
  },
  gb: { count: 14, divisions: 3, basis: "Gilgit-Baltistan government notification of June 2019 (four new districts, 14 in total).", sources: [S.gb] },
  ajk: { count: 10, divisions: 3, basis: "AJK Planning & Development Department, AJK at a Glance 2024.", sources: [S.ajk] },
  ict: { count: 1, divisions: 0, basis: "Islamabad Capital Territory is a single district.", sources: [S.ict] }
};

// Balochistan divisions after the 8 July 2026 notification.
const balDivisions = {
  "Quetta Division": ["quetta-east", "quetta-west", "mastung"],
  "Khuzdar Division": ["khuzdar", "kalat", "surab", "wadh"],
  "Lasbela Division": ["lasbela", "hub", "awaran"],
  "Rakhshan Division": ["chagai", "nushki", "kharan", "washuk"],
  "Makuran Division": ["kech", "gwadar", "panjgur", "tump"],
  "Naseerabad Division": ["nasirabad", "jafarabad", "jhal-magsi", "usta-muhammad", "sohbatpur"],
  "Sevi Division": ["sibi", "south-dera-bugti", "kachhi"],
  "Loralai Division": ["loralai", "duki", "ziarat", "musakhel", "harnai"],
  "Zhob Division": ["zhob", "sherani", "qilla-saifullah"],
  "Pishin Division": ["pishin", "barshore", "qilla-abdullah", "chaman"],
  "Koh-i-Suleman Division": ["kohlu", "barkhan", "north-dera-bugti"]
};

const julyNote = "Balochistan Revenue Department notification of 8 July 2026";
const newDistricts = {
  balochistan: [
    { slug: "kachhi", name: "Kachhi", hq: "Dhadar",
      about: "Kachhi District lies on the Kachhi plain below the Bolan Pass, with its headquarters at Dhadar. The 8 July 2026 notification moved it from Naseerabad Division to Sevi (Sibi) Division; its boundaries were not changed.",
      admin_sources: [S.kachhi, S.balJul] },
    { slug: "quetta-east", subdivisions: ["Saddar", "City", "Sariab"], name: "Quetta East", predecessor: "quetta", created: julyNote,
      about: "Quetta East is one of the two districts formed when Quetta District was divided along the railway line by the 8 July 2026 notification. It comprises the Saddar, City and Sariab sub-divisions.",
      admin_sources: [S.balJul, S.balJul2, S.balProPk] },
    { slug: "quetta-west", subdivisions: ["Kuchlak", "Brewery", "Panjpai"], name: "Quetta West", predecessor: "quetta", created: julyNote,
      about: "Quetta West is one of the two districts formed when Quetta District was divided along the railway line by the 8 July 2026 notification. It comprises the Kuchlak sub-division and the newly created Brewery and Panjpai sub-divisions, with a new Brewery tehsil.",
      admin_sources: [S.balJul, S.balJul2, S.balProPk] },
    { slug: "wadh", subdivisions: ["Wadh", "Ornach", "Nal"], name: "Wadh", predecessor: "khuzdar", created: julyNote, hq: "Nal", hq_source: S.balDivList,
      about: "Wadh District was separated from Khuzdar by the 8 July 2026 notification and contains the Wadh, Ornach and Nal sub-divisions. It is part of the new Khuzdar Division.",
      admin_sources: [S.balJul, S.balJul2, S.balDivList] },
    { slug: "tump", subdivisions: ["Tump", "Mand"], name: "Tump", predecessor: "kech", created: "Balochistan Revenue Department notification of 24 February 2026", hq: "Tump",
      about: "Tump District was carved out of Kech by a Revenue Department notification of 24 February 2026, with its headquarters at Tump. It consists of the Tump and Mand sub-divisions and tehsils, in Makuran (Makran) Division.",
      admin_sources: [S.tump, S.tumpRadio, S.balDivList] },
    { slug: "barshore", name: "Barshore", predecessor: "pishin", created: julyNote, hq: "Barshore",
      about: "Barshore (Barshor) District was approved by the Balochistan cabinet in early 2026 and is part of the new Pishin Division. The 8 July 2026 notification upgraded Barshore to a tehsil and created the Toba Kakari sub-division and tehsil in the district.",
      admin_sources: [S.balCabinetFeb, S.balJul, S.balJul2] },
    { slug: "north-dera-bugti", name: "North Dera Bugti", predecessor: "dera-bugti", created: "Created as Upper Dera Bugti in February 2026; renamed North Dera Bugti by the 8 July 2026 notification", hq: "Baiker (Bekhar)",
      about: "North Dera Bugti was created as Upper Dera Bugti when Dera Bugti District was divided in February 2026, with its headquarters at Baiker (Bekhar), and was renamed North Dera Bugti by the 8 July 2026 notification. It is part of the new Koh-i-Suleman Division.",
      admin_sources: [S.udb, S.balJul, S.balJul2] },
    { slug: "south-dera-bugti", name: "South Dera Bugti", predecessor: "dera-bugti", created: "Renamed from Lower Dera Bugti by the 8 July 2026 notification",
      about: "South Dera Bugti is the remainder of the former Dera Bugti District after Upper (now North) Dera Bugti was separated in 2026. The 8 July 2026 notification renamed it from Lower Dera Bugti and placed it in Sevi (Sibi) Division.",
      admin_sources: [S.balJul, S.balJul2, S.balAry] }
  ]
};

const former = {
  quetta: { successors: ["quetta-east", "quetta-west"], ended: julyNote,
    status_note: "Quetta District was divided into Quetta East and Quetta West along the railway line by the Balochistan Revenue Department notification of 8 July 2026. This page covers the undivided district; the 2023 census figures below are for the whole of it.",
    admin_sources: [S.balJul, S.balJul2, S.balProPk] },
  "dera-bugti": { successors: ["north-dera-bugti", "south-dera-bugti"], ended: "Divided in February 2026; the parts were renamed North and South Dera Bugti on 8 July 2026",
    status_note: "Dera Bugti District was divided in February 2026 into Upper and Lower Dera Bugti, renamed North Dera Bugti and South Dera Bugti by the notification of 8 July 2026. This page covers the undivided district; the 2023 census figures below are for the whole of it.",
    admin_sources: [S.udb, S.balJul, S.balJul2] }
};

const announced = {
  allai: { status_note: "Allai is a tehsil of Battagram District. A January 2023 notification giving it district status was not implemented; KP chief ministers announced district status again in May 2025 and February 2026, and in August 2026 it was still described as a tehsil to be upgraded. MyBook.Pk does not count it as a district until a notification is issued.",
    admin_sources: [S.allai2023, S.allai2025, S.allai2026, S.allaiAug] }
};

// Boundary changes to surviving districts (their PBS 2023 totals are no longer current).
const boundaryChanges = {
  khuzdar: "Wadh District (Wadh, Ornach and Nal sub-divisions) was separated from Khuzdar and the Zehri sub-division moved to Surab by the notification of 8 July 2026.",
  surab: "Surab (renamed from Shaheed Sikandarabad) received the Zehri sub-division and tehsil from Khuzdar under the notification of 8 July 2026.",
  kech: "Tump District (Tump and Mand) was separated from Kech by the notification of 24 February 2026.",
  pishin: "Barshore District was separated from Pishin in 2026.",
  lasbela: "The Shahnoorani and Kalghalo union councils of Khuzdar were added to Lasbela's Kanraj sub-division on 8 July 2026."
};

const districts = JSON.parse(fs.readFileSync(DATA, "utf8"));
const before = JSON.stringify(districts);
const all = new Map();
for (const [pid, p] of Object.entries(districts)) for (const d of p.districts) all.set(d.slug, { d, pid });

for (const [pid, c] of Object.entries(counts)) districts[pid].district_count = { ...c, as_of: AS_OF };

for (const [pid, list] of Object.entries(newDistricts)) {
  for (const nd of list) {
    const hit = all.get(nd.slug);
    if (hit) Object.assign(hit.d, nd);
    else { const d = { ...nd }; districts[pid].districts.push(d); all.set(nd.slug, { d, pid }); }
  }
}
for (const [slug, f] of Object.entries(former)) Object.assign(all.get(slug).d, { status: "former", ...f });
for (const [slug, a] of Object.entries(announced)) Object.assign(all.get(slug).d, { status: "announced", ...a });
for (const [slug, note] of Object.entries(boundaryChanges)) all.get(slug).d.boundary_change_2026 = note;

for (const [division, slugs] of Object.entries(balDivisions)) {
  for (const slug of slugs) {
    const hit = all.get(slug);
    if (!hit) throw new Error(`Unknown district in division list: ${slug}`);
    hit.d.division = division;
    hit.d.division_source = julyNote;
  }
}
const quetta = all.get("quetta").d;
delete quetta.division;
// Old free-text hedges that the sourced structure above replaces.
if (/confirm before citing/.test(quetta.about || "")) quetta.about = "Provincial capital in a high dry bowl: fruit markets, cantonment and university city.";
const khuzdar = all.get("khuzdar").d;
if (/confirm/.test(khuzdar.villages || "")) khuzdar.villages = "Karkh, Moola, Baghbana";
const pishin = all.get("pishin").d;
if (/sometimes separate/.test(pishin.villages || "")) pishin.villages = "Hurram Zai, Karezat, Saranan";
const allai = all.get("allai").d;
if (/became a full KP district/.test(allai.about || "")) allai.about = "Allai is the mountain valley north of Battagram, historically ruled by its own Nawabs until 1971. It is a tehsil of Battagram District; district status has been announced but not yet notified.";

// Every province's list must match its sourced count.
for (const [pid, p] of Object.entries(districts)) {
  const current = p.districts.filter((d) => !d.status).length;
  if (current !== p.district_count.count) throw new Error(`${pid}: ${current} current districts in data but ${p.district_count.count} in the sourced count`);
}

if (JSON.stringify(districts) !== before) fs.writeFileSync(DATA, JSON.stringify(districts, null, 2) + "\n");

// data/provinces.json (and its unused copy js/data/provinces.json) are hand-formatted, so only the two
// numbers per unit are rewritten in place.
for (const file of [PROV, path.join(ROOT, "js", "data", "provinces.json")]) {
  if (!fs.existsSync(file)) continue;
  let provText = fs.readFileSync(file, "utf8");
  const provBefore = provText;
  for (const [pid, c] of Object.entries(counts)) {
    const re = new RegExp(`("id": "${pid}",[\\s\\S]*?)"districts(?:_approx)?": \\d+,(\\s*)"divisions": \\d+,`);
    if (!re.test(provText)) throw new Error(`${file}: no district count for ${pid}`);
    provText = provText.replace(re, `$1"districts": ${c.count},$2"divisions": ${c.divisions},`);
  }
  if (provText !== provBefore) fs.writeFileSync(file, provText);
}
console.log(Object.entries(districts).map(([pid, p]) => `${pid} ${p.district_count.count}`).join(", "));
