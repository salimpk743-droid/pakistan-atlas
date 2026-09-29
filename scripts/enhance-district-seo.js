// Adds exactly one "Quick Answers" block (with the PBS 2023 census table) and one related-links
// block to every district page. Idempotent: blocks are wrapped in <!-- mb:... --> markers and are
// replaced on every run, never appended. Legacy unmarked copies (up to 17 per page were found) are
// stripped first. Fields with no real data are omitted rather than filled with placeholders.
const fs = require("fs");
const path = require("path");
const L = require("./lib/site");

const QA_START = "<!-- mb:quick-answers:start -->";
const QA_END = "<!-- mb:quick-answers:end -->";
const REL_START = "<!-- mb:related:start -->";
const REL_END = "<!-- mb:related:end -->";
const FAQ_START = "<!-- mb:faq:start -->";
const FAQ_END = "<!-- mb:faq:end -->";
const SRC_START = "<!-- mb:sources:start -->";
const SRC_END = "<!-- mb:sources:end -->";
const PROSE_OPEN = '<div class="container prose">';
const UR_START = "<!-- mb:urdu:start -->";
const UR_END = "<!-- mb:urdu:end -->";

function stripBlocks(html) {
  let out = html;
  let hadQuickAnswers = false;
  // Form 1: inserted right after the prose container opening tag as "\n    " + block.
  // Form 2: inserted before an anchor as block + "\n" + (the anchor's indentation).
  const form1 = (a, b) => new RegExp(`${PROSE_OPEN}\\n    ${a}[\\s\\S]*?${b}`, "g");
  const form2 = (a, b) => new RegExp(`${a}[\\s\\S]*?${b}\\n[ \\t]*`, "g");
  if (out.includes(QA_START)) hadQuickAnswers = true;
  out = out.replace(form1(QA_START, QA_END), PROSE_OPEN).replace(form2(QA_START, QA_END), "");
  out = out.replace(form2(REL_START, REL_END), "").replace(form2(FAQ_START, FAQ_END), "").replace(form2(SRC_START, SRC_END), "").replace(form2(UR_START, UR_END), "");
  // Legacy, unmarked generated blocks.
  out = out.replace(/\s*<section class="district-search-answers"[\s\S]*?<\/section>/g, () => { hadQuickAnswers = true; return ""; });
  out = out.replace(/\s*<section class="seo-related-reading"[\s\S]*?<\/section>/g, "");
  return { html: out, hadQuickAnswers };
}

function censusRows(d) {
  return L.unitsOf(d).map((u) => `<tr><th scope="row">${L.esc(u.name)}</th><td>${L.esc(L.unitWord[u.type] || u.type)}</td><td>${L.fmtInt(u.population_2023)}</td><td>${u.area_km2 != null ? L.fmtInt(u.area_km2) : ""}</td><td>${u.urban_proportion_2023 != null ? L.fmtNum(u.urban_proportion_2023, 2) + "%" : "–"}</td><td>${u.literacy_2023 != null ? L.fmtNum(u.literacy_2023, 2) + "%" : "–"}</td></tr>`).join("");
}

function mainTongues(d) {
  const m = d.mother_tongue_2023;
  if (!m || !m.main.length) return "";
  return m.main.map((t) => `${L.esc(t.language)} ${L.fmtNum(t.pct, 2)}%`).join(" · ");
}
// Census-backed facts only; used for the answer-first lead sentence and the FAQ.
function facts(info) {
  const { district: d, province } = info;
  const name = L.districtLabel(d);
  const units = L.unitsOf(d);
  const hq = L.cleanHq(d.hq || "");
  const division = d.division || d.division_2023 || "";
  const noun = L.unitNoun(d, 2);
  const unitList = L.listText(units.map((u) => u.name));
  const q = L.popQualifier(d);
  return { d, name, units, hq, division, noun, unitList, q, province };
}
function lead(info) {
  const f = facts(info);
  const { d, name } = f;
  if (d.status || d.created || d.population_2023 == null) return "";
  const n = L.districtCount(info.provinceId).count;
  const where = `${L.esc(name)} is ${n === 1 ? "the only district" : `one of the ${n} districts`} of ${L.esc(f.province.name)}${f.division ? `, in ${L.esc(f.division)}` : ""}${f.hq ? `, with its headquarters at ${L.esc(f.hq)}` : ""}.`;
  const tehsils = d.tehsil_count && f.units.length
    ? ` It has ${d.tehsil_count} ${L.esc(f.noun)}: ${L.esc(f.unitList)}.`
    : f.units.length ? ` The 2023 census lists ${f.units.length} administrative units in it: ${L.esc(f.unitList)}.` : "";
  const lit = d.literacy_2023 ? `, and ${L.fmtNum(d.literacy_2023.total, 2)}% of residents aged 10 and over were literate` : "";
  const pop = ` The 2023 census counted ${L.fmtInt(d.population_2023)} people${f.q ? ` (${L.esc(f.q)})` : ""}${d.area_km2 != null ? ` on ${L.fmtInt(d.area_km2)} km²` : ""}${lit}.`;
  return where + tehsils + pop;
}
function faqBlock(info) {
  const f = facts(info);
  const { d, name } = f;
  const qa = [];
  const add = (q, a) => qa.push(`<h3>${L.esc(q)}</h3>\n      <p>${a}</p>`);
  // New, split or announced districts have no census row of their own: only their sourced faq_extra entries are used.
  if (d.status || d.created || d.population_2023 == null) {
    for (const x of d.faq_extra || []) add(x.q, `${L.esc(x.a)}${x.source ? ` (<a href="${L.esc(x.source.url)}" rel="noopener">${L.esc(x.source.publisher)}</a>)` : ""}`);
    return qa.length ? faqWrap(name, qa) : "";
  }
  const q = f.q ? ` (${L.esc(f.q)})` : "";
  if (d.tehsil_count && f.units.length) add(`How many ${f.noun} are in ${name}?`, `${L.esc(name)} has ${d.tehsil_count} ${L.esc(f.noun)}: ${L.esc(f.unitList)}.`);
  add(`What is the population of ${name}?`, `The 2023 census counted ${L.fmtInt(d.population_2023)} people in ${L.esc(name)}${q}${d.population_2017 ? `, up from ${L.fmtInt(d.population_2017)} in 2017` : ""}${d.growth_rate_2017_2023 != null ? ` (annual growth ${L.fmtNum(d.growth_rate_2017_2023, 2)}%)` : ""}.${d.urban_proportion_2023 != null ? ` ${L.fmtNum(d.urban_proportion_2023, 2)}% of the population lived in urban areas.` : ""}`);
  if (d.area_km2 != null) add(`What is the area of ${name}?`, `${L.esc(name)} covers ${L.fmtInt(d.area_km2)} km² according to the 2023 census${d.density_2023 != null ? `, a density of ${L.fmtNum(d.density_2023, 2)} people per km²` : ""}.`);
  const loc = d.urban_localities_2023;
  if (loc && loc.length) {
    const top = loc.slice(0, 10).map((x) => `${L.esc(x.name)} (${L.fmtInt(x.population_2023)}${x.type ? `, ${L.esc(x.type)}` : ""})`);
    add(`What are the main towns and cities in ${name}?`, `The 2023 census lists ${loc.length} urban ${loc.length === 1 ? "locality" : "localities"} in ${L.esc(name)}${loc.length > 10 ? "; the ten largest are" : ":"} ${L.listText(top)}.`);
  } else if (d.urban_proportion_2023 === 0) {
    add(`Is ${name} urban or rural?`, `Entirely rural: the 2023 census counted no urban population in ${L.esc(name)}, so all ${L.fmtInt(d.population_2023)} residents were enumerated in rural areas.`);
  }
  if (d.literacy_2023) {
    const l = d.literacy_2023;
    add(`What is the literacy rate of ${name}?`, `${L.fmtNum(l.total, 2)}% of people aged 10 and over were literate in the 2023 census${l.male != null ? ` (male ${L.fmtNum(l.male, 2)}%, female ${L.fmtNum(l.female, 2)}%)` : ""}${l.note ? `. ${L.esc(l.note)}` : "."}`);
  }
  if (d.mother_tongue_2023 && d.mother_tongue_2023.main.length) {
    const m = d.mother_tongue_2023.main;
    add(`Which languages are spoken in ${name}?`, `The most common mother tongue in the 2023 census was ${L.esc(m[0].language)} (${L.fmtNum(m[0].pct, 2)}% of the ${L.fmtInt(d.mother_tongue_2023.counted)} people in the mother-tongue table)${m.length > 1 ? `, followed by ${m.slice(1).map((t) => `${L.esc(t.language)} (${L.fmtNum(t.pct, 2)}%)`).join(", ")}` : ""}.`);
  }
  add(`Which province is ${name} in?`, `${L.esc(name)} is in ${L.esc(f.province.name)}${f.division ? `, in ${L.esc(f.division)}` : ""}${f.hq ? `. Its headquarters is ${L.esc(f.hq)}` : ""}.`);
  for (const x of d.faq_extra || []) add(x.q, `${L.esc(x.a)}${x.source ? ` (<a href="${L.esc(x.source.url)}" rel="noopener">${L.esc(x.source.publisher)}</a>)` : ""}`);
  return faqWrap(name, qa);
}
function faqWrap(name, qa) {
  return `${FAQ_START}
  <section class="district-faq" aria-labelledby="district-faq"><div class="container prose">
    <h2 id="district-faq">${L.esc(name)}: FAQ</h2>
      ${qa.join("\n      ")}
  </div></section>
  ${FAQ_END}`;
}
function sourcesBlock(info) {
  const { district: d } = info;
  const items = [];
  const push = (url, label) => { if (url && !items.some((x) => x[0] === url)) items.push([url, label]); };
  const t = d.census_tables_2023 || {};
  push(t.table1 || d.population_source_url || (d.census_2023_row || d.census_2023_rows)?.source_url, "Pakistan Bureau of Statistics, Census 2023, Table 1: area, population, density, urban share, household size and growth by district and tehsil");
  if (d.urban_localities_2023) push(t.table2, "Pakistan Bureau of Statistics, Census 2023, Table 2: urban localities by population size");
  push(t.table11, "Pakistan Bureau of Statistics, Census 2023, Table 11: population by mother tongue");
  push(t.table12, "Pakistan Bureau of Statistics, Census 2023, Table 12: literacy rate, enrolment and out-of-school population");
  for (const x of d.admin_sources || []) push(x.url, `${x.publisher}${x.title ? `: ${x.title}` : ""}${x.date ? ` (${x.date})` : ""}`);
  const m = (d.tehsil_count_source || d.administrative_source || "").match(/^(.*) \((https?:[^)]+)\)$/);
  if (m) push(m[2], m[1]);
  for (const x of d.sources || []) push(x.url, `${x.publisher}${x.title ? `: ${x.title}` : ""}${x.date ? ` (${x.date})` : ""}`);
  for (const x of (d.urdu && d.urdu.sources) || []) push(x.url, `${x.publisher}${x.title ? `: ${x.title}` : ""} (cited in the Urdu section)`);
  if (!items.length) return "";
  return `${SRC_START}
  <section class="district-sources" aria-labelledby="district-sources"><div class="container prose">
    <h2 id="district-sources">Sources</h2>
    <ol>
      ${items.map(([u, t]) => `<li><a href="${L.esc(u)}" rel="noopener">${L.esc(t)}</a></li>`).join("\n      ")}
    </ol>
    <p class="meta">Census figures checked against the PBS tables on ${L.esc(d.last_verified || "")}.</p>
  </div></section>
  ${SRC_END}`;
}
function quickAnswers(info, wrap) {
  const { district: d, provinceId, province } = info;
  const name = L.districtLabel(d);
  const rows = [];
  const add = (dt, dd) => { if (dd) rows.push(`<dt>${dt}</dt><dd>${dd}</dd>`); };
  const units = L.unitsOf(d);
  if (d.status_note) add("Status", L.esc(d.status_note));
  const successors = (d.successors || []).map((s) => L.districtIndex.get(s)?.district).filter(Boolean);
  if (successors.length) add("Now", successors.map((x) => `<a href="${x.slug}.html">${L.esc(L.districtLabel(x))}</a>`).join(" and "));
  if (d.created) {
    const parent = d.predecessor && L.districtIndex.get(d.predecessor)?.district;
    add("Created", `${L.esc(d.created)}${parent ? `, from <a href="${parent.slug}.html">${L.esc(L.districtLabel(parent))}</a>` : ""}`);
  }
  if (d.subdivisions) add("Sub-divisions (as notified)", L.esc(L.listText(d.subdivisions)));
  if (d.population_2023 != null) {
    const parts = [`${L.fmtInt(d.population_2023)} (2023 census)`];
    add("Population", parts.join(""));
    if (d.area_km2 != null) add("Area", `${L.fmtInt(d.area_km2)} km²${d.density_2023 != null ? ` · ${L.fmtNum(d.density_2023, 2)} people per km²` : ""}`);
    if (d.urban_proportion_2023 != null) add("Urban population", `${L.fmtNum(d.urban_proportion_2023, 2)}%`);
    if (d.growth_rate_2017_2023 != null) add("Annual growth 2017–2023", `${L.fmtNum(d.growth_rate_2017_2023, 2)}%`);
    if (d.avg_household_size_2023 != null) add("Average household size", L.fmtNum(d.avg_household_size_2023, 1));
    if (d.population_2017 != null) add("Population in 2017", L.fmtInt(d.population_2017));
    if (d.sex_ratio_2023 != null) add("Sex ratio", `${L.fmtNum(d.sex_ratio_2023, 2)} males per 100 females`);
    const lit = d.literacy_2023;
    if (lit) add("Literacy rate (age 10+)", `${L.fmtNum(lit.total, 2)}%${lit.male != null ? ` · male ${L.fmtNum(lit.male, 2)}% · female ${L.fmtNum(lit.female, 2)}%` : ""}`);
    const loc = d.urban_localities_2023;
    if (loc && loc.length) add("Largest urban localities (2023)", L.esc(loc.slice(0, 5).map((x) => `${x.name} ${L.fmtInt(x.population_2023)}`).join(" · ")));
    const tongues = mainTongues(d);
    if (tongues) add("Main mother tongues", tongues);
  }
  if (d.census_2023_row) {
    const r = d.census_2023_row;
    const parent = L.districtIndex.get(r.parent)?.district;
    add("2023 census", `The census counted ${L.esc(r.name)} ${L.esc((L.unitWord[r.type] || r.type).toLowerCase())} under ${parent ? `<a href="${L.esc(r.parent)}.html">${L.esc(L.districtLabel(parent))}</a>` : L.esc(r.parent)}: ${L.fmtInt(r.population_2023)} people on ${L.fmtInt(r.area_km2)} km². No separate district total was published.`);
  }
  if (d.census_2023_rows) {
    const r = d.census_2023_rows;
    const parent = L.districtIndex.get(r.parent)?.district;
    const list = r.units.map((u) => `${L.esc(u.name)} ${L.esc((L.unitWord[u.type] || u.type).toLowerCase())} ${L.fmtInt(u.population_2023)}`).join("; ");
    add("2023 census", `The census counted the units now in ${L.esc(d.name)} under ${parent ? `<a href="${L.esc(r.parent)}.html">${L.esc(L.districtLabel(parent))}</a>` : L.esc(r.parent)}: ${list}. Boundaries were redrawn in 2026 (and new sub-divisions created), so no district total is given.`);
  }
  if (units.length && d.tehsil_count) {
    add(`${L.unitNoun(d, 2)[0].toUpperCase()}${L.unitNoun(d, 2).slice(1)}`, `${d.tehsil_count} – ${L.esc(L.listText(units.map((u) => u.name)))}`);
  } else if (units.length) {
    add("Census units (2023)", L.esc(units.map((u) => `${u.name} (${(L.unitWord[u.type] || u.type).toLowerCase()})`).join(", ")));
  }
  add("Headquarters", L.esc(L.cleanHq(d.hq)));
  add("Division", L.esc(d.division || d.division_2023 || ""));
  add("Province / territory", `<a href="${L.provinceRoutes[provinceId]}">${L.esc(province.name)}</a>`);
  // For districts created or split in 2026 "about" is the administrative summary shown on the page itself.
  // Free-text profile rows are only shown once they have been checked against the sources listed on the page
  // (profile_checked); unchecked legacy text is kept in the data file for review but not published.
  if (d.profile_checked) {
    add("Known for", d.created || d.status ? "" : L.esc(d.about || ""));
    add("Culture", L.esc(d.culture || ""));
    add("Education", L.esc(d.education || ""));
    add("Healthcare", L.esc(d.health || ""));
    add("Villages / local areas", L.esc(d.villages || ""));
  }

  let table = "";
  if (units.length) {
    const tehsilPage = `tehsils-of-${d.slug}.html`;
    table = `
      <table class="census-table">
        <caption>${L.esc(name)}: 2023 census figures by ${L.esc(L.unitNoun(d, 1))}${L.unitType(d) === "mixed" ? " / sub-division" : ""}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Population</th><th scope="col">Area (km²)</th><th scope="col">Urban</th><th scope="col">Literacy (10+)</th></tr></thead>
        <tbody>${censusRows(d)}</tbody>
      </table>`;
    const notes = [];
    if (d.census_boundary_note) notes.push(L.esc(d.census_boundary_note));
    if (d.tehsil_count_source && !/PBS/.test(d.tehsil_count_source)) notes.push(`Current tehsils: ${L.esc(d.tehsil_count_source.replace(/ \(https?:[^)]+\)$/, ""))}.`);
    if (L.exists(tehsilPage)) notes.push(`<a href="${tehsilPage}">Tehsils of ${L.esc(name)} →</a>`);
    table += notes.length ? `\n      <p class="meta">${notes.join(" ")}</p>` : "";
  }
  const source = d.population_source_url
    ? `\n      <p class="meta">Source: <a href="${L.esc(d.population_source_url)}" rel="noopener">Pakistan Bureau of Statistics, Census 2023, Table 1</a>. Checked ${L.esc(d.last_verified || "")}.</p>`
    : (d.census_2023_row || d.census_2023_rows)?.source_url
      ? `\n      <p class="meta">Source: <a href="${L.esc((d.census_2023_row || d.census_2023_rows).source_url)}" rel="noopener">Pakistan Bureau of Statistics, Census 2023, Table 1</a>.</p>`
      : "";
  const admin = (d.admin_sources || []).map((x) => `<a href="${L.esc(x.url)}" rel="noopener">${L.esc(x.publisher)}${x.date ? `, ${L.esc(x.date)}` : ""}</a>`).join("; ");
  const adminLine = admin ? `\n      <p class="meta">Administrative status: ${admin}.</p>` : "";
  const leadText = lead(info);
  const inner = `<h2 id="district-search-answers">${L.esc(name)}: Quick Answers</h2>${leadText ? `
      <p class="lead-answer">${leadText}</p>` : ""}
      <dl>
        ${rows.join("\n        ")}
      </dl>${table}${source}${adminLine}`;
  const body = wrap
    ? `<section class="district-search-answers" aria-labelledby="district-search-answers"><div class="container">
      ${inner}
    </div></section>`
    : `<section class="district-search-answers" aria-labelledby="district-search-answers">
      ${inner}
    </section>`;
  return `${QA_START}\n    ${body}\n    ${QA_END}`;
}


// Urdu section for readers who do not read English. The census list is generated from the same PBS
// figures as the English Quick Answers, so the two can never disagree; the hand-written blocks in
// d.urdu.blocks carry only claims checked against the sources listed on the page (with inline links).
const UR_PROVINCE = { ict: "اسلام آباد وفاقی دارالحکومتی علاقہ", punjab: "صوبہ پنجاب", kpk: "صوبہ خیبر پختونخوا", sindh: "صوبہ سندھ", balochistan: "صوبہ بلوچستان", gb: "گلگت بلتستان", ajk: "آزاد جموں و کشمیر" };
const UR_LANG = { Pashto: "پشتو", Urdu: "اردو", Punjabi: "پنجابی", Sindhi: "سندھی", Balochi: "بلوچی", Saraiki: "سرائیکی", Brahui: "براہوی", Hindko: "ہندکو", Kohistani: "کوہستانی", Mewati: "میواتی", Shina: "شینا", Kalasha: "کالاشہ" };
const UR_UNIT = { tehsil: "تحصیلیں", taluka: "تعلقے", "sub-division": "سب ڈویژن", "sub-tehsil": "سب تحصیلیں" };
function urduSection(info) {
  const { district: d, provinceId } = info;
  const u = d.urdu;
  if (!u || !u.name) return "";
  const pct = (x) => `${L.fmtNum(x, 2)} فیصد`;
  const li = [];
  const units = L.unitsOf(d);
  if (d.population_2023 != null) {
    li.push(`<li><strong>آبادی:</strong> ${L.fmtInt(d.population_2023)}${d.population_2017 != null ? ` (2017 میں ${L.fmtInt(d.population_2017)})` : ""}</li>`);
    if (d.area_km2 != null) li.push(`<li><strong>رقبہ:</strong> ${L.fmtInt(d.area_km2)} مربع کلومیٹر${d.density_2023 != null ? `، فی مربع کلومیٹر ${L.fmtNum(d.density_2023, 2)} افراد` : ""}</li>`);
    if (d.urban_proportion_2023 != null) li.push(`<li><strong>شہری آبادی:</strong> ${pct(d.urban_proportion_2023)}</li>`);
    if (d.growth_rate_2017_2023 != null) li.push(`<li><strong>سالانہ شرح اضافہ (2017 تا 2023):</strong> ${pct(d.growth_rate_2017_2023)}</li>`);
    if (d.avg_household_size_2023 != null) li.push(`<li><strong>اوسط گھرانہ:</strong> ${L.fmtNum(d.avg_household_size_2023, 1)} افراد</li>`);
    const lit = d.literacy_2023;
    if (lit) li.push(`<li><strong>شرح خواندگی (10 سال اور زائد عمر):</strong> ${pct(lit.total)}${lit.male != null ? `؛ مرد ${pct(lit.male)}، خواتین ${pct(lit.female)}` : ""}</li>`);
    const m = d.mother_tongue_2023;
    if (m && m.main.length && m.main.every((t) => UR_LANG[t.language])) li.push(`<li><strong>مادری زبانیں:</strong> ${m.main.map((t) => `${UR_LANG[t.language]} ${pct(t.pct)}`).join("، ")}</li>`);
    if (units.length) {
      const word = d.tehsil_count ? UR_UNIT[L.unitType(d)] || "انتظامی اکائیاں" : "مردم شماری کی انتظامی اکائیاں";
      li.push(`<li><strong>${word}:</strong> ${d.tehsil_count || units.length}</li>`);
    }
  }
  const unitNames = u.units ? units.map((x) => u.units[x.name]) : [];
  const unitList = units.length && unitNames.every(Boolean) ? `
      <h3>${d.tehsil_count ? `${UR_UNIT[L.unitType(d)] || "انتظامی اکائیاں"} اور ان کی آبادی` : "انتظامی اکائیاں اور ان کی آبادی"} (2023)</h3>
      <ul>
        ${units.map((x, i) => `<li><strong>${unitNames[i]}:</strong> ${L.fmtInt(x.population_2023)}${x.literacy_2023 != null ? `؛ شرح خواندگی ${pct(x.literacy_2023)}` : ""}</li>`).join("\n        ")}
      </ul>` : "";
  const towns = u.towns ? (d.urban_localities_2023 || []).filter((x) => u.towns[x.name]).slice(0, 10) : [];
  const townList = towns.length ? `
      <h3>بڑے شہری مراکز (2023)</h3>
      <ul>
        ${towns.map((x) => `<li><strong>${u.towns[x.name]}:</strong> ${L.fmtInt(x.population_2023)}</li>`).join("\n        ")}
      </ul>` : "";
  const table1 = (d.census_tables_2023 || {}).table1 || d.population_source_url;
  const intro = `<p><strong>ضلع ${L.esc(u.name)}</strong> ${UR_PROVINCE[provinceId]} کا ایک ضلع ہے${u.hq ? ` جس کا صدر مقام ${L.esc(u.hq)} ہے` : ""}۔${u.division ? ` یہ ${L.esc(u.division)} میں شامل ہے۔` : ""}</p>`;
  const census = li.length ? `
      <h3>2023 کی مردم شماری کے اعداد و شمار</h3>
      <ul>
        ${li.join("\n        ")}
      </ul>${unitList}${townList}${u.census_note ? `
      <p class="meta">${u.census_note}</p>` : ""}${table1 ? `
      <p class="meta">ماخذ: <a href="${L.esc(table1)}" rel="noopener">پاکستان ادارۂ شماریات، ساتویں مردم شماری 2023</a> (جدول 1، 2، 11 اور 12)۔</p>` : ""}` : "";
  const blocks = (u.blocks || []).map((b) => `
      <h3>${b.h}</h3>${(b.p || []).map((p) => `
      <p>${p}</p>`).join("")}${b.ul ? `
      <ul>${b.ul.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}`).join("");
  return `${UR_START}
  <section class="district-urdu" lang="ur" dir="rtl" aria-labelledby="urdu-info"><div class="container prose">
    <h2 id="urdu-info">اردو میں معلومات: ضلع ${L.esc(u.name)}</h2>
      ${intro}${census}${blocks}
      <p class="meta">اس حصے کی ہر بات صفحے پر دیے گئے ذرائع سے جانچی گئی ہے${u.checked ? ` (آخری جانچ: ${L.esc(u.checked)})` : ""}۔</p>
  </div></section>
  ${UR_END}`;
}

function relatedLinks(info) {
  const { district: d, provinceId, province } = info;
  const links = [];
  const push = (href, label) => { if (L.exists(href.split("#")[0]) && !links.some((l) => l[0] === href)) links.push([href, label]); };
  push(L.provinceRoutes[provinceId], `${province.name} province guide`);
  push(L.hubRoutes[provinceId], `All districts of ${province.name}`);
  push(`tehsils-of-${d.slug}.html`, `Tehsils of ${L.districtLabel(d)}`);
  for (const [a, b] of L.relatedPairs) {
    const other = a === d.slug ? b : b === d.slug ? a : null;
    const o = other && L.districtIndex.get(other);
    if (o) push(`${other}.html`, L.districtLabel(o.district));
  }
  for (const href of L.extraRelated[d.slug] || []) push(href, href === "south-waziristan.html" ? "South Waziristan (before the 2022 split)" : href);
  const list = L.sortedDistrictsOf(provinceId).filter((x) => L.exists(`${x.slug}.html`));
  const i = list.findIndex((x) => x.slug === d.slug);
  const capital = { punjab: "lahore", sindh: "karachi-south", kpk: "peshawar", balochistan: "quetta-east", gb: "gilgit", ajk: "muzaffarabad" }[provinceId];
  const others = [];
  if (list.length > 1) {
    for (const off of [-2, -1, 1, 2]) {
      const x = list[(i + off + list.length) % list.length];
      if (x && x.slug !== d.slug && !others.includes(x)) others.push(x);
    }
    const cap = list.find((x) => x.slug === capital);
    if (cap && cap.slug !== d.slug && !others.includes(cap)) others.unshift(cap);
  }
  const more = others.map((x) => `<li><a href="${x.slug}.html">${L.esc(L.districtLabel(x))}</a></li>`).join("");
  return `${REL_START}
  <section class="seo-related-reading" aria-labelledby="related-reading"><div class="container">
    <h2 id="related-reading">Related pages</h2>
    <ul>
      ${links.map(([h, t]) => `<li><a href="${h}">${L.esc(t)}</a></li>`).join("\n      ")}
      <li><a href="${L.DISTRICTS_HUB}">All districts of Pakistan</a></li>
    </ul>${more ? `
    <h3>More districts of ${L.esc(province.name)}</h3>
    <ul>${more}</ul>` : ""}
  </div></section>
  ${REL_END}`;
}

function insertBefore(html, block) {
  const anchors = [/<div id="site-footer"/i, null, /<footer\b/i, /<\/body>/i];
  let idx = html.search(anchors[0]);
  if (idx < 0) { const m = html.lastIndexOf("</main>"); if (m >= 0) idx = m; }
  if (idx < 0) {
    const f = html.search(anchors[2]);
    const hdr = html.indexOf('id="site-header"');
    if (f >= 0 && f > hdr) idx = f;
  }
  if (idx < 0) idx = html.search(anchors[3]);
  const indent = html.slice(0, idx).match(/[ \t]*$/)[0];
  return html.slice(0, idx) + block + "\n" + indent + html.slice(idx);
}

function enhance(html, info, hasCensusUse) {
  const stripped = stripBlocks(html);
  let out = stripped.html;
  const proseOpen = PROSE_OPEN;
  const isTemplate = out.includes(proseOpen);
  const d = info.district;
  const wantQa = isTemplate || stripped.hadQuickAnswers || d.population_2023 != null || L.unitsOf(d).length || d.census_2023_row || d.census_2023_rows || d.status_note || d.created;
  if (wantQa) {
    if (isTemplate) {
      const i = out.indexOf(proseOpen) + proseOpen.length;
      out = out.slice(0, i) + "\n    " + quickAnswers(info, false) + out.slice(i);
    } else {
      out = insertBefore(out, quickAnswers(info, true));
    }
  }
  // A hand-written FAQ already on the page wins (only one FAQ, and FAQPage schema reads the first).
  const ur = urduSection(info);
  if (ur) out = insertBefore(out, ur);
  const handFaq = /<h2[^>]*>(?:(?!<\/h2>)[\s\S])*?(?:\bFAQ\b|Frequently Asked Questions)/.test(out);
  const faq = handFaq ? "" : faqBlock(info);
  if (faq) out = insertBefore(out, faq);
  const src = sourcesBlock(info);
  if (src) out = insertBefore(out, src);
  out = insertBefore(out, relatedLinks(info));
  return out;
}

let changed = 0;
let skipped = 0;
for (const [slug, info] of L.districtIndex) {
  const file = path.join(L.ROOT, `${slug}.html`);
  if (!fs.existsSync(file)) { skipped++; continue; }
  const original = fs.readFileSync(file, "utf8");
  const updated = enhance(original, info);
  if (updated !== original) { fs.writeFileSync(file, updated, "utf8"); changed++; }
}
console.log(`Quick Answers and related links refreshed on ${changed} district pages (unchanged: ${L.districtIndex.size - changed - skipped}, missing files: ${skipped}).`);
