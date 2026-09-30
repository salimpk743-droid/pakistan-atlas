// Final build step for every HTML page (run after generate-seo.js and enhance-district-seo.js):
//  - strips stray markdown fences and rewrites links that point at redirected URLs
//  - writes <title>, meta description, Open Graph / Twitter tags and one JSON-LD @graph
//    (WebSite, WebPage/CollectionPage, BreadcrumbList, AdministrativeArea, ItemList, FAQPage)
//  - renders the header/nav, breadcrumbs and footer as static HTML (js/app.js no longer needs to)
// Every managed block sits between <!-- mb:... --> markers and is replaced in place on each run,
// so running this twice yields no diff. Verification files are never touched.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const L = require("./lib/site");

const { SITE, esc, fmtInt, provinceRoutes, hubRoutes } = L;
const HEAD_START = "<!-- mb:head:start -->";
const HEAD_END = "<!-- mb:head:end -->";
const HDR_START = "<!-- mb:header:start -->";
const HDR_END = "<!-- mb:header:end -->";
const FTR_START = "<!-- mb:footer:start -->";
const FTR_END = "<!-- mb:footer:end -->";
const MANAGED_TYPES = new Set(["Organization", "BreadcrumbList", "AdministrativeArea", "Place", "City", "WebPage", "CollectionPage", "WebSite", "ItemList", "FAQPage"]);
// Retired URLs whose links are rewritten to the live page. The pages consolidated in PR #6 were restored
// (owner request, 30 Sep 2026) and are live again, so they are no longer listed here.
const LEGACY_LINKS = {
  "current-affairs.html": "literature.html", "politics.html": "geography.html"
};

const NEWS_HUB = "pakistan-current-affairs.html";
const NEWS_WEEK_RE = /^current-affairs-(\d{4})-(\d{2})-(\d{2})-to-(\d{2})-(\d{2})\.html$/;
// "current-affairs-2026-09-24-to-09-30.html" -> "24–30 September 2026" (month and year shown where they change).
function newsWeekLabel(file) {
  const m = file.match(NEWS_WEEK_RE);
  if (!m) return file;
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const [y, m1, d1, m2, d2] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])];
  const y2 = m2 < m1 ? y + 1 : y;
  if (m1 === m2) return `${d1}–${d2} ${MONTH[m1 - 1]} ${y}`;
  if (y2 === y) return `${d1} ${MONTH[m1 - 1]} – ${d2} ${MONTH[m2 - 1]} ${y}`;
  return `${d1} ${MONTH[m1 - 1]} ${y} – ${d2} ${MONTH[m2 - 1]} ${y2}`;
}
// Weekly pages listed in the hub's archive (<ol class="ca-archive">), newest first, as [href, label].
function newsArchiveItems(html) {
  const m = html.match(/<ol class="ca-archive"[^>]*>([\s\S]*?)<\/ol>/);
  if (!m) return [];
  return [...m[1].matchAll(/<a href="(current-affairs-[^"]+\.html)"/g)].map((x) => [x[1], `Pakistan current affairs: ${newsWeekLabel(x[1])}`]);
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
  // Weekly current affairs: the hub lists the weekly pages; each week is current-affairs-YYYY-MM-DD-to-MM-DD.html.
  if (file === NEWS_HUB) return { type: "news-hub" };
  if (NEWS_WEEK_RE.test(file)) return { type: "news-week" };
  return { type: "other" };
}

function districtMeta({ district: d, provinceId: pid, province }) {
  const label = L.districtLabel(d);
  const n = d.tehsil_count;
  const units = L.unitsOf(d);
  const Noun = n ? cap(L.unitNoun(d, n)) : "";
  const provShort = L.shortProvince[pid];
  let title;
  const year = d.created_year || (String(d.created || "").match(/20\d\d/g) || []).pop();
  if (pid === "ict") {
    title = "Islamabad District (ICT): Population, Area & Guide (2023)";
  } else if (d.status === "former") {
    const succ = joinNames((d.successors || []).map((s) => L.districtIndex.get(s)?.district.name || s));
    title = firstFit([`${label}: Split into ${succ} (2026)`, `${d.name}: Split into ${succ} (2026)`, `${d.name}: Now ${succ}`], 60);
  } else if (d.status === "announced") {
    title = firstFit([`${d.name} Tehsil: Population & Proposed District Status`, `${d.name}: Population & Proposed District Status`], 60);
  } else if (d.created && d.population_2023 == null) {
    title = firstFit([`${label}, ${province.name}: New District (${year})`, `${label}: New District (${year}), ${provShort}`, `${label}: New District (${year})`], 60);
  } else if ((pid === "gb" || pid === "ajk") && d.official_stats) {
    title = firstFit(pid === "ajk"
      ? [`${label}, ${provShort}: Tehsils, Population & Area`, `${label}: Tehsils, Population & Area`, `${d.name}: Tehsils, Population & Area`]
      : [`${label}, ${provShort}: Population & Literacy (2023)`, `${label}: Population, Area & Literacy (2023)`, `${label}: Population & Literacy (2023)`], 60);
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
  const q = L.popQualifier(d);
  const preSplit = q ? ` (${q})` : "";
  const popPart = d.population_2023 != null
    ? ` 2023 census population ${fmtInt(d.population_2023)}${d.area_km2 != null ? `, area ${fmtInt(d.area_km2)} km²` : ""}${preSplit}.`
    : "";
  const popShort = d.population_2023 != null ? ` 2023 census population ${fmtInt(d.population_2023)}${preSplit}.` : "";
  const hqPart = hq ? ` Headquarters: ${hq}.` : "";
  const statusLead = String(d.status_note || "").replace(/ This page covers.*$/, "").replace(/ MyBook\.Pk does not count.*$/, "");
  if (d.status === "former" && statusLead) {
    const succNames = (d.successors || []).map((x) => L.districtIndex.get(x)?.district.name || x);
    if (d.population_2023 != null) {
      cands.push(`${label} was divided in 2026 into ${L.listText(succNames)}. 2023 census of the undivided district: ${fmtInt(d.population_2023)} people on ${fmtInt(d.area_km2)} km².`);
    }
    cands.push(`${statusLead}${popPart ? ` Undivided district:${popPart.replace(/ \(undivided district\)/, "")}` : ""}`, `${statusLead}${popShort ? ` Undivided district:${popShort.replace(/ \(undivided district\)/, "")}` : ""}`, statusLead);
  } else if (d.status === "announced" && d.census_2023_row) {
    const r = d.census_2023_row;
    cands.push(`${d.name} is a tehsil of Battagram District, Khyber Pakhtunkhwa; district status has been announced but not notified. 2023 census population ${fmtInt(r.population_2023)} on ${fmtInt(r.area_km2)} km².`,
      `${d.name}, Khyber Pakhtunkhwa: tehsil of Battagram with district status announced, not yet notified. 2023 census population ${fmtInt(r.population_2023)}.`);
  } else if (d.subdivisions && d.created) {
    const date = (String(d.created).match(/(\d{1,2} )?(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d/) || [year])[0];
    const on = /^\d/.test(date) ? "on" : "in";
    const subs = `${L.listText(d.subdivisions)} sub-division${d.subdivisions.length === 1 ? "" : "s"}`;
    cands.push(`${where}: new district created ${on} ${date}, covering the ${subs}.${hqPart} 2023 census rows and sources.`,
      `${where}: new district created ${on} ${date}, covering the ${subs}. 2023 census rows and sources.`,
      `${label}: new district created ${on} ${date}, covering the ${subs}.${hqPart}`);
  }
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
  } else if (d.census_2023_row && d.status !== "announced") {
    const r = d.census_2023_row;
    const parent = L.districtIndex.get(r.parent)?.district;
    const lead = `${where}: new district${year ? ` (${year})` : ""}. In the 2023 census, ${r.name} ${(L.unitWord[r.type] || r.type).toLowerCase()} of ${parent ? L.districtLabel(parent) : r.parent} had ${fmtInt(r.population_2023)} people.`;
    cands.push(lead + hqPart, lead);
  }
  // AJK and Gilgit-Baltistan: the answer-first lead built from the official statistics shown on the page.
  if (d.official_stats && d.official_stats.lead) {
    for (const x of d.official_stats.desc || []) cands.push(x);
    const sents = d.official_stats.lead.split(/(?<=\.) /);
    for (let k = sents.length; k >= 1; k--) cands.push(sents.slice(0, k).join(" "), sents.slice(-k).join(" "));
  }
  // Unchecked legacy "about" text is not used in descriptions (see enhance-district-seo.js, profile_checked).
  const about = d.profile_checked || d.created || d.status ? String(d.about || "").trim() : "";
  if (about) {
    for (const lead of [`${where}: ${about}`, `${label}: ${about}`]) {
      cands.push(lead + hqPart, lead);
    }
  }
  // Factual fallback for districts without census rows or a checked summary (mainly Gilgit-Baltistan and AJK).
  const div = d.division || d.division_2023 || "";
  const specific = cands.flat().filter((c) => c && c.length >= 140 && c.length <= 160);
  if (!specific.length) cands.push(`${where}${div ? `, ${div}` : ""}: district guide with headquarters, administrative units, official figures where published, and sources.${hqPart}`,
    `${where}${div ? `, ${div}` : ""}: district guide with headquarters, administrative units, official figures where published, and sources.`,
    `${label}: district guide with headquarters, administrative units, official figures where published, and sources.`);
  let description = fitDescription(cands);
  description = pad(description, [" Facts, places and sources.", " With sources.", " Facts and sources."]);
  return { title, description };
}

function joinNames(names) {
  if (names.length !== 2) return names.join(" & ");
  const [a, b] = names.map((x) => x.split(" "));
  if (a.length > 1 && a[0] === b[0]) return `${a.join(" ")} & ${b.slice(1).join(" ")}`;
  if (a.length > 1 && a.slice(1).join(" ") === b.slice(1).join(" ")) return `${a[0]} & ${b.join(" ")}`;
  return names.join(" & ");
}

function provinceMeta(pid) {
  const u = L.provinceById[pid];
  const n = L.districtCount(pid).count;
  const title = pid === "ict" ? "Islamabad Capital Territory: Population & Area (2023)"
    : pid === "ajk" ? "Azad Jammu and Kashmir: Districts, Population & Area"
    : firstFit([`${u.name}: Districts, Population & Area (2023)`, `${u.name}: Districts, Population & Area`], 60);
  const pop = u.population_2023 != null ? `${u.pop_label || "2023 census"} population ${fmtInt(u.population_2023)}` : `2017 census population ${fmtInt(u.population_2017)}`;
  const cap = pid === "ajk" ? `administered from ${u.capital}, ` : u.capital ? `capital ${u.capital}, ` : "";
  const sents = String(u.lead || "").split(/(?<=\.) /);
  const description = fitDescription([
    ...sents.map((_, i) => sents.slice(0, sents.length - i).join(" ")),
    `${u.name}, Pakistan: ${cap}${pop} and area ${fmtInt(u.area_km2)} km². Its ${n} district${n === 1 ? "" : "s"}, largest districts, FAQs and sources.`,
    `${u.name}: ${cap}${pop}, area ${fmtInt(u.area_km2)} km², ${n} district${n === 1 ? "" : "s"}, with sources.`
  ]);
  return { title, description };
}

function hubMeta(pid) {
  const u = L.provinceById[pid];
  const list = L.sortedDistrictsOf(pid);
  const n = L.districtCount(pid).count;
  const title = firstFit([`Districts of ${u.name}: List with Population (2023)`, `Districts of ${u.name}: Full List (2023)`, `Districts of ${u.name}: List (2023)`], 60);
  const names = list.map((d) => d.name);
  const cands = [];
  for (let k = Math.min(names.length, 8); k >= 1; k--) {
    cands.push(`${u.name} has ${n} district${n === 1 ? "" : "s"}. A–Z list: ${names.slice(0, k).join(", ")}${k < names.length ? " and more" : ""}, with HQ, 2023 census population and tehsils.`);
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
      `South Waziristan was divided into Upper and Lower districts in October 2022. The 2023 census counted ${fmtInt(r.population_2023)} people on ${fmtInt(r.area_km2)} km² in its ${r.units.length} tehsils.`,
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
    case "news-hub": return [home, [file, "Current Affairs"]];
    case "news-week": return [home, [NEWS_HUB, "Current Affairs"], [file, newsWeekLabel(file)]];
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

// ---------- "Share this page" row ----------
// Plain share links (no third-party scripts) plus a Copy link button, rendered at the top of the footer block on
// every content page. Links use the page's canonical URL and title, URL-encoded. Icons: Bootstrap Icons (MIT).
const NO_SHARE = new Set(["about.html", "contact.html", "privacy.html", "terms.html", "disclaimer.html", "sources-methodology.html"]);
const SHARE_ICONS = {
  whatsapp: '<path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>',
  facebook: '<path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/>',
  x: '<path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/>',
  linkedin: '<path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z"/>',
  telegram: '<path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0M8.287 5.906q-1.168.486-4.666 2.01-.567.225-.595.442c-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294q.39.01.868-.32 3.269-2.206 3.374-2.23c.05-.012.12-.026.166.016s.042.12.037.141c-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8 8 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629q.14.092.27.187c.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.4 1.4 0 0 0-.013-.315.34.34 0 0 0-.114-.217.53.53 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09"/>',
  link: '<path d="M4.715 6.542 3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199 2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4 4 0 0 1-.128-1.287z"/><path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243z"/>'
};
const shareIcon = (name) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false">${SHARE_ICONS[name]}</svg>`;
const SHARE_SCRIPT = "(function(){var b=document.querySelector('#site-footer .mb-share-copy');if(!b)return;var l=b.querySelector('.mb-share-text'),s=document.querySelector('#site-footer .mb-share-status'),t=l.textContent,u=b.getAttribute('data-url'),n=b.getAttribute('data-title');function ok(){l.textContent='Copied';b.classList.add('is-copied');s.textContent='Link copied to clipboard';setTimeout(function(){l.textContent=t;b.classList.remove('is-copied');s.textContent='';},2000);}function alt(){if(navigator.share){navigator.share({title:n,url:u}).catch(function(){});}else{window.prompt('Copy this link:',u);}}b.addEventListener('click',function(){if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(u).then(ok,alt);}else{alt();}});})();";
function canonicalOf(html, file) {
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["'](https:\/\/mybook\.pk\/[^"']*)["']/i);
  return m ? m[1] : url(file);
}
function shareHtml(file, cls, title, html) {
  if (["home", "utility"].includes(cls.type) || NO_SHARE.has(file)) return "";
  const u = encodeURIComponent(canonicalOf(html, file));
  const t = encodeURIComponent(title);
  const links = [
    ["whatsapp", "WhatsApp", `https://wa.me/?text=${t}%20${u}`],
    ["facebook", "Facebook", `https://www.facebook.com/sharer/sharer.php?u=${u}`],
    ["x", "X", `https://x.com/intent/tweet?url=${u}&text=${t}`],
    ["linkedin", "LinkedIn", `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
    ["telegram", "Telegram", `https://t.me/share/url?url=${u}&text=${t}`]
  ].map(([k, name, href]) => `<a class="mb-share-btn mb-share-${k}" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="Share on ${name} (opens in a new tab)">${shareIcon(k)}<span class="mb-share-text">${name}</span></a>`);
  links.push(`<button type="button" class="mb-share-btn mb-share-copy" data-url="${esc(canonicalOf(html, file))}" data-title="${esc(title)}" aria-label="Copy link to this page">${shareIcon("link")}<span class="mb-share-text">Copy link</span></button>`);
  return `<div class="mb-share">
        <div class="container mb-share-inner">
          <p class="mb-share-title">Share this page</p>
          <div class="mb-share-list" role="group" aria-label="Share this page">
            ${links.join("\n            ")}
          </div>
          <span class="mb-share-status visually-hidden" role="status" aria-live="polite"></span>
        </div>
      </div>
      <script>${SHARE_SCRIPT}</script>
      `;
}
function footerHtml(share = "") {
  const provLinks = L.provinceOrder.map((pid) => `<a href="${provinceRoutes[pid]}">${esc(L.provinceById[pid].name)}</a>`).join("<br>");
  return `${FTR_START}
      ${share}<footer>
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
            <p><a href="provinces.html">Provinces</a><br><a href="districts.html">Districts</a><br><a href="culture.html">Culture</a><br><a href="literature.html">Literature</a><br><a href="geography.html">Geography</a><br><a href="sports.html">Sports</a><br><a href="history.html">History</a><br><a href="showbiz.html">Showbiz</a><br><a href="pakistan-current-affairs.html">Current Affairs</a></p>
          </div>
          <div>
            <strong>About</strong>
            <p><a href="about.html">About</a><br><a href="sources-methodology.html">Sources &amp; methodology</a><br><a href="contact.html">Contact &amp; corrections</a><br><a href="privacy.html">Privacy policy</a><br><a href="terms.html">Terms of use</a><br><a href="disclaimer.html">Disclaimer</a><br><a href="sitemap.xml">Sitemap</a></p>
          </div>
        </div>
        <div class="container foot-bottom">
          <span>© MyBook.Pk · Built for young readers</span>
          <span>Last updated <time datetime="${DATE_TOKEN}" data-mb-updated>${DATE_HUMAN_TOKEN}</time></span>
          <span><a href="/">Home</a></span>
        </div>
      </footer>
      ${FTR_END}`;
}

// ---------- "Last updated" dates ----------
// Each page shows the date it last changed. build() writes placeholders; main() replaces them with today's date
// (UTC) when the page differs from the committed version, otherwise with the page's last git commit date.
// Placeholders are compared in normalised form, so the date itself never makes a page look changed.
const DATE_TOKEN = "@@MB_DATE@@";
const DATE_HUMAN_TOKEN = "@@MB_DATE_HUMAN@@";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const humanDate = (iso) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const todayUtc = new Date().toISOString().slice(0, 10);
function normaliseDates(html) {
  return html
    .replace(/<time datetime="\d{4}-\d{2}-\d{2}" data-mb-updated>[^<]*<\/time>/g, `<time datetime="${DATE_TOKEN}" data-mb-updated>${DATE_HUMAN_TOKEN}</time>`)
    .replace(/"dateModified":"\d{4}-\d{2}-\d{2}"/g, `"dateModified":"${DATE_TOKEN}"`);
}
function git(args) {
  try { return execFileSync("git", args, { cwd: L.ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }); } catch (_) { return null; }
}
function pageDate(file, tokenised) {
  const committed = git(["show", `HEAD:${file}`]);
  if (committed == null || normaliseDates(committed) !== tokenised) return todayUtc;
  const ct = (git(["log", "-1", "--format=%ct", "--", file]) || "").trim();
  return /^\d+$/.test(ct) ? new Date(Number(ct) * 1000).toISOString().slice(0, 10) : todayUtc;
}
function applyDate(file, out) {
  const tokenised = normaliseDates(out);
  const iso = pageDate(file, tokenised);
  return tokenised.split(DATE_TOKEN).join(iso).split(DATE_HUMAN_TOKEN).join(humanDate(iso));
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
  // districts.html reads ?q= and filters the district list, so the SearchAction target works as a URL.
  if (cls.type === "home") website.potentialAction = { "@type": "SearchAction", target: `${SITE}/districts.html?q={search_term_string}`, "query-input": "required name=search_term_string" };
  const organization = { "@type": "Organization", "@id": `${SITE}/#organization`, name: "MyBook.Pk", url: `${SITE}/`, email: "zainkhanpk742@gmail.com",
    description: "Independent educational website about Pakistan's provinces, districts, history and culture.",
    publishingPrinciples: `${SITE}/sources-methodology.html`, correctionsPolicy: `${SITE}/sources-methodology.html#corrections`,
    contactPoint: { "@type": "ContactPoint", contactType: "editorial corrections", email: "zainkhanpk742@gmail.com", url: `${SITE}/contact.html` } };
  if (cls.type === "home") website.publisher = { "@id": `${SITE}/#organization` };
  const isCollection = ["hub", "districts", "provinces", "news-hub"].includes(cls.type);
  const page = { "@type": isCollection ? "CollectionPage" : "WebPage", "@id": `${pageUrl}#webpage`, url: pageUrl, name: meta.title, isPartOf: { "@id": `${SITE}/#website` }, inLanguage: "en" };
  if (meta.description) page.description = meta.description;
  page.dateModified = DATE_TOKEN;
  const graph = cls.type === "home" ? [website, organization, page] : [website, page];
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
  if (cls.type === "news-hub") { items = newsArchiveItems(html); if (!items.length) items = null; }
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
function headBlock(file, meta, graph, ogImage, ogType, hasShare = false) {
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
    hasShare ? `<link rel="stylesheet" href="css/share.css?v=1" />` : "",
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
    meta.description = `Pakistan has ${L.totalDistricts()} districts: ${L.provinceOrder.map((pid) => `${L.shortProvince[pid]} ${L.districtCount(pid).count}`).join(", ")}. Full list by province with HQ and 2023 census population.`;
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
  const share = shareHtml(file, cls, meta.title, out);
  out = out.replace(/[ \t]*<\/head>/i, (m) => headBlock(file, meta, graph, ogImage, ogType, Boolean(share)) + m.trimStart());
  out = injectChrome(out, headerHtml(activeNav(cls, file), crumbs, file === "index.html" ? "/" : file), footerHtml(share), true);
  return { out, meta, cls };
}

module.exports = { build, normaliseDates };

function main() {
  const titles = new Map();
  const descriptions = new Map();
  let changed = 0;
  const files = L.htmlFiles().filter((f) => !L.isVerificationFile(f));
  for (const file of files) {
    const full = path.join(L.ROOT, file);
    const html = fs.readFileSync(full, "utf8");
    const built = build(file, html);
    const { meta, cls } = built;
    const out = applyDate(file, built.out);
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
