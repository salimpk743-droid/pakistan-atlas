const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mybook.pk";
const provinceRoutes = {
  punjab: "punjab.html",
  sindh: "sindh.html",
  kpk: "khyber-pakhtunkhwa.html",
  balochistan: "balochistan.html",
  gb: "gilgit-baltistan.html",
  ajk: "azad-kashmir.html",
  ict: "islamabad-capital-territory.html"
};
const provinceNames = {
  punjab: "Punjab",
  sindh: "Sindh",
  kpk: "Khyber Pakhtunkhwa",
  balochistan: "Balochistan",
  gb: "Gilgit-Baltistan",
  ajk: "Azad Jammu and Kashmir",
  ict: "Islamabad Capital Territory"
};
const staticBreadcrumbs = new Map();
const ADSENSE_PUBLISHER = "ca-pub-8924686927214586";
const ADSENSE_SCRIPT = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER}" crossorigin="anonymous"></script>`;
const ADSENSE_META = `<meta name="google-adsense-account" content="${ADSENSE_PUBLISHER}" />`;


function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatNumber(value) {
  return value == null ? "Not stated" : Number(value).toLocaleString("en-PK");
}

const districtAliases = {
  bajur: "bajaur.html",
  dgkhan: "dera-ghazi-khan.html",
  dikhan: "dera-ismail-khan.html",
  rykhan: "rahim-yar-khan.html",
  nankana: "nankana-sahib.html",
  tts: "toba-tek-singh.html",
  lakki: "lakki-marwat.html"
};

function districtHref(district) {
  if (districtAliases[district.slug]) return districtAliases[district.slug];
  const candidate = `${district.slug}.html`;
  return fs.existsSync(path.join(ROOT, candidate)) ? candidate : `district.html?p=${district.provinceId}&d=${district.slug}`;
}

function schemaScript(value) {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function provincePage(unit, districtData) {
  const route = provinceRoutes[unit.id];
  const districts = districtData[unit.id]?.districts || [];
  const description = `Explore ${unit.name}: capital ${unit.capital}, population, area, culture, education, health and ${districts.length} district pages in MyBook.Pk.`;
  const cards = districts.map((district) => `
        <article class="card">
          <div class="card-body">
            <span class="badge">${esc(district.hq)}</span>
            <h2><a href="${esc(districtHref({ ...district, provinceId: unit.id }))}">${esc(district.name)} District</a></h2>
            <p><strong>Population:</strong> ${esc(district.pop)}</p>
            <p>${esc(district.about)}</p>
            <p class="meta"><a href="${esc(districtHref({ ...district, provinceId: unit.id }))}">Read ${esc(district.name)} District</a></p>
          </div>
        </article>`).join("");
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Provinces", item: `${SITE}/provinces-of-pakistan.html` },
      { "@type": "ListItem", position: 3, name: unit.name, item: `${SITE}/${route}` }
    ]
  };
  const webpage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${unit.name}, Pakistan`,
    description,
    url: `${SITE}/${route}`,
    isPartOf: { "@type": "WebSite", name: "MyBook.Pk", url: `${SITE}/` }
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${ADSENSE_SCRIPT}
  ${ADSENSE_META}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(unit.name)}, Pakistan — Districts, Population &amp; Facts | MyBook.Pk</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${SITE}/${route}" />
  <meta property="og:title" content="${esc(unit.name)}, Pakistan — Districts, Population, Cities &amp; Facts" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE}/${route}" />
  <meta property="og:image" content="${SITE}/images/flag-pakistan.svg" />
  <meta property="og:site_name" content="MyBook.Pk" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(unit.name)}, Pakistan — MyBook.Pk" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/images/flag-pakistan.svg" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
  ${schemaScript(webpage)}
  ${schemaScript(breadcrumbs)}
</head>
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <p style="opacity:.9"><a href="index.html" style="color:#fff">Home</a> · <a href="provinces-of-pakistan.html" style="color:#fff">Provinces of Pakistan</a></p>
    <h1>${esc(unit.name)} <span class="urdu">${esc(unit.urdu)}</span></h1>
    <p>${esc(unit.intro || unit.culture)}</p>
  </div></div>
  <section><div class="container prose">
    <h2>${esc(unit.name)} facts</h2>
    <p><strong>Capital:</strong> ${esc(unit.capital)} · <strong>Population:</strong> ${formatNumber(unit.population_2023)} (2023 baseline) · <strong>Area:</strong> ${formatNumber(unit.area_km2)} km² · <strong>Administrative units:</strong> ${districts.length} district pages.</p>
    <div class="grid-2">
      <div><h3>Culture and geography</h3><p>${esc(unit.culture)}</p></div>
      <div><h3>Education and health</h3><p>${esc(unit.education_note)}</p><p>${esc(unit.health_note)}</p></div>
    </div>
    <h2>${esc(unit.name)} districts</h2>
    <p>Use the district pages below for headquarters, population notes, public services, history, geography and local places. Figures are based on public sources; check the Pakistan Bureau of Statistics for the latest official tables.</p>
    <div class="grid-3">${cards}
    </div>
    <h2>Public issues</h2><p>${esc(unit.issues)}</p>
    <p class="meta"><strong>Sources:</strong> Pakistan Bureau of Statistics 2023 census baseline and public provincial or district sources as noted on individual pages.</p>
  </div></section>
  <div id="site-footer"></div>
  <script src="js/app.js"></script>
</body>
</html>
`;
}

function districtPage(district, province) {
  const route = `${district.slug}.html`;
  const description = `Learn about ${district.name} District in ${province.name}, including 2023 census population, headquarters, education, health, culture, geography and local places.`;
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: province.name, item: `${SITE}/${provinceRoutes[province.id]}` },
      { "@type": "ListItem", position: 3, name: `${district.name} District`, item: `${SITE}/${route}` }
    ]
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(district.name)} District, ${esc(province.name)} — Population, Services &amp; Facts | MyBook.Pk</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE}/${route}" />
  <meta property="og:title" content="${esc(district.name)} District, ${esc(province.name)} — MyBook.Pk" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="place" />
  <meta property="og:url" content="${SITE}/${route}" />
  <meta property="og:image" content="${SITE}/images/flag-pakistan.svg" />
  <meta property="og:site_name" content="MyBook.Pk" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(district.name)} District — MyBook.Pk" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${SITE}/images/flag-pakistan.svg" />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
  ${schemaScript({ "@context": "https://schema.org", "@type": "WebPage", name: `${district.name} District, ${province.name}`, description, url: `${SITE}/${route}`, about: { "@type": "AdministrativeArea", name: `${district.name} District` }, isPartOf: { "@type": "WebSite", name: "MyBook.Pk", url: `${SITE}/` } })}
  ${schemaScript(breadcrumbs)}
</head>
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <p style="opacity:.9"><a href="index.html" style="color:#fff">Home</a> · <a href="${provinceRoutes[province.id]}" style="color:#fff">${esc(province.name)}</a></p>
    <h1>${esc(district.name)} District</h1>
    <p>Headquarters: ${esc(district.hq)} · ${esc(district.pop)} · ${esc(province.name)}</p>
  </div></div>
  <section><div class="container prose">
    <p>${esc(district.about)}</p>
    <h2>District quick facts</h2><div class="grid-2"><div><p><strong>Province:</strong> ${esc(province.name)}</p><p><strong>Headquarters:</strong> ${esc(district.hq)}</p><p><strong>Population:</strong> ${district.population_2023 ? formatNumber(district.population_2023) : esc(district.pop)} (2023)</p><p><strong>Area:</strong> ${district.area_km2 ? formatNumber(district.area_km2) + " km²" : "See PBS"}</p><p><strong>Population density:</strong> ${district.density_2023 ? district.density_2023.toFixed(2) + " people/km²" : "See PBS"}</p><p><strong>Urban proportion:</strong> ${district.urban_proportion_2023 != null ? district.urban_proportion_2023.toFixed(2) + "%" : "See PBS"}</p></div><div><p><strong>Primary statistical source:</strong> Pakistan Bureau of Statistics</p><p><a href="https://www.pbs.gov.pk/result-excel/" rel="noopener">Check the PBS 2023 district tables →</a></p><p class="meta">Always distinguish district population from city population when comparing figures.</p></div></div>
    <h2>Education</h2><p>${esc(district.education)}</p>
    <h2>Hospitals and healthcare</h2><p>${esc(district.health)}</p>
    <h2>Culture and geography</h2><p>${esc(district.culture)}</p>
    <h2>Public issues</h2><p>${esc(district.issues)}</p><h2>Related reading</h2><p><a href="${esc(provinceRoutes[province.id])}">${esc(province.name)} overview</a> · <a href="districts-of-pakistan.html">Districts of Pakistan</a> · <a href="provinces-of-pakistan.html">Provinces and territories of Pakistan</a></p>
    <h2>Villages and local places</h2><p>${esc(district.villages)}</p>
    <section class="source-box"><h2>Sources and verification</h2><p>Population and other census statistics should be read at the district level. The primary statistical reference is the Pakistan Bureau of Statistics 2023 Census district tables and district reports.</p><p><a href="https://www.pbs.gov.pk/result-excel/" rel="noopener">PBS 2023 detailed tables →</a> · <a href="https://www.pbs.gov.pk/censusarchive/" rel="noopener">PBS district census archive →</a></p><p class="meta"><strong>Last reviewed:</strong> 28 September 2026. If a figure is not available in the cited official dataset, this page does not invent an estimate.</p></section>
  </div></section>
  <div id="site-footer"></div>
  <script src="js/app.js"></script>
</body>
</html>
`;
}

function hubPage(title, intro, links, canonicalPath) {
  const description = intro.slice(0, 155);
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "MyBook.Pk", item: SITE + "/provinces.html" },
      { "@type": "ListItem", position: 3, name: title, item: SITE + "/" + canonicalPath }
    ]
  };
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${ADSENSE_SCRIPT}
  ${ADSENSE_META}
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} | MyBook.Pk</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${SITE}/${canonicalPath}" />
  <meta property="og:title" content="${esc(title)} | MyBook.Pk" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${SITE}/${canonicalPath}" />
  <meta property="og:image" content="${SITE}/images/flag-pakistan.svg" />
  <meta property="og:site_name" content="MyBook.Pk" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(title)} | MyBook.Pk" />
  <meta name="twitter:description" content="${esc(description)}" />
  <link rel="stylesheet" href="css/style.css" />
  ${schemaScript(breadcrumb)}
</head>
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <p><a href="index.html" style="color:#fff">Home</a> · MyBook.Pk</p>
    <h1>${esc(title)}</h1>
    <p>${esc(intro)}</p>
  </div></div>
  <main class="container prose">
    <div class="trust-box">
      <strong>Editorial note</strong>
      <p>MyBook.Pk separates reference data from editorial description. Population and administrative figures are labelled by year and should be checked against the latest official Pakistan Bureau of Statistics material before formal use.</p>
    </div>
    <div class="grid-3">${links.map(link => `
      <article class="card"><div class="card-body">
        <h2><a href="${esc(link.href)}">${esc(link.name)}</a></h2>
        <p>${esc(link.summary)}</p>
      </div></article>`).join("")}</div>
    <section>
      <h2>Sources and editorial method</h2>
      <p>Primary statistical references should be Pakistan Bureau of Statistics and relevant provincial or territorial government sources. When a current official figure is unavailable, MyBook.Pk should say so rather than fill the gap with an estimate.</p>
    </section>
  </main>
  <div id="site-footer"></div>
  <script src="js/app.js"></script>
</body>
</html>`;
}

const hubRoutes = {
  provinces: "provinces-of-pakistan.html",
  districts: "districts-of-pakistan.html",
  punjab: "districts-of-punjab.html",
  sindh: "districts-of-sindh.html",
  kpk: "districts-of-khyber-pakhtunkhwa.html",
  balochistan: "districts-of-balochistan.html",
  gb: "districts-of-gilgit-baltistan.html",
  ajk: "districts-of-azad-kashmir.html",
  ict: "districts-of-islamabad-capital-territory.html"
};


function buildTehsilPages() {
  const priority = new Set(["lahore","faisalabad","rawalpindi","multan","gujranwala","sialkot","bahawalpur","peshawar","swat","quetta"]);
  for (const unit of provinces.units) {
    for (const district of districts[unit.id]?.districts || []) {
      if (!priority.has(district.slug) || !district.tehsils_2023?.length) continue;
      const route = `tehsils-of-${district.slug}.html`;
      const links = district.tehsils_2023.map(t => `
        <article class="card"><div class="card-body">
          <h2>${esc(t.name)} Tehsil</h2>
          <p><strong>Major town / locality:</strong> ${esc(t.major_towns)}</p>
          <p>This administrative unit is part of ${esc(district.name)} District in ${esc(district.division_2023)}.</p>
        </div></article>`).join("");
      const description = `Tehsils and major towns of ${district.name} District, ${unit.name}: ${district.tehsils_2023.map(t=>t.name).join(", ")}.`;
      const breadcrumb = schemaScript({
        "@context":"https://schema.org","@type":"BreadcrumbList",
        itemListElement:[
          {"@type":"ListItem","position":1,"name":"Home","item":`${SITE}/`},
          {"@type":"ListItem","position":2,"name":unit.name,"item":`${SITE}/${provinceRoutes[unit.id]}`},
          {"@type":"ListItem","position":3,"name":district.name+" District","item":`${SITE}/${districtHref({...district,provinceId:unit.id})}`},
          {"@type":"ListItem","position":4,"name":"Tehsils","item":`${SITE}/${route}`}
        ]
      });
      const page = `<!DOCTYPE html><html lang="en"><head>
${ADSENSE_SCRIPT}${ADSENSE_META}<meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Tehsils of ${esc(district.name)} District — ${esc(unit.name)} | MyBook.Pk</title>
<meta name="description" content="${esc(description)}"/><meta name="robots" content="index,follow,max-image-preview:large"/>
<link rel="canonical" href="${SITE}/${route}"/><meta property="og:title" content="Tehsils of ${esc(district.name)} District — MyBook.Pk"/>
<meta property="og:description" content="${esc(description)}"/><meta property="og:type" content="website"/><meta property="og:url" content="${SITE}/${route}"/>
<link rel="stylesheet" href="css/style.css"/>${breadcrumb}</head><body>
<div id="site-header"></div><div class="page-hero"><div class="container">
<p><a href="index.html" style="color:#fff">Home</a> · <a href="${provinceRoutes[unit.id]}" style="color:#fff">${esc(unit.name)}</a> · <a href="${districtHref({...district,provinceId:unit.id})}" style="color:#fff">${esc(district.name)} District</a></p>
<h1>Tehsils of ${esc(district.name)} District</h1><p>${esc(district.division_2023)} · 2023 administrative reference</p>
</div></div><section><div class="container prose">
<h2>${esc(district.name)} administrative structure</h2>
<p>${esc(district.name)} District is part of <strong>${esc(district.division_2023)}</strong>. The list below records the tehsils/subdivisions represented in the 2023 administrative reference data, together with associated major towns or localities.</p>
<div class="grid-3">${links}</div>
<h2>Related pages</h2><p><a href="${districtHref({...district,provinceId:unit.id})}">${esc(district.name)} District</a> · <a href="${provinceRoutes[unit.id]}">Districts of ${esc(unit.name)}</a> · <a href="districts-of-pakistan.html">Districts of Pakistan</a></p>
<section class="source-box"><h2>Source and date</h2><p>Administrative hierarchy follows Pakistan Bureau of Statistics 2023 census framework and district tables. <a href="https://www.pbs.gov.pk/gis/" rel="noopener">PBS administrative units 2023 →</a></p><p class="meta"><strong>Last reviewed:</strong> 28 September 2026. Administrative boundaries can change, so this page is explicitly dated.</p></section>
</div></section><div id="site-footer"></div><script src="js/app.js"></script></body></html>`;
      fs.writeFileSync(path.join(ROOT, route), page);
    }
  }
}

function buildHubs() {
  const provinceLinks = provinces.units.map(unit => ({
    name: unit.name,
    href: provinceRoutes[unit.id],
    summary: `${unit.name}: capital ${unit.capital}, 2023 population baseline and district reference pages.`
  }));
  fs.writeFileSync(path.join(ROOT, hubRoutes.provinces), hubPage(
    "Provinces and Territories of Pakistan — Names, Capitals & Facts",
    "A structured guide to Pakistan's provinces and administrative territories, with capitals, population baselines and links to district information.",
    provinceLinks, hubRoutes.provinces
  ));

  const allDistrictLinks = [];
  for (const unit of provinces.units) {
    for (const district of districts[unit.id]?.districts || []) {
      allDistrictLinks.push({
        name: `${district.name} District`,
        href: districtHref({ ...district, provinceId: unit.id }),
        summary: `${unit.name} · Headquarters: ${district.hq} · Public data note: ${district.pop}.`
      });
    }
  }
  fs.writeFileSync(path.join(ROOT, hubRoutes.districts), hubPage(
    "Districts of Pakistan — Complete Directory by Province",
    "Browse Pakistan's districts by province and territory, with headquarters, population notes and links to individual district pages.",
    allDistrictLinks, hubRoutes.districts
  ));

  for (const unit of provinces.units) {
    const links = (districts[unit.id]?.districts || []).map(district => ({
      name: `${district.name} District`,
      href: districtHref({ ...district, provinceId: unit.id }),
      summary: `Headquarters: ${district.hq}. Public data note: ${district.pop}.`
    }));
    fs.writeFileSync(path.join(ROOT, hubRoutes[unit.id]), hubPage(
      `Districts of ${unit.name} — List, Headquarters & Facts`,
      `Browse the districts of ${unit.name}, Pakistan, with headquarters, population notes and links to individual district pages.`,
      links, hubRoutes[unit.id]
    ));
  }
}

function upsertMetadata(fileName, html) {
  if (fileName === "province.html" || fileName === "district.html") return html;
  const canonical = SITE + "/" + (fileName === "index.html" ? "" : fileName);
  const title = (html.match(/<title>([^<]+)<\/title>/i) || [null, "MyBook.Pk"])[1].trim();
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [null, title])[1].replace(/<[^>]+>/g, "").trim();
  const descriptionMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"\s*\/?\s*>/i);
  const description = descriptionMatch ? descriptionMatch[1] : "Learn about " + h1 + " with facts, places, history and public information from MyBook.Pk.";
  let result = html;

  if (!/adsbygoogle\.js\?client=ca-pub-8924686927214586/i.test(result)) {
    result = result.replace(/<head>/i, "<head>\n  " + ADSENSE_SCRIPT + "\n  " + ADSENSE_META);
  } else if (!/name="google-adsense-account"/i.test(result)) {
    result = result.replace(/<head>/i, "<head>\n  " + ADSENSE_META);
  }

  const robotsTag = '<meta name="robots" content="index,follow,max-image-preview:large" />';
  if (/<meta\s+name="robots"[^>]*>/i.test(result)) {
    result = result.replace(/<meta\s+name="robots"[^>]*>/i, robotsTag);
  } else if (/<meta\s+name="description"[^>]*>/i.test(result)) {
    result = result.replace(/<meta\s+name="description"[^>]*>/i, "$&\n  " + robotsTag);
  } else {
    result = result.replace(/<title>[^<]*<\/title>/i, "$&\n  " + robotsTag);
  }

  if (!/<meta\s+name="description"/i.test(result)) {
    const descriptionTag = '<meta name="description" content="' + esc(description) + '" />';
    result = result.replace(/<title>[^<]*<\/title>/i, "$&\n  " + descriptionTag);
  }

  if (/<link\s+rel="canonical"/i.test(result)) {
    result = result.replace(/<link\s+rel="canonical"[^>]*>/i, '<link rel="canonical" href="' + canonical + '" />');
  } else {
    const canonicalTag = '<link rel="canonical" href="' + canonical + '" />';
    result = result.replace(/<meta\s+name="description"[^>]*>/i, "$&\n  " + canonicalTag);
  }

  result = result.replace(/province\.html\?id=(ict|punjab|kpk|sindh|balochistan|gb|ajk)/g, function(_, id) {
    return provinceRoutes[id];
  });
  return result;
}

function generateSitemap() {
  const excluded = new Set([
    "province.html", "district.html", "404.html", "google316eb4b51e11f5de.html",
    "bajur.html", "dgkhan.html", "dikhan.html", "rykhan.html", "nankana.html", "tts.html", "lakki.html",
    "news.html"
  ]);
  const urls = fs.readdirSync(ROOT)
    .filter(name => name.endsWith(".html") && !excluded.has(name))
    .filter(name => !name.includes("?"))
    .sort()
    .map(name => `${SITE}/${name === "index.html" ? "" : name}`);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${url}</loc></url>`).join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), xml);
  return urls.length;
}

const provinces = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "provinces.json"), "utf8"));
const districts = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "districts.json"), "utf8"));
for (const [provinceId, data] of Object.entries(districts)) {
  const province = provinces.units.find((unit) => unit.id === provinceId);
  for (const district of data.districts || []) {
    const filePath = path.join(ROOT, `${district.slug}.html`);
    if (province && !fs.existsSync(filePath)) fs.writeFileSync(filePath, districtPage(district, province));
  }
}
for (const [provinceId, data] of Object.entries(districts)) {
  for (const district of data.districts || []) {
    const fileName = `${district.slug}.html`;
    if (fs.existsSync(path.join(ROOT, fileName))) {
      staticBreadcrumbs.set(fileName, {
        province: provinceNames[provinceId],
        provinceRoute: provinceRoutes[provinceId],
        district: district.name
      });
    }
  }
}
for (const unit of provinces.units) {
  fs.writeFileSync(path.join(ROOT, provinceRoutes[unit.id]), provincePage(unit, districts));
}
buildHubs();
buildTehsilPages();
buildHubs();
for (const fileName of fs.readdirSync(ROOT).filter((name) => name.endsWith(".html"))) {
  const filePath = path.join(ROOT, fileName);
  const original = fs.readFileSync(filePath, "utf8");
  const updated = upsertMetadata(fileName, original);
  if (updated !== original) fs.writeFileSync(filePath, updated);
}
const count = generateSitemap();
console.log(`Generated ${Object.keys(provinceRoutes).length} province pages and ${count} sitemap URLs.`);