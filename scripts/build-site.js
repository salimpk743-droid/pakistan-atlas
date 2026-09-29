// Final build step for every HTML page (run after generate-seo.js and enhance-district-seo.js):
//  - strips stray markdown fences and rewrites links that point at redirected URLs
//  - writes <title>, meta description, Open Graph / Twitter tags and one JSON-LD @graph
//    (WebSite, WebPage/CollectionPage, BreadcrumbList, AdministrativeArea, ItemList, FAQPage)
//  - renders the header/nav, breadcrumbs and footer as static HTML (js/app.js no longer needs to)
// Every managed block sits between <!-- mb:... --> markers and is replaced in place on each run,
// so running this twice yields no diff. Verification files are never touched.
const fs = require("fs");
const path = require("path");
const L = require("./lib/site");

const { SITE, esc, fmtInt, provinceRoutes, hubRoutes } = L;
const HEAD_START = "<!-- mb:head:start -->";
const HEAD_END = "<!-- mb:head:end -->";
const HDR_START = "<!-- mb:header:start -->";
const HDR_END = "<!-- mb:header:end -->";
const FTR_START = "<!-- mb:footer:start -->";
const FTR_END = "<!-- mb:footer:end -->";
const MANAGED_TYPES = new Set(["BreadcrumbList", "AdministrativeArea", "Place", "City", "WebPage", "CollectionPage", "WebSite", "ItemList", "FAQPage"]);
const LEGACY_LINKS = {
  "bajur.html": "bajaur.html", "dgkhan.html": "dera-ghazi-khan.html", "dikhan.html": "dera-ismail-khan.html",
  "rykhan.html": "rahim-yar-khan.html", "nankana.html": "nankana-sahib.html", "tts.html": "toba-tek-singh.html",
  "lakki.html": "lakki-marwat.html", "nwa.html": "north-waziristan.html", "lower-chitral.html": "chitral-lower.html",
  "upper-chitral.html": "chitral-upper.html", "mandi-bahauddin.html": "mbdin.html",
  "districts-of-pakistan.html": "districts.html", "provinces-of-pakistan.html": "provinces.html",
  "current-affairs.html": "literature.html", "politics.html": "geography.html"
};
for (const p of ["azad-kashmir", "balochistan", "gilgit-baltistan", "islamabad-capital-territory", "khyber-pakhtunkhwa", "punjab", "sindh"]) {
  LEGACY_LINKS[`districts-${p}.html`] = `districts-of-${p}.html`;
}
const NAV = [["/", "Home"], ["provinces.html", "Provinces"], ["districts.html", "Districts"], ["culture.html", "Culture"],
  ["literature.html", "Literature"], ["geography.html", "Geography"], ["sports.html", "Sports"], ["history.html", "History"],
  ["showbiz.html", "Showbiz"], ["about.html", "About"]];
const provinceByRoute = Object.fromEntries(Object.entries(provinceRoutes).map(([id, r]) => [r, id]));
const provinceByHub = Object.fromEntries(Object.entries(hubRoutes).map(([id, r]) => [r, id]));
const pbsSource = JSON.parse(fs.readFileSync(path.join(L.ROOT, "data", "sources", "pbs-2023-table1-districts.json"), "utf8"));

// ---------- helpers ----------
function url(file) { return file === "index.html" ? `${SITE}/` : `${SITE}/${file}`; }
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
function firstFit(cands, max) { return cands.find((c) => c && c.length <= max) || cands.filter(Boolean).sort((a, b) => a.length - b.length)[0]; }
// Pick the longest candidate within [min, max]; otherwise the longest under max; otherwise trim.
function fitDescription(cands, min = 140, max = 160) {
  if (cands.some(Array.isArray)) {
    const tiers = cands.map((c) => (Array.isArray(c) ? c : [c]));
    for (const tier of tiers) {
      const hit = tier.filter((c) => c && c.length >= min && c.length <= max).sort((a, b) => b.length - a.length)[0];
      if (hit) return hit;
    }
    cands = tiers.flat();
  }
  const ok = cands.filter((c) => c && c.length <= max);
  const inRange = ok.filter((c) => c.length >= min).sort((a, b) => b.length - a.length);
  if (inRange.length) return inRange[0];
  if (ok.length) return ok.sort((a, b) => b.length - a.length)[0];
  const c = cands.filter(Boolean)[0] || "";
  const cut = c.slice(0, max - 1);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:–-]$/, "") + "…";
}
function pad(desc, extras, min = 140, max = 160) {
  let out = desc;
  if (out.length >= min) return out;
  const fits = extras.filter((e) => (out + e).length <= max).sort((a, b) => b.length - a.length);
  return fits.length ? out + fits[0] : out;
}
function textOf(html) { return L.decodeEntities(L.stripTags(html)); }
function getTitle(html) { const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i); return m ? L.decodeEntities(m[1].trim().replace(/\s+/g, " ")) : ""; }
function getDescription(html) { const m = html.match(/<meta\s+name=["']description["']\s+content=(["'])([\s\S]*?)\1[^>]*>/i); return m ? L.decodeEntities(m[2]).trim() : ""; }
function getMeta(html, prop) {
  const re = new RegExp(`<meta\\s+(?:property|name)=["']${prop.replace(":", "\\:")}["']\\s+content=(["'])([\\s\\S]*?)\\1[^>]*>`, "i");
  const m = html.match(re); return m ? m[2] : "";
}
function h1Text(html) { const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i); return m ? textOf(m[1].replace(/<(span|small)[^>]*>[\s\S]*?<\/\1>/gi, "")) : ""; }

// ---------- page classification & metadata ----------
function classify(file) {
  if (file === "index.html") return { type: "home" };
  if (L.NOINDEX_PAGES.has(file)) return { type: "utility" };
  const slug = file.replace(/\.html$/, "");
  if (L.districtIndex.has(slug)) return { type: "district", info: L.districtIndex.get(slug) };
  if (provinceByRoute[file]) return { type: "province", pid: provinceByRoute[file] };
  if (provinceByHub[file]) return { type: "hub", pid: provinceByHub[file] };
  if (file === L.DISTRICTS_HUB) return { type: "districts" };
  if (file === L.PROVINCES_HUB) return { type: "provinces" };
  const t = slug.match(/^tehsils-of-(.+)$/);
  if (t && L.districtIndex.has(t[1])) return { type: "tehsils", info: L.districtIndex.get(t[1]) };
  if (file === "south-waziristan.html") return { type: "place-extra", pid: "kpk" };
  return { type: "other" };
}

function districtMeta({ district: d, provinceId: pid, province }) {
  const label = L.districtLabel(d);
  const n = d.tehsil_count;
  const units = L.unitsOf(d);
  const Noun = n ? cap(L.unitNoun(d, n)) : "";
  const provShort = L.shortProvince[pid];
  let title;
  if (pid === "ict") {
    title = "Islamabad District (ICT): Population, Area & Guide (2023)";
  } else if (n >= 2) {
    title = firstFit([`${label}: ${n} ${Noun}, Population & Area (2023)`, `${label}: ${n} ${Noun}, Population & Area`, `${d.name}: ${n} ${Noun}, Population & Area`], 60);
  } else if (d.population_2023 != null) {
    title = firstFit([`${label}: Tehsils, Population & Area (2023)`, `${label}: Tehsils, Population & Area`, `${d.name}: Tehsils, Population & Area`], 60);
  } else if (pid === "gb" || pid === "ajk") {
    title = firstFit([`${label}, ${province.name}: Guide, History & Places`, `${label}, ${provShort}: Guide, History & Places`, `${label}, ${provShort}: Guide & Places`, `${d.name}, ${provShort}: Guide & Places`], 60);
  } else {
    title = firstFit([`${label}, ${province.name}: Guide & Facts`, `${label}, ${provShort}: Guide & Facts`], 60);
  }
  const where = `${label}, ${province.name}`;
  const hq = L.cleanHq(d.hq);
  const cands = [];
  const preSplit = d.census_boundary_note && !/Swat/.test(d.name) ? " (pre-split boundaries)" : "";
  const popPart = d.population_2023 != null
    ? ` 2023 census population ${fmtInt(d.population_2023)}${d.area_km2 != null ? `, area ${fmtInt(d.area_km2)} km²` : ""}${preSplit}.`
    : "";
  const popShort = d.population_2023 != null ? ` 2023 census population ${fmtInt(d.population_2023)}${preSplit}.` : "";
  const hqPart = hq ? ` Headquarters: ${hq}.` : "";
  if (pid === "ict") {
    const u = L.provinceById.ict;
    cands.push(`Islamabad Capital Territory: the federal capital district. 2023 census population ${fmtInt(u.population_2023)}, area ${fmtInt(u.area_km2)} km². Universities, hospitals, history and places.`);
  } else if (n >= 1) {
    const names = units.map((u) => u.name);
    const wheres = [where, `${label} (${provShort})`, label];
    // Tiers: prefer the full tehsil list; shorten the location label before shortening the list.
    for (let k = names.length; k >= 0; k--) {
      const tier = [];
      const list = k === names.length ? L.listText(names) : k > 0 ? L.listText(names, k) : "";
      for (const w of wheres) {
        const head = `${w} has ${n} ${L.unitNoun(d, n)}${list ? `: ${list}` : ""}.`;
        tier.push(head + popPart + hqPart, head + popPart, head + popShort + hqPart, head + popShort);
      }
      cands.push(tier);
    }
  } else if (units.length) {
    const names = units.map((u) => u.name);
    const kind = L.unitType(d) === "mixed" ? "tehsils and sub-divisions" : L.unitNoun(d, 2);
    const wheres = [where, `${label} (${provShort})`, label];
    for (let k = names.length; k >= 2; k--) {
      const tier = [];
      const list = k === names.length ? L.listText(names) : L.listText(names, k);
      for (const w of wheres) {
        const head = `${w}: the 2023 census counted ${units.length} ${kind} – ${list}.`;
        tier.push(head + popPart + hqPart, head + popPart, head + popShort + hqPart, head + popShort);
      }
      cands.push(tier);
    }
  } else if (d.census_2023_row) {
    const r = d.census_2023_row;
    const parent = L.districtIndex.get(r.parent)?.district;
    cands.push(`${where}: new district. In the 2023 census, ${r.name} ${(L.unitWord[r.type] || r.type).toLowerCase()} of ${parent ? L.districtLabel(parent) : r.parent} had ${fmtInt(r.population_2023)} people.${hqPart}`);
  }
  const about = String(d.about || "").trim();
  if (about) {
    for (const lead of [`${where}: ${about}`, `${label}: ${about}`]) {
      cands.push(lead + hqPart, lead);
    }
  }
  let description = fitDescription(cands);
  description = pad(description, [" Facts, places and sources.", " With sources.", " Facts and sources."]);
  return { title, description };
}

function provinceMeta(pid) {
  const u = L.provinceById[pid];
  const n = L.districtsOf(pid).length;
  const title = pid === "ict" ? "Islamabad Capital Territory: Population & Area (2023)"
    : firstFit([`${u.name}: Districts, Population & Area (2023)`, `${u.name}: Districts, Population & Area`], 60);
  const description = fitDescription([
    `${u.name}, Pakistan: capital ${u.capital}, 2023 census population ${fmtInt(u.population_2023)} and area ${fmtInt(u.area_km2)} km². Profiles of ${n} district${n === 1 ? "" : "s"}, culture and services.`,
    `${u.name}: capital ${u.capital}, 2023 census population ${fmtInt(u.population_2023)}, area ${fmtInt(u.area_km2)} km². Profiles of ${n} district${n === 1 ? "" : "s"}, culture and services.`,
    `${u.name}: capital ${u.capital}, population ${fmtInt(u.population_2023)} (2023), area ${fmtInt(u.area_km2)} km², ${n} district profile${n === 1 ? "" : "s"}.`
  ]);
  return { title, description };
}

function hubMeta(pid) {
  const u = L.provinceById[pid];
  const list = L.sortedDistrictsOf(pid);
  const title = firstFit([`Districts of ${u.name}: List with Population (2023)`, `Districts of ${u.name}: Full List (2023)`, `Districts of ${u.name}: List (2023)`], 60);
  const names = list.map((d) => d.name);
  const cands = [];
  for (let k = Math.min(names.length, 8); k >= 1; k--) {
    cands.push(`A–Z list of ${list.length} district page${list.length === 1 ? "" : "s"} for ${u.name}: ${names.slice(0, k).join(", ")}${k < names.length ? " and more" : ""}, with HQ, 2023 census population and tehsils.`);
  }
  return { title, description: pad(fitDescription(cands), [" Sources: PBS 2023."]) };
}

function tehsilMeta({ district: d, provinceId: pid, province }) {
  const label = L.districtLabel(d);
  const n = d.tehsil_count;
  const units = L.unitsOf(d);
  let title;
  if (d.slug === "swat") title = "Tehsils of Swat District: 4 Tehsils After 2026 Split";
  else if (n >= 2) title = firstFit([`Tehsils of ${label}: List of ${n} ${cap(L.unitNoun(d, n))} (2023)`, `Tehsils of ${label}: ${n} ${cap(L.unitNoun(d, n))} (2023)`], 60);
  else if (L.unitType(d) === "mixed") title = firstFit([`Tehsils of ${label}: Sub-divisions List (2023)`, `Tehsils of ${label} (2023)`], 60);
  else title = firstFit([`Tehsils of ${label}: Full List (2023 Census)`, `Tehsils of ${label} (2023)`], 60);
  const names = units.map((u) => u.name);
  const cands = [];
  for (let k = names.length; k >= 2; k--) {
    const list = L.listText(names, k);
    const lead = n ? `${label}, ${province.name} has ${n} ${L.unitNoun(d, n)}: ${list}.` : `${label}, ${province.name}: 2023 census units ${list}.`;
    cands.push(`${lead} 2023 census population and area of each from PBS Table 1.`, `${lead} Population and area of each (PBS 2023).`, lead);
  }
  return { title, description: pad(fitDescription(cands), [" With sources."]) };
}

function southWaziristanMeta() {
  const r = pbsSource.kp.find((x) => x.name === "SOUTH WAZIRISTAN DISTRICT");
  return {
    title: "South Waziristan: Upper & Lower Districts, Population 2023",
    description: fitDescription([
      `South Waziristan was split into Upper and Lower districts in April 2022. The 2023 census counted ${fmtInt(r.population_2023)} people on ${fmtInt(r.area_km2)} km² in its ${r.units.length} tehsils.`,
      `South Waziristan was split into Upper and Lower districts in 2022. 2023 census: ${fmtInt(r.population_2023)} people, ${fmtInt(r.area_km2)} km², ${r.units.length} tehsils.`
    ])
  };
}

function otherMeta(html, file) {
  let title = getTitle(html);
  if (file === "index.html") title = "MyBook.Pk: Provinces, Districts & Tehsils of Pakistan";
  if (title.length > 60) title = title.replace(/\s+[|—–-]\s+MyBook\.Pk$/i, "");
  return { title, description: getDescription(html) };
}

// ---------- breadcrumbs ----------
function crumbsFor(file, cls, title, html) {
  const home = ["/", "Home"];
  switch (cls.type) {
    case "home": case "utility": return [];
    case "district": {
      const { district: d, provinceId: pid, province } = cls.info;
      return [home, [provinceRoutes[pid], province.name], [file, L.districtLabel(d)]];
    }
    case "tehsils": {
      const { district: d, provinceId: pid, province } = cls.info;
      return [home, [provinceRoutes[pid], province.name], [`${d.slug}.html`, L.districtLabel(d)], [file, "Tehsils"]];
    }
    case "province": return [home, [L.PROVINCES_HUB, "Provinces"], [file, L.provinceById[cls.pid].name]];
    case "hub": return [home, [L.DISTRICTS_HUB, "Districts"], [file, `Districts of ${L.provinceById[cls.pid].name}`]];
    case "districts": return [home, [file, "Districts"]];
    case "provinces": return [home, [file, "Provinces"]];
    case "place-extra": return [home, [provinceRoutes[cls.pid], L.provinceById[cls.pid].name], [file, "South Waziristan"]];
    default: {
      let name = h1Text(html);
      if (!name || name.length > 60) name = title.split(/\s+[|—–:]\s+/)[0];
      return [home, [file, name.slice(0, 80)]];
    }
  }
}
function activeNav(cls, file) {
  if (["province", "provinces"].includes(cls.type)) return "provinces.html";
  if (["district", "tehsils", "hub", "districts", "place-extra"].includes(cls.type)) return "districts.html";
  if (cls.type === "home") return "/";
  return file;
}

// ---------- static chrome ----------
function headerHtml(active, crumbs, current) {
  const nav = NAV.map(([href, label]) => `<li><a${href === active ? ` class="active"${href === current ? ' aria-current="page"' : ""}` : ""} href="${href}">${label}</a></li>`).join("");
  const bc = crumbs.length ? `
      <nav class="mb-breadcrumbs" aria-label="Breadcrumb"><ol class="container">${crumbs.map(([href, name], i) => i === crumbs.length - 1
        ? `<li aria-current="page">${esc(name)}</li>`
        : `<li><a href="${href}">${esc(name)}</a></li>`).join("")}</ol></nav>` : "";
  return `${HDR_START}
      <div class="topbar">
        <div class="container">
          <span>پاکستان کے ہر کونے کی مستند معلومات</span>
          <span>Census baseline: PBS 2023 · Educational project</span>
        </div>
      </div>
      <header class="site">
        <div class="container nav-wrap">
          <a class="logo" href="/">
            <div class="logo-mark">★</div>
            <div>MyBook.Pk<small>Every province · every district</small></div>
          </a>
          <button class="menu-btn" id="menuBtn" type="button" aria-label="Open menu" aria-controls="mainNav" aria-expanded="false">☰</button>
          <nav id="mainNav" aria-label="Main">
            <ul>${nav}<li><a class="nav-search" href="districts.html" aria-label="Search districts"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16.2 16.2 L20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a></li></ul>
          </nav>
        </div>
      </header>${bc}
      ${HDR_END}`;
}
function footerHtml() {
  const provLinks = L.provinceOrder.map((pid) => `<a href="${provinceRoutes[pid]}">${esc(L.provinceById[pid].name)}</a>`).join("<br>");
  return `${FTR_START}
      <footer>
        <div class="container foot-grid">
          <div>
            <strong>MyBook.Pk</strong>
            <p>A student-friendly guide to Pakistan’s provinces, districts, culture, literature, geography, sports and history. Figures follow public sources and should be checked against the Pakistan Bureau of Statistics.</p>
          </div>
          <div>
            <strong>Provinces &amp; territories</strong>
            <p>${provLinks}</p>
          </div>
          <div>
            <strong>Explore</strong>
            <p><a href="provinces.html">Provinces</a><br><a href="districts.html">Districts</a><br><a href="culture.html">Culture</a><br><a href="literature.html">Literature</a><br><a href="geography.html">Geography</a><br><a href="sports.html">Sports</a><br><a href="history.html">History</a><br><a href="showbiz.html">Showbiz</a></p>
          </div>
          <div>
            <strong>About</strong>
            <p><a href="about.html">About</a><br><a href="contact.html">Contact</a><br><a href="privacy.html">Privacy</a><br><a href="disclaimer.html">Disclaimer</a><br><a href="terms.html">Terms</a><br><a href="sitemap.xml">Sitemap</a></p>
          </div>
        </div>
        <div class="container foot-bottom">
          <span>© MyBook.Pk · Built for young readers</span>
          <span><a href="/">Home</a></span>
        </div>
      </footer>
      ${FTR_END}`;
}

// ---------- structured data ----------
function faqEntities(html) {
  const m = html.match(/<h2[^>]*>(?:(?!<\/h2>)[\s\S])*?(?:\bFAQ\b|Frequently Asked Questions)(?:(?!<\/h2>)[\s\S])*?<\/h2>/);
  if (!m) return [];
  const start = m.index + m[0].length;
  const next = html.slice(start).search(/<h2[\s>]/i);
  const seg = html.slice(start, next < 0 ? undefined : start + next);
  const out = [];
  for (const q of seg.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>\s*(?:<\/?div[^>]*>\s*)*<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const question = textOf(q[1]);
    const answer = textOf(q[2]);
    if (question.endsWith("?") && answer) out.push({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } });
  }
  return out.length >= 2 ? out : [];
}
function graphFor(file, cls, meta, crumbs, html) {
  const pageUrl = url(file);
  const website = { "@type": "WebSite", "@id": `${SITE}/#website`, name: "MyBook.Pk", url: `${SITE}/`, inLanguage: ["en", "ur"] };
  if (cls.type === "home") website.potentialAction = { "@type": "SearchAction", target: `${SITE}/districts.html?q={search_term_string}`, "query-input": "required name=search_term_string" };
  const isCollection = ["hub", "districts", "provinces"].includes(cls.type);
  const page = { "@type": isCollection ? "CollectionPage" : "WebPage", "@id": `${pageUrl}#webpage`, url: pageUrl, name: meta.title, isPartOf: { "@id": `${SITE}/#website` }, inLanguage: "en" };
  if (meta.description) page.description = meta.description;
  const graph = [website, page];
  if (crumbs.length) {
    page.breadcrumb = { "@id": `${pageUrl}#breadcrumb` };
    graph.push({ "@type": "BreadcrumbList", "@id": `${pageUrl}#breadcrumb`, itemListElement: crumbs.map(([href, name], i) => ({ "@type": "ListItem", position: i + 1, name, item: href === "/" ? `${SITE}/` : url(href) })) });
  }
  const pakistan = { "@type": "Country", name: "Pakistan" };
  const provincePlace = (pid) => ({ "@type": "AdministrativeArea", "@id": `${url(provinceRoutes[pid])}#place`, name: L.provinceById[pid].name, url: url(provinceRoutes[pid]), containedInPlace: pakistan });
  if (cls.type === "district" || cls.type === "tehsils") {
    const { district: d, provinceId: pid } = cls.info;
    const dUrl = url(`${d.slug}.html`);
    const place = { "@type": "AdministrativeArea", "@id": `${dUrl}#place`, name: L.districtLabel(d), url: dUrl, containedInPlace: provincePlace(pid) };
    const units = L.unitsOf(d);
    if (units.length) place.containsPlace = units.map((u) => ({ "@type": "AdministrativeArea", name: `${u.name} ${L.unitWord[u.type] || ""}`.trim() }));
    graph.push(place);
    page.about = { "@id": `${dUrl}#place` };
    if (cls.type === "tehsils" && units.length) {
      page.mainEntity = { "@id": `${pageUrl}#list` };
      graph.push({ "@type": "ItemList", "@id": `${pageUrl}#list`, name: `Tehsils of ${L.districtLabel(d)}`, numberOfItems: units.length, itemListElement: units.map((u, i) => ({ "@type": "ListItem", position: i + 1, name: `${u.name} ${L.unitWord[u.type] || ""}`.trim() })) });
    }
  } else if (cls.type === "province") {
    graph.push(provincePlace(cls.pid));
    page.about = { "@id": `${url(provinceRoutes[cls.pid])}#place` };
  } else if (cls.type === "place-extra") {
    graph.push({ "@type": "AdministrativeArea", "@id": `${pageUrl}#place`, name: "South Waziristan", url: pageUrl, containedInPlace: provincePlace("kpk") });
    page.about = { "@id": `${pageUrl}#place` };
  }
  let items = null;
  if (cls.type === "hub") items = L.sortedDistrictsOf(cls.pid).map((d) => [`${d.slug}.html`, L.districtLabel(d)]);
  if (cls.type === "districts") items = L.provinceOrder.flatMap((pid) => L.sortedDistrictsOf(pid).map((d) => [`${d.slug}.html`, L.districtLabel(d)]));
  if (cls.type === "provinces") items = L.provinceOrder.map((pid) => [provinceRoutes[pid], L.provinceById[pid].name]);
  if (items) {
    page.mainEntity = { "@id": `${pageUrl}#list` };
    graph.push({ "@type": "ItemList", "@id": `${pageUrl}#list`, numberOfItems: items.length, itemListElement: items.map(([href, name], i) => ({ "@type": "ListItem", position: i + 1, name, url: url(href) })) });
  }
  const faq = faqEntities(html);
  if (faq.length) graph.push({ "@type": "FAQPage", "@id": `${pageUrl}#faq`, mainEntity: faq });
  return { "@context": "https://schema.org", "@graph": graph };
}

// ---------- transformations ----------
function stripFences(html) {
  return html
    .replace(/^[ \t]*```[a-zA-Z]*[ \t]*\r?\n/gm, "")
    // A line of script source that an old edit pasted into <head> on 10 pages as visible text.
    // A literal "\n" left between two head tags by an old script (geography.html).
    .replace(/(<meta\b[^>]*>)\\n(?=[ \t]*<)/g, "$1\n")
    .replace(/^[ \t]*if \(!\/<metas\+name="description"\/i\.test\(result\)\) \{[ \t]*\r?\n/gm, "");
}
function relink(html) {
  return html
    .replace(/(href\s*=\s*["'])(?:https:\/\/(?:www\.)?mybook\.pk\/|\.\/)?([a-z0-9-]+\.html)(?=["'#?])/gi, (m, pre, f) => (LEGACY_LINKS[f] ? pre + LEGACY_LINKS[f] : m))
    .replace(/(href\s*=\s*["'])(?:\.\/)?index\.html(?=["'#])/gi, "$1/");
}
function removeLegacyCrumbs(html) {
  return html
    .replace(/[ \t]*<p(?: style="opacity:\.9")?>\s*<a href="\/" style="color:#fff">Home<\/a>[\s\S]*?<\/p>[ \t]*\n?/g, "")
    .replace(/[ \t]*<p class="crumb">\s*<a href="\/">Home<\/a>[\s\S]*?<\/p>[ \t]*\n?/g, "")
    .replace(/[ \t]*<nav aria-label="Breadcrumb">[\s\S]*?<\/nav>[ \t]*\n?/g, "");
}
function removeManagedHead(html) {
  let out = html.replace(new RegExp(`[ \\t]*${HEAD_START}[\\s\\S]*?${HEAD_END}\\n`, "g"), "");
  out = out.replace(/[ \t]*<meta\s+(?:property|name)=["'](?:og:[a-z_:]+|twitter:[a-z_:]+)["'][^>]*>[ \t]*\r?\n?/gi, "");
  out = out.replace(/[ \t]*<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>[ \t]*\r?\n?/gi, (m, body) => {
    try {
      const j = JSON.parse(body);
      const nodes = Array.isArray(j) ? j : j["@graph"] || [j];
      const types = nodes.flatMap((n) => [].concat(n["@type"] || []));
      return types.length && types.every((t) => MANAGED_TYPES.has(t)) ? "" : m;
    } catch (_) { return m; }
  });
  out = out.replace(/[ \t]*<link rel="stylesheet" href="css\/chrome\.css[^"]*"[^>]*>[ \t]*\r?\n?/g, "");
  return out;
}
function setTitleAndDescription(html, meta) {
  let out = html;
  let seenTitle = false;
  out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, () => { if (seenTitle) return ""; seenTitle = true; return `<title>${esc(meta.title)}</title>`; });
  if (!seenTitle) out = out.replace(/<head[^>]*>/i, (h) => `${h}\n  <title>${esc(meta.title)}</title>`);
  if (meta.description) {
    let seen = false;
    out = out.replace(/[ \t]*<meta\s+name=["']description["'][^>]*>[ \t]*\r?\n?/gi, (m) => {
      if (seen) return "";
      seen = true;
      const indent = m.match(/^[ \t]*/)[0];
      return `${indent}<meta name="description" content="${esc(meta.description)}" />${/\n$/.test(m) ? "\n" : ""}`;
    });
    if (!seen) out = out.replace(/<\/title>/i, `</title>\n  <meta name="description" content="${esc(meta.description)}" />`);
  }
  return out;
}
function headBlock(file, meta, graph, ogImage, ogType) {
  const pageUrl = url(file);
  const tags = [
    `<meta property="og:title" content="${esc(meta.title)}" />`,
    meta.description ? `<meta property="og:description" content="${esc(meta.description)}" />` : "",
    `<meta property="og:type" content="${esc(ogType)}" />`,
    `<meta property="og:url" content="${pageUrl}" />`,
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    ogImage === L.OG_IMAGE ? `<meta property="og:image:width" content="1200" />\n  <meta property="og:image:height" content="630" />\n  <meta property="og:image:alt" content="MyBook.Pk – provinces, districts and tehsils of Pakistan" />` : "",
    `<meta property="og:site_name" content="MyBook.Pk" />`,
    `<meta property="og:locale" content="en_PK" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(meta.title)}" />`,
    meta.description ? `<meta name="twitter:description" content="${esc(meta.description)}" />` : "",
    `<meta name="twitter:image" content="${esc(ogImage)}" />`,
    `<link rel="stylesheet" href="css/chrome.css?v=1" />`,
    `<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, "\\u003c")}</script>`
  ].filter(Boolean);
  return `  ${HEAD_START}\n  ${tags.join("\n  ")}\n  ${HEAD_END}\n`;
}
function injectChrome(html, header, footer, needsScript) {
  let out = html;
  const hdrRe = new RegExp(`<div id="site-header"([^>]*)>(?:\\s*${HDR_START}[\\s\\S]*?${HDR_END}\\s*)?</div>`);
  if (hdrRe.test(out)) out = out.replace(hdrRe, (m, attrs) => `<div id="site-header"${attrs}>\n      ${header}\n  </div>`);
  else out = out.replace(/<body[^>]*>/i, (b) => `${b}\n  <div id="site-header">\n      ${header}\n  </div>`);
  const ftrRe = new RegExp(`<div id="site-footer"([^>]*)>(?:\\s*${FTR_START}[\\s\\S]*?${FTR_END}\\s*)?</div>`);
  if (ftrRe.test(out)) out = out.replace(ftrRe, (m, attrs) => `<div id="site-footer"${attrs}>\n      ${footer}\n  </div>`);
  else out = out.replace(/<\/body>/i, `  <div id="site-footer">\n      ${footer}\n  </div>\n</body>`);
  if (needsScript && !/src=["'][^"']*js\/app\.js/.test(out)) out = out.replace(/<\/body>/i, `  <script src="js/app.js"></script>\n</body>`);
  return out;
}

// Exactly one AdSense loader script and one google-adsense-account meta, directly after <head>, with the
// owner-confirmed publisher ID. Any other copy (such as an old tag with a different publisher ID) is removed.
function setAdsense(html) {
  let out = html
    .replace(/\n?[ \t]*<script\b[^>]*adsbygoogle\.js[^>]*>\s*<\/script>/gi, "")
    .replace(/\n?[ \t]*<meta\b[^>]*name\s*=\s*["']google-adsense-account["'][^>]*>/gi, "");
  return out.replace(/<head\b[^>]*>/i, (m) => `${m}\n  ${L.ADSENSE_SCRIPT}\n  ${L.ADSENSE_META}`);
}

function build(file, html) {
  const cls = classify(file);
  let out = setAdsense(stripFences(html));
  out = relink(out);
  const existingImage = getMeta(out, "og:image");
  const existingType = getMeta(out, "og:type");
  let meta;
  if (cls.type === "district") meta = districtMeta(cls.info);
  else if (cls.type === "province") meta = provinceMeta(cls.pid);
  else if (cls.type === "hub") meta = hubMeta(cls.pid);
  else if (cls.type === "tehsils") meta = tehsilMeta(cls.info);
  else if (cls.type === "districts") meta = { title: "Districts of Pakistan: Full List by Province (2023)", description: "" };
  else if (cls.type === "provinces") meta = { title: "Provinces of Pakistan: Capitals, Population & Area", description: "" };
  else if (cls.type === "place-extra") meta = southWaziristanMeta();
  else meta = otherMeta(out, file);
  if (cls.type === "districts") {
    meta.description = `All ${L.districtIndex.size} district pages of Pakistan by province and territory: Punjab, Sindh, KP, Balochistan, GB, AJK and ICT, with HQ and 2023 census population.`;
  }
  if (cls.type === "provinces") {
    meta.description = "Pakistan's four provinces (Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan) and three territories (ICT, Gilgit-Baltistan, AJK): capitals, 2023 population, area.";
  }
  const crumbs = crumbsFor(file, cls, meta.title, out);
  out = removeLegacyCrumbs(out);
  out = removeManagedHead(out);
  out = setTitleAndDescription(out, meta);
  const ogImage = existingImage && /\.(png|jpe?g|webp)(\?|$)/i.test(existingImage) ? (existingImage.startsWith("http") ? existingImage : `${SITE}/${existingImage.replace(/^\//, "")}`) : L.OG_IMAGE;
  const ogType = existingType === "article" ? "article" : "website";
  const graph = graphFor(file, cls, meta, crumbs, out);
  out = out.replace(/[ \t]*<\/head>/i, (m) => headBlock(file, meta, graph, ogImage, ogType) + m.trimStart());
  out = injectChrome(out, headerHtml(activeNav(cls, file), crumbs, file === "index.html" ? "/" : file), footerHtml(), true);
  return { out, meta, cls };
}

module.exports = { build };

function main() {
  const titles = new Map();
  const descriptions = new Map();
  let changed = 0;
  const files = L.htmlFiles().filter((f) => !L.isVerificationFile(f));
  for (const file of files) {
    const full = path.join(L.ROOT, file);
    const html = fs.readFileSync(full, "utf8");
    const { out, meta, cls } = build(file, html);
    if (out !== html) { fs.writeFileSync(full, out); changed++; }
    if (cls.type !== "utility") {
      titles.set(meta.title, [...(titles.get(meta.title) || []), file]);
      if (meta.description) descriptions.set(meta.description, [...(descriptions.get(meta.description) || []), file]);
    }
  }
  const dupT = [...titles].filter(([, f]) => f.length > 1);
  const dupD = [...descriptions].filter(([, f]) => f.length > 1);
  for (const [t, f] of dupT) console.warn(`Duplicate title "${t}": ${f.join(", ")}`);
  for (const [d, f] of dupD) console.warn(`Duplicate description "${d.slice(0, 60)}…": ${f.join(", ")}`);
  console.log(`Built ${files.length} pages (${changed} changed); ${dupT.length} duplicate titles, ${dupD.length} duplicate descriptions.`);
}

if (require.main === module) main();
