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
const PROSE_OPEN = '<div class="container prose">';

function stripBlocks(html) {
  let out = html;
  let hadQuickAnswers = false;
  // Form 1: inserted right after the prose container opening tag as "\n    " + block.
  // Form 2: inserted before an anchor as block + "\n" + (the anchor's indentation).
  const form1 = (a, b) => new RegExp(`${PROSE_OPEN}\\n    ${a}[\\s\\S]*?${b}`, "g");
  const form2 = (a, b) => new RegExp(`${a}[\\s\\S]*?${b}\\n[ \\t]*`, "g");
  if (out.includes(QA_START)) hadQuickAnswers = true;
  out = out.replace(form1(QA_START, QA_END), PROSE_OPEN).replace(form2(QA_START, QA_END), "");
  out = out.replace(form2(REL_START, REL_END), "");
  // Legacy, unmarked generated blocks.
  out = out.replace(/\s*<section class="district-search-answers"[\s\S]*?<\/section>/g, () => { hadQuickAnswers = true; return ""; });
  out = out.replace(/\s*<section class="seo-related-reading"[\s\S]*?<\/section>/g, "");
  return { html: out, hadQuickAnswers };
}

function censusRows(d) {
  return L.unitsOf(d).map((u) => `<tr><th scope="row">${L.esc(u.name)}</th><td>${L.esc(L.unitWord[u.type] || u.type)}</td><td>${L.fmtInt(u.population_2023)}</td><td>${u.area_km2 != null ? L.fmtInt(u.area_km2) : ""}</td><td>${u.urban_proportion_2023 != null ? L.fmtNum(u.urban_proportion_2023, 2) + "%" : "–"}</td></tr>`).join("");
}

function quickAnswers(info, wrap) {
  const { district: d, provinceId, province } = info;
  const name = L.districtLabel(d);
  const rows = [];
  const add = (dt, dd) => { if (dd) rows.push(`<dt>${dt}</dt><dd>${dd}</dd>`); };
  const units = L.unitsOf(d);
  if (d.population_2023 != null) {
    const parts = [`${L.fmtInt(d.population_2023)} (2023 census)`];
    add("Population", parts.join(""));
    if (d.area_km2 != null) add("Area", `${L.fmtInt(d.area_km2)} km²${d.density_2023 != null ? ` · ${L.fmtNum(d.density_2023, 2)} people per km²` : ""}`);
    if (d.urban_proportion_2023 != null) add("Urban population", `${L.fmtNum(d.urban_proportion_2023, 2)}%`);
    if (d.growth_rate_2017_2023 != null) add("Annual growth 2017–2023", `${L.fmtNum(d.growth_rate_2017_2023, 2)}%`);
    if (d.avg_household_size_2023 != null) add("Average household size", L.fmtNum(d.avg_household_size_2023, 1));
  }
  if (d.census_2023_row) {
    const r = d.census_2023_row;
    const parent = L.districtIndex.get(r.parent)?.district;
    add("2023 census", `The census counted ${L.esc(r.name)} ${L.esc((L.unitWord[r.type] || r.type).toLowerCase())} under ${parent ? `<a href="${L.esc(r.parent)}.html">${L.esc(L.districtLabel(parent))}</a>` : L.esc(r.parent)}: ${L.fmtInt(r.population_2023)} people on ${L.fmtInt(r.area_km2)} km². No separate district total was published.`);
  }
  if (units.length && d.tehsil_count) {
    add(`${L.unitNoun(d, 2)[0].toUpperCase()}${L.unitNoun(d, 2).slice(1)}`, `${d.tehsil_count} – ${L.esc(L.listText(units.map((u) => u.name)))}`);
  } else if (units.length) {
    add("Census units (2023)", L.esc(units.map((u) => `${u.name} (${(L.unitWord[u.type] || u.type).toLowerCase()})`).join(", ")));
  }
  add("Headquarters", L.esc(L.cleanHq(d.hq)));
  add("Division", L.esc(d.division_2023 || ""));
  add("Province / territory", `<a href="${L.provinceRoutes[provinceId]}">${L.esc(province.name)}</a>`);
  add("Known for", L.esc(d.about || ""));
  add("Culture", L.esc(d.culture || ""));
  add("Education", L.esc(d.education || ""));
  add("Healthcare", L.esc(d.health || ""));
  add("Villages / local areas", L.esc(d.villages || ""));

  let table = "";
  if (units.length) {
    const tehsilPage = `tehsils-of-${d.slug}.html`;
    table = `
      <table class="census-table">
        <caption>${L.esc(name)}: 2023 census figures by ${L.esc(L.unitNoun(d, 1))}${L.unitType(d) === "mixed" ? " / sub-division" : ""}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col">Population</th><th scope="col">Area (km²)</th><th scope="col">Urban</th></tr></thead>
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
    : d.census_2023_row?.source_url
      ? `\n      <p class="meta">Source: <a href="${L.esc(d.census_2023_row.source_url)}" rel="noopener">Pakistan Bureau of Statistics, Census 2023, Table 1</a>.</p>`
      : "";
  const inner = `<h2 id="district-search-answers">${L.esc(name)}: Quick Answers</h2>
      <dl>
        ${rows.join("\n        ")}
      </dl>${table}${source}`;
  const body = wrap
    ? `<section class="district-search-answers" aria-labelledby="district-search-answers"><div class="container">
      ${inner}
    </div></section>`
    : `<section class="district-search-answers" aria-labelledby="district-search-answers">
      ${inner}
    </section>`;
  return `${QA_START}\n    ${body}\n    ${QA_END}`;
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
  const capital = { punjab: "lahore", sindh: "karachi-south", kpk: "peshawar", balochistan: "quetta", gb: "gilgit", ajk: "muzaffarabad" }[provinceId];
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
  const wantQa = isTemplate || stripped.hadQuickAnswers || d.population_2023 != null || L.unitsOf(d).length || d.census_2023_row;
  if (wantQa) {
    if (isTemplate) {
      const i = out.indexOf(proseOpen) + proseOpen.length;
      out = out.slice(0, i) + "\n    " + quickAnswers(info, false) + out.slice(i);
    } else {
      out = insertBefore(out, quickAnswers(info, true));
    }
  }
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
