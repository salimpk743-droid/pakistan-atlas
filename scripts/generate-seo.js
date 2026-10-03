// Regenerates the data-driven pages (province pages, district hubs, the all-districts and
// all-provinces hubs, tehsil pages and any missing district page) from data/*.json, and applies
// baseline head metadata to every HTML page. Titles, descriptions, Open Graph, JSON-LD, the static
// header/footer and breadcrumbs are then written by scripts/build-site.js.
// Deterministic: running it twice produces identical files.
const fs = require("fs");
const path = require("path");
const L = require("./lib/site");

const { ROOT, SITE, provinceRoutes, hubRoutes, esc, fmtInt, ADSENSE_SCRIPT, ADSENSE_META } = L;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />`;

function head(title, description, route, extra = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${ADSENSE_SCRIPT}
  ${ADSENSE_META}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#01411c" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${SITE}/${route}" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  ${FONTS}
  <link rel="stylesheet" href="css/style.css?v=7" />${extra}
</head>`;
}
function tail(extraScript = "") {
  return `  <div id="site-footer"></div>
  <script src="js/app.js"></script>${extraScript}
</body>
</html>
`;
}
function censusLine(d) {
  if (d.population_2023 == null) return "";
  const q = L.popQualifier(d);
  return `${fmtInt(d.population_2023)} (2023 census${q ? `, ${q.replace(" boundaries", "")}` : ""})`;
}
function districtCard(d, pid) {
  const hq = L.cleanHq(d.hq);
  const pop = censusLine(d);
  const units = L.unitsOf(d);
  return `
        <article class="card">
          <div class="card-body">
            ${hq ? `<span class="badge">${esc(hq)}</span>` : ""}
            <h3><a href="${esc(d.slug)}.html">${esc(L.districtLabel(d))}</a></h3>
            ${pop ? `<p><strong>Population:</strong> ${esc(pop)}</p>` : ""}
            ${d.tehsil_count ? `<p><strong>${d.tehsil_count} ${esc(L.unitNoun(d, d.tehsil_count))}:</strong> ${esc(L.listText(units.map((u) => u.name)))}</p>` : ""}
            ${d.about && (d.profile_checked || d.created || d.status) ? `<p>${esc(d.about)}</p>` : ""}
          </div>
        </article>`;
}

function monthYear(iso) {
  const [y, m] = String(iso || "").split("-");
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return m ? `${months[Number(m) - 1]} ${y}` : y || "";
}
function sourceLinks(list) {
  return list.map((x) => `<a href="${esc(x.url)}" rel="noopener">${esc(x.publisher)}${x.date ? `, ${esc(x.date)}` : ""}</a>`).join("; ");
}
// "Balochistan has 41 districts (September 2026)" line with the basis and sources for that count.
function countBox(pid) {
  const c = L.districtCount(pid);
  const unit = L.provinceById[pid];
  return `<section class="source-box" aria-labelledby="${pid}-count">
      <h2 id="${pid}-count">How many districts does ${esc(unit.name)} have?</h2>
      <p><strong>${c.count} district${c.count === 1 ? "" : "s"}</strong>${c.divisions ? ` in ${c.divisions} divisions` : ""}, as of ${esc(monthYear(c.as_of))}. ${esc(c.basis)}</p>${c.note ? `
      <p class="meta">${esc(c.note)}</p>` : ""}
      <p class="meta">Sources: ${sourceLinks(c.sources)}.</p>
    </section>`;
}
function otherCard(d) {
  const succ = (d.successors || []).map((s) => L.districtIndex.get(s)?.district).filter(Boolean);
  return `
        <article class="card">
          <div class="card-body">
            <span class="badge">${esc(L.statusLabel(d))}</span>
            <h3><a href="${esc(d.slug)}.html">${esc(L.districtLabel(d))}</a></h3>
            ${succ.length ? `<p>Now ${succ.map((x) => `<a href="${esc(x.slug)}.html">${esc(L.districtLabel(x))}</a>`).join(" and ")}.</p>` : ""}
            ${d.status_note ? `<p>${esc(d.status_note)}</p>` : ""}
          </div>
        </article>`;
}
function otherSection(pid) {
  const others = L.otherDistrictsOf(pid);
  if (!others.length) return "";
  return `
    <h2>Former and announced districts</h2>
    <p>These pages are kept for reference and are not included in the count above.</p>
    <div class="grid-3">${others.map(otherCard).join("")}
    </div>`;
}

// Shared blocks for the sourced province and tehsil pages (data/provinces.json: lead, stats, about_html, faq,
// sources, urdu_blocks; every figure and claim there is tied to a source listed on the page).
function faqSection(id, title, items) {
  if (!items.length) return "";
  return `
    <section aria-labelledby="${id}">
      <h2 id="${id}">${esc(title)}: FAQ</h2>
      ${items.map((x) => `<h3>${esc(x.q)}</h3>
      <p>${x.html || esc(x.a)}${x.source ? ` (<a href="${esc(x.source.url)}" rel="noopener">${esc(x.source.publisher)}</a>)` : ""}</p>`).join("\n      ")}
    </section>`;
}
function sourcesSection(list, checked) {
  const seen = new Set();
  const items = list.filter((x) => x && x.url && !seen.has(x.url) && seen.add(x.url));
  if (!items.length) return "";
  return `
    <section class="source-box" aria-labelledby="page-sources">
      <h2 id="page-sources">Sources</h2>
      <ol>
        ${items.map((x) => `<li><a href="${esc(x.url)}" rel="noopener">${esc(x.publisher)}${x.title ? `: ${esc(x.title)}` : ""}${x.date ? ` (${esc(x.date)})` : ""}</a></li>`).join("\n        ")}
      </ol>${checked ? `
      <p class="meta">Checked ${esc(checked)}. Administrative boundaries and counts can change, so this page is dated.</p>` : ""}
    </section>`;
}
function urduSection(title, blocks, checked) {
  if (!blocks || !blocks.length) return "";
  return `
    <section class="district-urdu" lang="ur" dir="rtl" aria-labelledby="urdu-info">
      <h2 id="urdu-info">اردو میں معلومات: ${esc(title)}</h2>${blocks.map((b) => `
      <h3>${esc(b.h)}</h3>${(b.p || []).map((x) => `
      <p>${x}</p>`).join("")}${b.ul ? `
      <ul>${b.ul.map((x) => `<li>${x}</li>`).join("")}</ul>` : ""}`).join("")}
      <p class="meta">اس حصے کی ہر بات صفحے پر دیے گئے ذرائع سے جانچی گئی ہے${checked ? ` (آخری جانچ: ${esc(checked)})` : ""}۔</p>
    </section>`;
}
function popText(unit) {
  return unit.population_2023 != null ? `${fmtInt(unit.population_2023)} (${unit.pop_label || "2023 census"})` : unit.population_2017 != null ? `${fmtInt(unit.population_2017)} (2017 census)` : "";
}
// Rankings built from the PBS district rows already on each district page (current districts with their own census row).
function districtRankings(unit) {
  const list = L.sortedDistrictsOf(unit.id).filter((d) => d.population_2023 != null && !L.popQualifier(d) && !d.census_boundary_note);
  if (list.length < 3) return "";
  const link = (d, v) => `<a href="${esc(d.slug)}.html">${esc(L.districtLabel(d))}</a> (${v})`;
  const top = (arr, f, k = 3) => [...arr].sort((x, y) => f(y) - f(x)).slice(0, k);
  const pop = top(list, (d) => d.population_2023).map((d) => link(d, fmtInt(d.population_2023)));
  const area = top(list.filter((d) => d.area_km2 != null), (d) => d.area_km2).map((d) => link(d, `${fmtInt(d.area_km2)} km²`));
  const lit = list.filter((d) => d.literacy_2023 && d.literacy_2023.total != null);
  const hi = top(lit, (d) => d.literacy_2023.total, 1)[0];
  const lo = top(lit, (d) => -d.literacy_2023.total, 1)[0];
  return `
    <h2>Largest districts of ${esc(unit.name)}</h2>
    <p>Among the ${list.length} current districts with their own 2023 census row, the most populous are ${L.listText(pop)}. The largest by area are ${L.listText(area)}.${hi && lo ? ` Literacy ranges from ${L.fmtNum(lo.literacy_2023.total, 2)}% in <a href="${esc(lo.slug)}.html">${esc(L.districtLabel(lo))}</a> to ${L.fmtNum(hi.literacy_2023.total, 2)}% in <a href="${esc(hi.slug)}.html">${esc(L.districtLabel(hi))}</a>.` : ""} Figures are from the Pakistan Bureau of Statistics 2023 census, Tables 1 and 12; districts split after the census are left out of this comparison.</p>`;
}

function provincePage(unit) {
  const route = provinceRoutes[unit.id];
  const list = L.sortedDistrictsOf(unit.id);
  const c = L.districtCount(unit.id);
  const count = c.count;
  const description = unit.lead;
  const faq = [...(unit.faq || []),
    { q: `How many districts does ${unit.name} have?`, a: `${count} district${count === 1 ? "" : "s"}${c.divisions ? ` in ${c.divisions} divisions` : ""}, as of ${monthYear(c.as_of)}.`, source: c.sources[0] ? { url: c.sources[0].url, publisher: c.sources[0].publisher } : null }];
  return `${head(`${unit.name}, Pakistan`, description, route)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>${esc(unit.name)} <span class="urdu">${esc(unit.urdu)}</span></h1>
    <p>${esc(unit.lead)}</p>
  </div></div>
  <section><div class="container prose">
    <h2>${esc(unit.name)} at a glance</h2>
    <table class="census-table">
      <caption>${esc(unit.name)}: key figures</caption>
      <tbody>
        ${unit.capital ? `<tr><th scope="row">${unit.id === "ajk" ? "Seat of administration" : "Capital"}</th><td>${esc(unit.capital)}</td></tr>\n        ` : ""}${(unit.stats || []).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("\n        ")}
        <tr><th scope="row">Districts</th><td>${count}${c.divisions ? ` in ${c.divisions} divisions` : ""} (${esc(monthYear(c.as_of))})</td></tr>
      </tbody>
    </table>
    <p class="meta">Source: ${sourceLinks((unit.sources || []).slice(0, 1))}.</p>
    <h2>About ${esc(unit.name)}</h2>
    ${(unit.about_html || []).map((x) => `<p>${x}</p>`).join("\n    ")}
    ${unit.culture ? `<h2>Culture and Geography of ${esc(unit.name)}</h2>
    <p>${esc(unit.culture)}</p>` : ""}${unit.education_note || unit.health_note ? `
    <h2>Education and Health in ${esc(unit.name)}</h2>
    ${unit.education_note ? `<p>${esc(unit.education_note)}</p>` : ""}${unit.health_note ? `<p>${esc(unit.health_note)}</p>` : ""}` : ""}${unit.issues ? `
    <h2>Public Issues in ${esc(unit.name)}</h2>
    <p>${esc(unit.issues)}</p>` : ""}${unit.sample_places && unit.sample_places.length ? `
    <h2>Notable Places in ${esc(unit.name)}</h2>
    <p>${(Array.isArray(unit.sample_places) ? unit.sample_places : [unit.sample_places]).map(esc).join(", ")}</p>` : ""}
    <p><a href="${hubRoutes[unit.id]}">Full list: districts of ${esc(unit.name)} →</a> · <a href="${L.PROVINCES_HUB}">All provinces and territories →</a></p>${districtRankings(unit)}
    <h2>Districts of ${esc(unit.name)}</h2>
    <div class="grid-3">${list.map((d) => districtCard(d, unit.id)).join("")}
    </div>
    ${countBox(unit.id)}${otherSection(unit.id)}${faqSection("province-faq", unit.name, faq)}${urduSection(unit.urdu, unit.urdu_blocks, unit.checked)}${sourcesSection([...(unit.sources || []), ...c.sources], unit.checked)}
  </div></section>
${tail()}`;
}

function provinceHub(unit) {
  const route = hubRoutes[unit.id];
  const list = L.sortedDistrictsOf(unit.id);
  const c = L.districtCount(unit.id);
  const intro = `${unit.name} has ${c.count} district${c.count === 1 ? "" : "s"} (${monthYear(c.as_of)}). An alphabetical list with headquarters, 2023 census population and tehsils where the census publishes them.`;
  return `${head(`Districts of ${unit.name}`, intro, route)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Districts of ${esc(unit.name)}</h1>
    <p>${esc(intro)}</p>
  </div></div>
  <main class="container prose">
    <p><a href="${provinceRoutes[unit.id]}">${esc(unit.name)} province guide →</a> · <a href="${L.DISTRICTS_HUB}">All districts of Pakistan →</a>${OLD_HUBS[unit.id] ? ` · <a href="${OLD_HUBS[unit.id]}">Original ${esc(unit.name)} districts page →</a>` : ""}</p>
    <h2>${esc(unit.name)} districts, A–Z</h2>
    <div class="grid-3">${list.map((d) => districtCard(d, unit.id)).join("")}
    </div>
    ${countBox(unit.id)}${otherSection(unit.id)}
    <section>
      <h2>Sources and editorial method</h2>
      <p>Population, area and tehsil figures are taken from the Pakistan Bureau of Statistics 2023 census, Table 1. Districts created after the census are marked, and no figure is shown where no official number exists.</p>
    </section>
  </main>
${tail()}`;
}

function districtsHub() {
  const sections = L.provinceOrder.map((pid) => {
    const unit = L.provinceById[pid];
    const list = L.sortedDistrictsOf(pid);
    return `
      <section class="district-group" aria-labelledby="${pid}-heading">
        <h2 id="${pid}-heading"><a href="${hubRoutes[pid]}">${esc(unit.name)} districts</a> <span class="meta">(${L.districtCount(pid).count})</span></h2>
        <div class="district-results">${list.map((d) => {
          const hq = L.cleanHq(d.hq);
          const hay = `${d.name} ${d.hq || ""} ${unit.name} ${unit.short || ""}`.toLowerCase();
          return `
          <a class="district-result" href="${esc(d.slug)}.html" data-hay="${esc(hay)}"><strong>${esc(d.name)}</strong><span>${esc(unit.name)}${hq ? ` · HQ ${esc(hq)}` : ""}${d.population_2023 != null && !L.popQualifier(d) ? ` · ${fmtInt(d.population_2023)} (2023)` : ""}</span></a>`;
        }).join("")}
        </div>
      </section>`;
  }).join("");
  const others = L.provinceOrder.flatMap((pid) => L.otherDistrictsOf(pid).map((d) => [pid, d]));
  const otherGroup = others.length ? `
      <section class="district-group" aria-labelledby="other-heading">
        <h2 id="other-heading">Former and announced districts <span class="meta">(not counted)</span></h2>
        <div class="district-results">${others.map(([pid, d]) => {
          const unit = L.provinceById[pid];
          const hay = `${d.name} ${d.hq || ""} ${unit.name} ${unit.short || ""}`.toLowerCase();
          return `
          <a class="district-result" data-other="1" href="${esc(d.slug)}.html" data-hay="${esc(hay)}"><strong>${esc(d.name)}</strong><span>${esc(unit.name)} · ${esc(L.statusLabel(d))}</span></a>`;
        }).join("")}
        </div>
      </section>` : "";
  const total = L.totalDistricts();
  const script = `
  <script>
    (function () {
      var input = document.getElementById("q");
      var count = document.getElementById("count");
      var links = Array.prototype.slice.call(document.querySelectorAll(".district-result"));
      var groups = Array.prototype.slice.call(document.querySelectorAll(".district-group"));
      function apply(q) {
        q = (q || "").trim().toLowerCase();
        var shown = 0;
        links.forEach(function (a) { var hit = !q || a.getAttribute("data-hay").indexOf(q) !== -1; a.hidden = !hit; if (hit && !a.hasAttribute("data-other")) shown++; });
        groups.forEach(function (g) { g.hidden = !g.querySelector(".district-result:not([hidden])"); });
        count.textContent = shown ? shown + " district" + (shown === 1 ? "" : "s") : "No districts match that search.";
      }
      var start = new URLSearchParams(location.search).get("q") || "";
      if (start) input.value = start;
      apply(start);
      input.addEventListener("input", function () { apply(input.value); });
    })();
  </script>`;
  return `${head("Districts of Pakistan", `All ${total} districts of Pakistan by province and territory, with headquarters and 2023 census population.`, L.DISTRICTS_HUB)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Districts of Pakistan</h1>
    <p>Pakistan has ${total} districts (${monthYear(L.districtCount("punjab").as_of)}): ${L.provinceOrder.map((pid) => `${L.shortProvince[pid]} ${L.districtCount(pid).count}`).join(", ")}. Grouped by province and territory; search by district, headquarters or province. Each province page lists the notifications behind its count. See also the <a href="districts-of-pakistan.html">original Districts of Pakistan page</a>.</p>
  </div></div>
  <section>
    <div class="container">
      <div class="search">
        <label class="visually-hidden" for="q">Search districts</label>
        <input id="q" type="search" placeholder="Try Lahore, Swat, Gwadar, Peshawar…" autocomplete="off" enterkeyhint="search" />
      </div>
      <p class="search-count" id="count">${total} districts</p>${sections}${otherGroup}
    </div>
  </section>
${tail(script)}`;
}

// Original hub pages restored from the owner's site; linked from the generated hubs.
const OLD_HUBS = { punjab: "districts-punjab.html", sindh: "districts-sindh.html", kpk: "districts-khyber-pakhtunkhwa.html", balochistan: "districts-balochistan.html", ict: "districts-islamabad-capital-territory.html", ajk: "districts-azad-kashmir.html", gb: "districts-gilgit-baltistan.html" };
function provincesHub() {
  const cards = L.provinceOrder.map((pid) => {
    const u = L.provinceById[pid];
    const n = L.districtCount(pid).count;
    return `
      <article class="prose" style="margin-bottom:1.2rem" id="${u.id}">
        <h2><a href="${provinceRoutes[pid]}">${esc(u.name)}</a> <span class="urdu">${esc(u.urdu)}</span></h2>
        <p><span class="badge">${esc(u.type)}</span>${u.capital ? ` Capital: <strong>${esc(u.capital)}</strong> ·` : ""} Area ${fmtInt(u.area_km2)} km² · Population ${popText(u)}</p>
        <p>${esc(u.lead || "")}</p>${u.culture ? `
        <h3>Culture</h3><p>${esc(u.culture)}</p>` : ""}${u.issues ? `
        <h3>Public issues</h3><p>${esc(u.issues)}</p>` : ""}${u.education_note ? `
        <h3>Universities &amp; colleges</h3><p>${esc(u.education_note)}</p>` : ""}
        <p class="meta"><a href="${hubRoutes[pid]}">All ${n} district${n === 1 ? "" : "s"} of ${esc(u.name)} →</a></p>
      </article>`;
  }).join("");
  return `${head("Provinces and Territories of Pakistan", "Pakistan's four provinces and three territories with capitals, 2023 census population and area.", L.PROVINCES_HUB)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Provinces &amp; territories of Pakistan</h1>
    <p>Four provinces, the federal capital territory and two further territories. Population and area follow the 2023 census (PBS; for Gilgit-Baltistan as published by its Planning &amp; Development Department) and, for Azad Kashmir, the 2017 census published by the AJ&amp;K Bureau of Statistics. See also the <a href="provinces-of-pakistan.html">original Provinces of Pakistan page</a>.</p>
  </div></div>
  <section>
    <div class="container">${cards}${sourcesSection(L.provinceOrder.flatMap((pid) => (L.provinceById[pid].sources || []).slice(0, 1)), "2026-09-30")}
    </div>
  </section>
${tail()}`;
}

// Tehsil pages are kept for the ten districts that already had one.
const TEHSIL_PAGES = ["lahore", "faisalabad", "rawalpindi", "multan", "gujranwala", "sialkot", "bahawalpur", "peshawar", "swat", "quetta"];
function tehsilPage(info) {
  const { district: d, provinceId, province } = info;
  const route = `tehsils-of-${d.slug}.html`;
  const units = L.unitsOf(d);
  const name = L.districtLabel(d);
  const word = (u) => L.unitWord[u.type] || u.type;
  const cards = units.map((u) => `
        <article class="card"><div class="card-body">
          <h2>${esc(u.name)} ${esc(word(u))}</h2>
          <p><strong>Population (2023):</strong> ${fmtInt(u.population_2023)}</p>
          ${u.area_km2 != null ? `<p><strong>Area:</strong> ${fmtInt(u.area_km2)} km²${u.density_2023 != null ? ` · ${L.fmtNum(u.density_2023, 2)} people per km²` : ""}</p>` : ""}
          <p><strong>Urban share:</strong> ${u.urban_proportion_2023 ? L.fmtNum(u.urban_proportion_2023, 2) + "%" : "no urban population recorded"}</p>
          ${u.literacy_2023 != null ? `<p><strong>Literacy (age 10+):</strong> ${L.fmtNum(u.literacy_2023, 2)}%</p>` : ""}
        </div></article>`).join("");
  const notes = [d.census_boundary_note, d.tehsil_count_source && !/PBS/.test(d.tehsil_count_source) ? `Current tehsil list: ${d.tehsil_count_source.replace(/ \(https?:[^)]+\)$/, "")}.` : ""].filter(Boolean);
  const listNames = L.listText(units.map((u) => u.name));
  const intro = d.tehsil_count
    ? `${name} has ${d.tehsil_count} ${L.unitNoun(d, d.tehsil_count)}: ${listNames}.`
    : `The 2023 census lists ${units.length} administrative units in ${name}: ${L.listText(units.map((u) => `${u.name} (${word(u).toLowerCase()})`))}.`;
  const by = (f) => [...units].sort((x, y) => f(y) - f(x));
  const big = by((u) => u.population_2023)[0], small = by((u) => -u.population_2023)[0];
  const wide = by((u) => u.area_km2 || 0)[0];
  const lit = units.filter((u) => u.literacy_2023 != null);
  const hi = [...lit].sort((x, y) => y.literacy_2023 - x.literacy_2023)[0], lo = [...lit].sort((x, y) => x.literacy_2023 - y.literacy_2023)[0];
  const urb = by((u) => u.urban_proportion_2023 || 0)[0];
  const lead = `${intro} ${big.name} is the most populous, with ${fmtInt(big.population_2023)} people in the 2023 census, and ${wide.name} is the largest by area (${fmtInt(wide.area_km2)} km²).`;
  const compare = `${big.name} ${word(big).toLowerCase()} has the most people (${fmtInt(big.population_2023)}) and ${small.name} the fewest (${fmtInt(small.population_2023)}). ${wide.name} covers the largest area (${fmtInt(wide.area_km2)} km²).${units.every((u) => u.urban_proportion_2023 === 100) ? " All of them were counted as fully urban." : urb.urban_proportion_2023 && units.filter((u) => u.urban_proportion_2023 === urb.urban_proportion_2023).length === 1 ? ` ${urb.name} is the most urban (${L.fmtNum(urb.urban_proportion_2023, 2)}% of residents in urban areas).` : ""}${hi && lo && hi !== lo ? ` Literacy among people aged 10 and over ranges from ${L.fmtNum(lo.literacy_2023, 2)}% in ${lo.name} to ${L.fmtNum(hi.literacy_2023, 2)}% in ${hi.name}.` : ""}`;
  const t = d.census_tables_2023 || {};
  const t1 = t.table1 || d.population_source_url;
  const pbs = (u) => ({ url: u, publisher: "Pakistan Bureau of Statistics" });
  const faq = [
    { q: `How many tehsils are in ${name}?`, a: d.tehsil_count ? `${d.tehsil_count}: ${listNames}.` : `The 2023 census lists ${units.length} administrative units: ${listNames}.${d.census_boundary_note ? ` ${d.census_boundary_note}` : ""}`, source: pbs(t1) },
    { q: `Which is the largest tehsil of ${name} by population?`, a: `${big.name}, with ${fmtInt(big.population_2023)} people in the 2023 census.`, source: pbs(t1) },
    { q: `Which is the largest tehsil of ${name} by area?`, a: `${wide.name}, at ${fmtInt(wide.area_km2)} km².`, source: pbs(t1) },
    ...(hi ? [{ q: `Which tehsil of ${name} has the highest literacy rate?`, a: `${hi.name}, where ${L.fmtNum(hi.literacy_2023, 2)}% of people aged 10 and over were literate in the 2023 census.`, source: pbs(t.table12 || t1) }] : [])
  ];
  const UR_NAMES = { lahore: "لاہور", faisalabad: "فیصل آباد", rawalpindi: "راولپنڈی", multan: "ملتان", gujranwala: "گوجرانوالہ", sialkot: "سیالکوٹ", bahawalpur: "بہاولپور", peshawar: "پشاور", swat: "سوات", quetta: "کوئٹہ" };
  const ur = (d.urdu && d.urdu.name) || UR_NAMES[d.slug];
  const urBlocks = ur ? [{ h: `ضلع ${esc(ur)} کی انتظامی اکائیاں`, p: [`2023 کی مردم شماری میں ضلع ${esc(ur)} کی ${units.length} انتظامی اکائیاں درج ہیں۔ سب سے زیادہ آبادی <span lang="en" dir="ltr">${esc(big.name)}</span> کی ہے (${fmtInt(big.population_2023)} افراد) (<a href="${esc(t1)}" rel="noopener">پاکستان ادارۂ شماریات</a>)۔`],
    ul: units.map((u) => `<span lang="en" dir="ltr">${esc(u.name)}</span>: آبادی ${fmtInt(u.population_2023)}${u.literacy_2023 != null ? `؛ شرح خواندگی ${L.fmtNum(u.literacy_2023, 2)} فیصد` : ""}`) }] : [];
  const sources = [
    { url: t1, publisher: "Pakistan Bureau of Statistics", title: "Census 2023, Table 1: area, population, density and urban share by tehsil" },
    t.table12 ? { url: t.table12, publisher: "Pakistan Bureau of Statistics", title: "Census 2023, Table 12: literacy by tehsil" } : null,
    ...(d.admin_sources || [])
  ];
  const m = (d.tehsil_count_source || "").match(/^(.*) \((https?:[^)]+)\)$/);
  if (m) sources.push({ url: m[2], publisher: m[1] });
  return `${head(`Tehsils of ${name}`, intro, route)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Tehsils of ${esc(name)}</h1>
    <p>${esc(lead)}</p>
  </div></div>
  <section><div class="container prose">
    <h2>${esc(name)} administrative structure</h2>
    <p>${esc(province.name)}${d.division_2023 ? `, ${esc(d.division_2023)} at the 2023 census` : ""}. Each card gives the 2023 census population, area, urban share and literacy of one ${esc(L.unitNoun(d, 1))}.</p>
    ${notes.map((n) => `<p class="meta">${esc(n)}</p>`).join("\n    ")}
    <div class="grid-3">${cards}
    </div>
    <h2>How the ${esc(L.unitNoun(d, 2))} compare</h2>
    <p>${esc(compare)}</p>${faqSection("tehsil-faq", `Tehsils of ${name}`, faq)}${urduSection(`ضلع ${ur || ""}`, urBlocks, d.last_verified)}
    <h2>Related pages</h2>
    ${(d.tehsils_2023 || []).length ? `<h2>Major Towns and Localities by Tehsil in ${esc(name)}</h2>
    <ul>${d.tehsils_2023.map((t) => `<li><strong>${esc(t.name)}</strong> — major town / locality: ${esc(t.major_towns || "")}</li>`).join("")}</ul>` : ""}
    <p><a href="${esc(d.slug)}.html">${esc(name)}</a> · <a href="${hubRoutes[provinceId]}">Districts of ${esc(province.name)}</a> · <a href="${provinceRoutes[provinceId]}">${esc(province.name)}</a> · <a href="${L.DISTRICTS_HUB}">Districts of Pakistan</a></p>${sourcesSection(sources, d.last_verified)}
  </div></section>
${tail()}`;
}

// Template for a district page that does not exist yet. Only sourced facts from data/districts.json are
// used; the Quick Answers block (census rows, HQ, division) is added by enhance-district-seo.js.
function districtPage(info) {
  const { district: d, province } = info;
  const description = `${L.districtLabel(d)}, ${province.name}.`;
  const parent = d.predecessor && L.districtIndex.get(d.predecessor)?.district;
  const division = d.division || d.division_2023 || "";
  const sources = (d.admin_sources || []).map((x) => `<li><a href="${esc(x.url)}" rel="noopener">${esc(x.title)}</a> – ${esc(x.publisher)}${x.date ? `, ${esc(x.date)}` : ""}</li>`).join("\n      ");
  return `${head(L.districtLabel(d), description, `${d.slug}.html`)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>${esc(L.districtLabel(d))}</h1>
    <p>${division ? `${esc(division)} · ` : ""}${esc(province.name)}</p>
  </div></div>
  <section><div class="container prose">
    ${d.about ? `<p>${esc(d.about)}</p>` : ""}
    ${d.created || parent ? `<h2>How the district was created</h2>
    <p>${d.created ? `${/^(Created|Renamed)/.test(d.created) ? "" : "Created by the "}${esc(d.created)}.` : ""}${parent ? ` It was formed from <a href="${esc(parent.slug)}.html">${esc(L.districtLabel(parent))}</a>.` : ""}</p>` : ""}
    ${d.issues ? `<h2>Public issues</h2><p>${esc(d.issues)}</p>` : ""}
    ${sources ? `<h2>Sources</h2>
    <ul>
      ${sources}
    </ul>` : ""}
  </div></section>
${tail()}`;
}

// Near-identical restored pages stay live but point rel=canonical at the main page (data/canonical.json).
const CANONICAL_OVERRIDES = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "canonical.json"), "utf8")).pages;
function upsertMetadata(fileName, html) {
  if (L.isVerificationFile(fileName)) return html;
  const canonical = SITE + "/" + (CANONICAL_OVERRIDES[fileName] || (fileName === "index.html" ? "" : fileName));
  let result = html;

  // AdSense tags are written by build-site.js (setAdsense).

  const robots = L.isNoindex(fileName) ? "noindex,follow" : "index,follow,max-image-preview:large";
  const robotsTag = `<meta name="robots" content="${robots}" />`;
  if (/<meta\s+name="robots"[^>]*>/i.test(result)) {
    result = result.replace(/<meta\s+name="robots"[^>]*>/i, robotsTag);
  } else if (/<meta\s+name="description"[^>]*>/i.test(result)) {
    result = result.replace(/<meta\s+name="description"[^>]*>/i, "$&\n  " + robotsTag);
  } else {
    result = result.replace(/<title>[^<]*<\/title>/i, "$&\n  " + robotsTag);
  }

  const canonicalTag = '<link rel="canonical" href="' + canonical + '" />';
  if (/<link\s+rel="canonical"/i.test(result)) {
    result = result.replace(/<link\s+rel="canonical"[^>]*>/i, canonicalTag);
  } else if (/<meta\s+name="robots"[^>]*>/i.test(result)) {
    result = result.replace(/<meta\s+name="robots"[^>]*>/i, "$&\n  " + canonicalTag);
  }

  result = result.replace(/province\.html\?id=(ict|punjab|kpk|sindh|balochistan|gb|ajk)/g, (_, id) => provinceRoutes[id]);
  return result;
}

// Generated pages are later decorated by build-site.js (head block, header, footer). Compare against that
// finished form so an up-to-date page is not rewritten on every run (keeps each step idempotent).
const { build, normaliseDates } = require("./build-site");
function write(file, content) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return fs.writeFileSync(full, content);
  const current = fs.readFileSync(full, "utf8");
  if (current === content) return;
  if (normaliseDates(build(file, content).out) === normaliseDates(current)) return;
  fs.writeFileSync(full, content);
}

let created = 0;
for (const [slug, info] of L.districtIndex) {
  if (!L.exists(`${slug}.html`)) { write(`${slug}.html`, districtPage(info)); created++; }
}
for (const unit of L.provinces.units) {
  write(provinceRoutes[unit.id], provincePage(unit));
  write(hubRoutes[unit.id], provinceHub(unit));
}
write(L.DISTRICTS_HUB, districtsHub());
write(L.PROVINCES_HUB, provincesHub());
for (const slug of TEHSIL_PAGES) {
  const info = L.districtIndex.get(slug);
  if (info && L.unitsOf(info.district).length) write(`tehsils-of-${slug}.html`, tehsilPage(info));
}
for (const fileName of L.htmlFiles()) {
  const filePath = path.join(ROOT, fileName);
  const original = fs.readFileSync(filePath, "utf8");
  const updated = upsertMetadata(fileName, original);
  if (updated !== original) fs.writeFileSync(filePath, updated);
}
console.log(`Generated ${L.provinces.units.length} province pages, ${L.provinces.units.length + 2} hubs, ${TEHSIL_PAGES.length} tehsil pages; created ${created} missing district pages.`);
