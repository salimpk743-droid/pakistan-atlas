// One-off importer: merges PBS 2023 census Table 1 figures into data/districts.json.
// Source data: data/sources/pbs-2023-table1-districts.json (parsed by scripts/tools/parse-pbs-table1.py
// from the official PBS PDFs). Every district's unit rows were checked to sum exactly to the district total.
// Only figures that appear in the PBS table are written. Districts created after the census get
// no district total; where their composition is documented (Swat / Bar Swat) the tehsil rows are listed.
// Re-running is safe: it overwrites the census fields it owns and nothing else.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "districts.json");
const pbs = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sources", "pbs-2023-table1-districts.json"), "utf8"));
const districts = JSON.parse(fs.readFileSync(DATA, "utf8"));
const VERIFIED = "2026-09-29";
const PBS_URL = (p) => `https://www.pbs.gov.pk/wp-content/uploads/census_tables/tables/table_1_${p}_districts.pdf`;
const SOURCE = "Pakistan Bureau of Statistics, 7th Population and Housing Census 2023, Table 1 (area, population, density, urban proportion, household size and growth rate by administrative unit)";
const provinceOf = { punjab: "punjab", sindh: "sindh", kp: "kpk", balochistan: "balochistan" };

const slugOverride = {
  "BATAGRAM": "battagram", "KOLAI PALAS KOHISTAN": "kolai-palas", "KAMBAR SHAHDAD KOT": "kamber",
  "MIRPUR KHAS": "mirpurkhas", "NAUSHAHRO FEROZE": "naushahro", "SHAHEED BENAZIRABAD": "sba",
  "TANDO ALLAHYAR": "tando-allahyar", "TANDO AHYAR": "tando-allahyar", "TANDO MUHAMMAD KHAN": "tando-mk", "UMER KOT": "umerkot",
  "JAFFARABAD": "jafarabad", "KILLA ABDULLAH": "qilla-abdullah", "KILLA SAIFULLAH": "qilla-saifullah",
  "MANDI BAHAUDDIN": "mbdin", "LOWER CHITRAL": "chitral-lower", "UPPER CHITRAL": "chitral-upper"
};
// Unit names that pdftotext wrapped or printed oddly; confirmed against the population rows.
// The PDFs use a ligature glyph for "LLA" that pdftotext drops (ALLAI -> "AI", KALLAR -> "KAR",
// ALLAHYAR -> "AHYAR"); those names are restored here.
const unitNameFix = {
  "KAR KAHAR TEHSIL": "KALLAR KAHAR TEHSIL",
  "KAR SAYADDAN TEHSIL": "KALLAR SAYADDAN TEHSIL",
  "TANDO AHYAR TALUKA": "TANDO ALLAHYAR TALUKA",
  "CHOWK SARWAR": "CHOWK SARWAR SHAHEED TEHSIL",
  "NORTH NAZIMABAD SUB-": "NORTH NAZIMABAD SUB-DIVISION",
  "BEHRAIN TEHSIL": "BAHRAIN TEHSIL",       // PBS spelling "Behrain"; Bahrain in the KP notification coverage
  "KHAWAZAKHELA TEHSIL": "KHWAZAKHELA TEHSIL", // PBS spelling "Khawazakhela"
  "AI TEHSIL": "ALLAI TEHSIL",           // Battagram: 218,149 = Allai tehsil (Battagram 554,133 - Battagram tehsil 335,984)
  "TALA GANG TEHSIL": "TALAGANG TEHSIL",
  "SUB-DIVISION CITY": "CITY SUB-DIVISION",
  "SUB-DIVISION KUCHLAK": "KUCHLAK SUB-DIVISION",
  "SUB-DIVISION SARIAB": "SARIAB SUB-DIVISION",
  "SUB-DIVISION SADDAR TEHSIL": "SADDAR SUB-DIVISION",
  "SUB-TEHSIL PANJPAI": "PANJPAI SUB-TEHSIL",
  "DE-EXCLUDED AREA": "DE-EXCLUDED AREA AREA"
};
const SMALL = new Set(["e", "i", "o", "ul", "al", "ki", "ka", "and"]);
function titleCase(s) {
  return s.toLowerCase().replace(/[a-z]+/g, (w, i, all) => {
    const prev = all[i - 1];
    if (i > 0 && prev === "-" && SMALL.has(w)) return w;
    return w[0].toUpperCase() + w.slice(1);
  });
}
function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function unitOf(raw) {
  const name = unitNameFix[raw.name] || raw.name;
  const m = name.match(/^(.*?)\s+(SUB-TEHSIL|SUB-DIVISION|TEHSIL|TALUKA|AREA)$/);
  if (!m) throw new Error(`Unrecognised unit name ${raw.name}`);
  const type = { "SUB-TEHSIL": "sub-tehsil", "SUB-DIVISION": "sub-division", "TEHSIL": "tehsil", "TALUKA": "taluka", "AREA": "area" }[m[2]];
  return {
    name: titleCase(m[1]).replace("De-Excluded", "De-excluded"),
    type,
    population_2023: raw.population_2023,
    area_km2: raw.area_km2,
    density_2023: raw.density,
    urban_proportion_2023: raw.urban_pct,
    growth_rate_2017_2023: raw.growth
  };
}

// Districts whose 2023 census boundaries have since changed (new districts carved out after the census).
const laterSplits = {
  rawalpindi: ["murree"], chakwal: ["talagang"], gujranwala: ["wazirabad"], muzaffargarh: ["kotaddu"],
  "dera-ghazi-khan": ["taunsa"], "dera-ismail-khan": ["paharpur"],
  lasbela: ["hub"], jafarabad: ["usta-muhammad"], swat: ["bar-swat"], pishin: ["barshore"]
};
// Allai is not counted as a district (announced, not notified), so Battagram's 2023 total is still current.
// New districts: the PBS row of the tehsil/sub-division with the same name (a fact, not a district total).
const successorRow = {
  murree: ["rawalpindi", "Murree"], talagang: ["chakwal", "Talagang"], wazirabad: ["gujranwala", "Wazirabad"],
  kotaddu: ["muzaffargarh", "Kot Addu"], taunsa: ["dera-ghazi-khan", "Taunsa"], paharpur: ["dera-ismail-khan", "Paharpur"],
  allai: ["battagram", "Allai"], hub: ["lasbela", "Hub"], "usta-muhammad": ["jafarabad", "Usta Muhammad"],
  barshore: ["pishin", "Barshore"], "north-dera-bugti": ["dera-bugti", "Baiker"], "south-dera-bugti": ["dera-bugti", "Dera Bugti"]
};
// New districts whose notified sub-divisions match several PBS 2023 rows, but whose boundaries were redrawn
// (or include newly created units), so the rows are listed without a district total.
const successorRows = {
  "quetta-east": ["quetta", ["City", "Saddar", "Sariab"]],
  "quetta-west": ["quetta", ["Kuchlak", "Panjpai"]],
  wadh: ["khuzdar", ["Wadh", "Nal", "Ornach"]]
};
// Splits where the notified tehsils/sub-divisions map exactly onto PBS 2023 rows, so each successor's
// 2023 total is the sum of its rows. Swat: KP notification of 27 Jan 2026 (Dawn, 28 Jan 2026).
// Kech/Tump: Balochistan Revenue Department notification of 24 Feb 2026 (Baldiyat Times, 27 Feb 2026).
const SPLITS = [
  {
    parent: "swat", prov: "kp", tehsilCount: true,
    source: "Khyber Pakhtunkhwa government notification of 27 January 2026, reported by Dawn on 28 January 2026",
    url: "https://www.dawn.com/news/1969386",
    parts: {
      swat: { hq: "Gulkada (Babuzai tehsil)", units: ["Babuzai", "Kabal", "Charbagh", "Barikot"] },
      "bar-swat": { hq: "Matta", units: ["Matta", "Bahrain", "Khwazakhela"] }
    }
  },
  {
    parent: "kech", prov: "balochistan", tehsilCount: false,
    source: "Balochistan Revenue Department notification of 24 February 2026, reported by Baldiyat Times on 27 February 2026",
    url: "https://baldiyattimes.com/?p=61791",
    parts: {
      kech: { hq: "Turbat", units: ["Turbat", "Bulaida", "Dasht", "Zamoran", "Balnigore", "Hoshab"] },
      tump: { hq: "Tump", units: ["Tump", "Mand"] }
    }
  }
];

const all = new Map();
for (const [pid, data] of Object.entries(districts)) for (const d of data.districts) all.set(d.slug, d);

const OWNED = ["population_2023", "area_km2", "density_2023", "urban_proportion_2023", "avg_household_size_2023",
  "growth_rate_2017_2023", "population_source", "population_source_url", "last_verified", "tehsils_2023",
  "census_units_2023", "census_boundary_note", "census_2023_row", "census_2023_rows", "tehsil_count", "tehsil_count_source", "administrative_source"];

const pbsBySlug = new Map();
const unmatched = [];
for (const [prov, list] of Object.entries(pbs)) {
  for (const row of list) {
    const pbsName = row.name.replace(/ DISTRICT$/, "");
    const slug = slugOverride[pbsName] || slugify(pbsName);
    const d = all.get(slug);
    if (!d || !districts[provinceOf[prov]].districts.includes(d)) { unmatched.push(`${prov}: ${pbsName}`); continue; }
    pbsBySlug.set(slug, { prov, row, units: row.units.map(unitOf) });
  }
}

for (const d of all.values()) {
  for (const k of OWNED) delete d[k];
  const hit = pbsBySlug.get(d.slug);
  if (hit) {
    const { prov, row, units } = hit;
    Object.assign(d, {
      population_2023: row.population_2023,
      area_km2: row.area_km2,
      density_2023: row.density,
      urban_proportion_2023: row.urban_pct,
      avg_household_size_2023: row.hh_size,
      growth_rate_2017_2023: row.growth,
      population_source: SOURCE,
      population_source_url: PBS_URL(prov),
      last_verified: VERIFIED,
      census_units_2023: units
    });
    const types = new Set(units.map((u) => u.type));
    if (!laterSplits[d.slug] && !d.boundary_change_2026 && !d.status && types.size === 1 && ["tehsil", "taluka", "sub-division"].includes([...types][0]) && prov !== "balochistan") {
      d.tehsil_count = units.length;
      d.tehsil_count_source = "PBS 2023 census, Table 1";
    }
    const changed = laterSplits[d.slug] || d.boundary_change_2026 || d.status === "former";
    if (changed) {
      d.census_boundary_note = d.status === "former"
        ? `These figures are for the undivided ${d.name} District as enumerated in the 2023 census, before it was divided into ${d.successors.map((s) => all.get(s)?.name || s).join(" and ")}.`
        : laterSplits[d.slug]
          ? `These figures are for ${d.name} District as enumerated in the 2023 census, before ${laterSplits[d.slug].map((s) => all.get(s)?.name || s).join(" and ")} District was created from part of it, so the current district total is lower.${d.boundary_change_2026 && !laterSplits[d.slug].some((s) => d.boundary_change_2026.includes(all.get(s)?.name)) ? ` ${d.boundary_change_2026}` : ""}`
          : `These figures are for ${d.name} District as enumerated in the 2023 census. ${d.boundary_change_2026} The current district total therefore differs.`;
    }
  }
  if (successorRow[d.slug]) {
    const [parent, unitName] = successorRow[d.slug];
    const unit = pbsBySlug.get(parent)?.units.find((u) => u.name === unitName);
    if (unit) d.census_2023_row = { parent, ...unit, source_url: pbsBySlug.get(parent) ? PBS_URL(pbsBySlug.get(parent).prov) : undefined };
  }
  if (successorRows[d.slug]) {
    const [parent, names] = successorRows[d.slug];
    const units = names.map((n) => {
      const u = pbsBySlug.get(parent)?.units.find((x) => x.name === n);
      if (!u) throw new Error(`${d.slug}: PBS unit ${n} not found under ${parent}`);
      return u;
    });
    d.census_2023_rows = { parent, units, source_url: PBS_URL(pbsBySlug.get(parent).prov) };
  }
}

for (const split of SPLITS) {
  const parentUnits = pbsBySlug.get(split.parent).units;
  const covered = [];
  for (const [slug, spec] of Object.entries(split.parts)) {
    const d = all.get(slug);
    const units = spec.units.map((n) => {
      const u = parentUnits.find((x) => x.name === n);
      if (!u) throw new Error(`${split.parent}: PBS unit ${n} not found`);
      covered.push(n);
      return u;
    });
    const pop = units.reduce((a, u) => a + u.population_2023, 0);
    const area = units.reduce((a, u) => a + u.area_km2, 0);
    const others = Object.keys(split.parts).filter((s) => s !== slug).map((s) => all.get(s).name);
    Object.assign(d, {
      hq: spec.hq,
      census_units_2023: units,
      population_2023: pop,
      area_km2: area,
      density_2023: Math.round((pop / area) * 100) / 100,
      population_source: `${SOURCE}; ${d.name} total is the sum of the 2023 rows of its ${units.length} ${split.tehsilCount ? "tehsils" : "units"}`,
      population_source_url: PBS_URL(split.prov),
      last_verified: VERIFIED,
      census_boundary_note: `The 2023 census counted ${d.name} and ${others.join(" and ")} as one district (${all.get(split.parent).name}). Since the ${split.source.replace(/, reported.*$/, "")}, ${d.name} District consists of ${units.map((u) => u.name).join(", ").replace(/, ([^,]*)$/, " and $1")}; the population and area shown are the sum of those units' 2023 census rows.`
    });
    if (split.tehsilCount) Object.assign(d, { tehsil_count: units.length, tehsil_count_source: `${split.source} (${split.url})` });
    else Object.assign(d, { administrative_source: `${split.source} (${split.url})` });
    delete d.census_2023_row;
    // Urban share, household size and growth are published for the undivided district only.
    delete d.urban_proportion_2023; delete d.avg_household_size_2023; delete d.growth_rate_2017_2023;
  }
  const missing = parentUnits.filter((u) => !covered.includes(u.name)).map((u) => u.name);
  if (missing.length) throw new Error(`${split.parent}: PBS units not assigned to a successor: ${missing.join(", ")}`);
}
const swat = all.get("swat");
swat.pop = `${swat.population_2023.toLocaleString("en-US")} (2023 census, four tehsils)`;
swat.about = "Swat is the former princely state on the Swat River, known for its Buddhist archaeology and mountain valleys. Since January 2026 it has four tehsils (Babuzai, Kabal, Charbagh and Barikot), with its headquarters at Gulkada in Babuzai.";
const barSwat = all.get("bar-swat");
barSwat.pop = `${barSwat.population_2023.toLocaleString("en-US")} (2023 census, three tehsils)`;
barSwat.about = "Bar Swat (Upper Swat) was notified as a separate district in January 2026, following a provincial cabinet decision of 19 December 2025. Its headquarters is Matta and it has three tehsils: Matta, Bahrain and Khwazakhela.";
const kech = all.get("kech");
kech.pop = `${kech.population_2023.toLocaleString("en-US")} (2023 census rows of the units now in Kech)`;
const tump = all.get("tump");
tump.pop = `${tump.population_2023.toLocaleString("en-US")} (2023 census rows of Tump and Mand)`;

// Replace the free-text "pop" note with the PBS figure wherever a district-level PBS total exists.
for (const d of all.values()) {
  if (pbsBySlug.has(d.slug) && !SPLITS.some((sp) => sp.parts[d.slug])) {
    d.pop = `${d.population_2023.toLocaleString("en-US")} (2023 census${d.census_boundary_note ? ", pre-split boundaries" : ""})`;
  }
}

fs.writeFileSync(DATA, JSON.stringify(districts, null, 2) + "\n");
console.log(`PBS rows matched: ${pbsBySlug.size}; unmatched PBS rows: ${unmatched.join("; ") || "none"}`);
console.log(`Districts without a PBS district total: ${[...all.values()].filter((d) => d.population_2023 == null).map((d) => d.slug).join(", ")}`);
