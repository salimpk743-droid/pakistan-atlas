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
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
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

function provincePage(unit) {
  const route = provinceRoutes[unit.id];
  const list = L.sortedDistrictsOf(unit.id);
  const withCensus = list.filter((d) => d.population_2023 != null && !d.census_boundary_note);
  const count = L.districtCount(unit.id).count;
  const description = `${unit.name}: capital ${unit.capital}, 2023 census population and area, and its ${count} districts.`;
  return `${head(`${unit.name}, Pakistan`, description, route)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>${esc(unit.name)} <span class="urdu">${esc(unit.urdu)}</span></h1>
    <p>${esc(unit.intro || unit.culture)}</p>
  </div></div>
  <section><div class="container prose">
    <h2>${esc(unit.name)} facts</h2>
    <p><strong>Capital:</strong> ${esc(unit.capital)} · <strong>Population:</strong> ${fmtInt(unit.population_2023)} (2023 census) · <strong>Area:</strong> ${fmtInt(unit.area_km2)} km² · <strong>Districts:</strong> ${count}.</p>
    <p><a href="${hubRoutes[unit.id]}">Full list: districts of ${esc(unit.name)} →</a> · <a href="${L.PROVINCES_HUB}">All provinces and territories →</a></p>
    <div class="grid-2">
      <div><h3>Culture and geography</h3><p>${esc(unit.culture)}</p></div>
      <div><h3>Education and health</h3><p>${esc(unit.education_note)}</p><p>${esc(unit.health_note)}</p></div>
    </div>
    <h2>Districts of ${esc(unit.name)}</h2>
    <p>Every district page below has its headquarters, population and local information${withCensus.length ? "; population figures are from the Pakistan Bureau of Statistics 2023 census, Table 1" : ""}.</p>
    <div class="grid-3">${list.map((d) => districtCard(d, unit.id)).join("")}
    </div>
    ${countBox(unit.id)}${otherSection(unit.id)}
    <h2>Public issues</h2><p>${esc(unit.issues)}</p>
    <p class="meta"><strong>Sources:</strong> Pakistan Bureau of Statistics 2023 census and provincial or district sources noted on individual pages.</p>
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
    <p><a href="${provinceRoutes[unit.id]}">${esc(unit.name)} province guide →</a> · <a href="${L.DISTRICTS_HUB}">All districts of Pakistan →</a></p>
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
    <p>Pakistan has ${total} districts (${monthYear(L.districtCount("punjab").as_of)}): ${L.provinceOrder.map((pid) => `${L.shortProvince[pid]} ${L.districtCount(pid).count}`).join(", ")}. Grouped by province and territory; search by district, headquarters or province. Each province page lists the notifications behind its count.</p>
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

function provincesHub() {
  const cards = L.provinceOrder.map((pid) => {
    const u = L.provinceById[pid];
    const n = L.districtCount(pid).count;
    return `
      <article class="prose" style="margin-bottom:1.2rem" id="${u.id}">
        <h2><a href="${provinceRoutes[pid]}">${esc(u.name)}</a> <span class="urdu">${esc(u.urdu)}</span></h2>
        <p><span class="badge">${esc(u.type)}</span> Capital: <strong>${esc(u.capital)}</strong> · Area ${fmtInt(u.area_km2)} km² · Population ${fmtInt(u.population_2023)} (2023 census)</p>
        <div class="grid-2" style="margin-top:1rem">
          <div><h3>Culture</h3><p>${esc(u.culture)}</p></div>
          <div><h3>Public issues</h3><p>${esc(u.issues)}</p></div>
          <div><h3>Universities &amp; colleges</h3><p>${esc(u.education_note)}</p></div>
          <div><h3>Hospitals</h3><p>${esc(u.health_note)}</p></div>
        </div>
        <p class="meta"><a href="${hubRoutes[pid]}">All ${n} district${n === 1 ? "" : "s"} of ${esc(u.name)} →</a></p>
      </article>`;
  }).join("");
  return `${head("Provinces and Territories of Pakistan", "Pakistan's four provinces and three territories with capitals, 2023 census population and area.", L.PROVINCES_HUB)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Provinces &amp; territories of Pakistan</h1>
    <p>Four provinces, the federal capital territory and two further territories. Population and area follow the 2023 census.</p>
  </div></div>
  <section>
    <div class="container">${cards}
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
  const cards = units.map((u) => `
        <article class="card"><div class="card-body">
          <h2>${esc(u.name)} ${esc(L.unitWord[u.type] || u.type)}</h2>
          <p><strong>Population (2023):</strong> ${fmtInt(u.population_2023)}</p>
          ${u.area_km2 != null ? `<p><strong>Area:</strong> ${fmtInt(u.area_km2)} km²${u.density_2023 != null ? ` · ${L.fmtNum(u.density_2023, 2)} people per km²` : ""}</p>` : ""}
          <p><strong>Urban share:</strong> ${u.urban_proportion_2023 != null ? L.fmtNum(u.urban_proportion_2023, 2) + "%" : "no urban population recorded"}</p>
        </div></article>`).join("");
  const notes = [d.census_boundary_note, d.tehsil_count_source && !/PBS/.test(d.tehsil_count_source) ? `Current tehsil list: ${d.tehsil_count_source}.` : ""].filter(Boolean);
  const intro = d.tehsil_count
    ? `${name} has ${d.tehsil_count} ${L.unitNoun(d, d.tehsil_count)}: ${L.listText(units.map((u) => u.name))}.`
    : `The 2023 census lists ${units.length} administrative units in ${name}: ${L.listText(units.map((u) => `${u.name} (${(L.unitWord[u.type] || u.type).toLowerCase()})`))}.`;
  return `${head(`Tehsils of ${name}`, intro, route)}
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Tehsils of ${esc(name)}</h1>
    <p>${esc(d.division_2023 ? d.division_2023 + " · " : "")}${esc(province.name)} · 2023 census figures</p>
  </div></div>
  <section><div class="container prose">
    <h2>${esc(name)} administrative structure</h2>
    <p>${esc(intro)}${d.division_2023 ? ` The district is part of ${esc(d.division_2023)}.` : ""}</p>
    ${notes.map((n) => `<p class="meta">${esc(n)}</p>`).join("\n    ")}
    <div class="grid-3">${cards}
    </div>
    <h2>Related pages</h2>
    <p><a href="${esc(d.slug)}.html">${esc(name)}</a> · <a href="${hubRoutes[provinceId]}">Districts of ${esc(province.name)}</a> · <a href="${provinceRoutes[provinceId]}">${esc(province.name)}</a> · <a href="${L.DISTRICTS_HUB}">Districts of Pakistan</a></p>
    <section class="source-box"><h2>Source and date</h2><p>Population, area and urban share: <a href="${esc(d.population_source_url || "https://www.pbs.gov.pk/")}" rel="noopener">Pakistan Bureau of Statistics, Census 2023, Table 1</a>. Checked ${esc(d.last_verified || "")}. Administrative boundaries can change, so this page is dated.</p></section>
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

function upsertMetadata(fileName, html) {
  if (L.isVerificationFile(fileName)) return html;
  const canonical = SITE + "/" + (fileName === "index.html" ? "" : fileName);
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
