#!/usr/bin/env node
// Adds a managed "2023 Census in detail" block (PBS tables 1, 2, 12) to selected thin district pages.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const J = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const cfg = J("data/census-detail-pages.json");
const t1 = J("data/sources/pbs-2023-table1-districts.json");
const so = J("data/sources/pbs-2023-social-districts.json");
const ur = J("data/sources/pbs-2023-table2-urban-localities.json");
const PDF = { punjab: "punjab", kp: "kp", balochistan: "balochistan", sindh: "sindh" };
const n = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US"));
const f = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const tc = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Mc|Tc|Mcorp|Cb|Ma)\b/g, (m) => m.toUpperCase());
const S = "<!-- mb:census-detail:start -->", E_ = "<!-- mb:census-detail:end -->";
function social(p, name) {
  const l = so[p].literacy, i = l.findIndex((x) => x.name === name);
  if (i < 0) return null;
  const units = [];
  for (let k = i + 1; k < l.length && !/DISTRICT$/.test(l[k].name); k++) units.push(l[k]);
  return { d: l[i], units };
}
for (const [slug, [p, name, socName]] of Object.entries(cfg.pages)) {
  const file = path.join(root, slug + ".html");
  let html = fs.readFileSync(file, "utf8");
  const d = t1[p].find((x) => x.name === name);
  if (!d) { console.warn("no table1:", slug); continue; }
  const sc = social(p, socName || name);
  const loc = ur[p][name] || [];
  const disp = tc(name.replace(/ DISTRICT$/, ""));
  const ch = d.population_2023 - d.population_2017;
  const base = `https://www.pbs.gov.pk/wp-content/uploads/census_tables/tables/table_`;
  let h = `${S}\n<section class="mb-census-detail" id="census-2023-detail">\n<h2>${disp} District: 2023 Census in Detail</h2>\n`;
  h += `<p>The 7th Population and Housing Census (2023) by the Pakistan Bureau of Statistics (PBS) counted <strong>${n(d.population_2023)}</strong> people in ${disp} District — ${n(d.male)} males and ${n(d.female)} females (sex ratio ${f(d.sex_ratio)} males per 100 females). The 2017 census had counted ${n(d.population_2017)}, so the district ${ch >= 0 ? "gained" : "lost"} ${n(Math.abs(ch))} people in six years (difference calculated from the two PBS totals), an average annual growth rate of ${f(d.growth)}%. The district covers ${n(d.area_km2)} km², giving a density of ${f(d.density)} people per km²; ${f(d.urban_pct)}% of residents live in urban areas and the average household has ${f(d.hh_size, 1)} members.</p>\n`;
  if (d.units && d.units.length) {
    h += `<h3>Population change by tehsil, 2017–2023</h3>\n<div class="table-wrap"><table>\n<thead><tr><th>Tehsil / area</th><th>2017</th><th>2023</th><th>Annual growth %</th><th>Area km²</th><th>Density /km²</th><th>Sex ratio</th><th>Household size</th></tr></thead>\n<tbody>\n`;
    for (const u of d.units) h += `<tr><td>${tc(u.name)}</td><td>${n(u.population_2017)}</td><td>${n(u.population_2023)}</td><td>${f(u.growth)}</td><td>${n(u.area_km2)}</td><td>${f(u.density)}</td><td>${f(u.sex_ratio)}</td><td>${f(u.hh_size, 1)}</td></tr>\n`;
    h += `</tbody></table></div>\n`;
  }
  if (sc) {
    const s = sc.d;
    h += `<h3>Literacy and out-of-school children</h3>\n<p>PBS reports a literacy rate (age 10+) of ${f(s.literacy_pct)}% for ${socName ? tc(socName) : disp + " District"}: ${f(s.literacy_male_pct)}% for males and ${f(s.literacy_female_pct)}% for females, ${f(s.literacy_urban_pct)}% in urban areas against ${f(s.literacy_rural_pct)}% in rural areas. Of ${n(s.population_10plus)} residents aged 10 and over, ${n(s.literate_10plus)} were literate. The census also counted ${n(s.out_of_school_5_16)} children aged 5–16 who were out of school (${n(s.out_of_school_5_16_male)} boys and ${n(s.out_of_school_5_16_female)} girls).</p>\n`;
    if (sc.units.length) {
      h += `<div class="table-wrap"><table>\n<thead><tr><th>Tehsil / area</th><th>Literacy %</th><th>Male %</th><th>Female %</th><th>Urban %</th><th>Rural %</th><th>Out-of-school (5–16)</th></tr></thead>\n<tbody>\n`;
      for (const u of sc.units) h += `<tr><td>${tc(u.name)}</td><td>${f(u.literacy_pct)}</td><td>${f(u.literacy_male_pct)}</td><td>${f(u.literacy_female_pct)}</td><td>${f(u.literacy_urban_pct)}</td><td>${f(u.literacy_rural_pct)}</td><td>${n(u.out_of_school_5_16)}</td></tr>\n`;
      h += `</tbody></table></div>\n`;
    }
  }
  if (loc.length) {
    h += `<h3>All urban localities (${loc.length})</h3>\n<p>PBS Table 2 lists ${loc.length} urban localities in the district (MC = municipal committee, TC = town committee):</p>\n<ul>\n`;
    for (const l of [...loc].sort((a, b) => b.population_2023 - a.population_2023)) h += `<li>${tc(l.name)} (${tc(l.tehsil)}): ${n(l.population_2023)}</li>\n`;
    h += `</ul>\n`;
  }
  h += `<p class="mb-check"><small>Source: Pakistan Bureau of Statistics, Census 2023 — <a href="${base}1_${PDF[p]}_districts.pdf" target="_blank" rel="noopener">Table 1</a>, <a href="${base}2_${PDF[p]}_districts.pdf" target="_blank" rel="noopener">Table 2</a>, <a href="${base}12_${PDF[p]}_districts.pdf" target="_blank" rel="noopener">Table 12</a>. Figures checked against the PBS tables on ${cfg.checked}.</small></p>\n</section>\n${E_}`;
  const re = new RegExp(`${S}[\\s\\S]*?${E_}`);
  if (re.test(html)) html = html.replace(re, h);
  else if (html.includes("<!-- mb:faq:start -->")) html = html.replace("<!-- mb:faq:start -->", h + "\n<!-- mb:faq:start -->");
  else { console.warn("no anchor:", slug); continue; }
  fs.writeFileSync(file, html);
}
