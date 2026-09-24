const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mybook.pk";

const provinces = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "provinces.json"), "utf8"));
const districts = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "districts.json"), "utf8"));

const provinceRoutes = {
  punjab: "punjab.html",
  sindh: "sindh.html",
  kpk: "khyber-pakhtunkhwa.html",
  balochistan: "balochistan.html",
  gb: "gilgit-baltistan.html",
  ajk: "azad-kashmir.html",
  ict: "islamabad-capital-territory.html"
};

const provinceById = Object.fromEntries(provinces.units.map((unit) => [unit.id, unit]));
const districtMap = new Map();

for (const [provinceId, data] of Object.entries(districts)) {
  for (const district of data.districts || []) {
    districtMap.set(district.slug, { district, province: provinceById[provinceId], provinceId });
  }
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function replaceTag(html, regex, replacement) {
  return regex.test(html) ? html.replace(regex, replacement) : html;
}

function optimizeMetadata(html, info) {
  const { district, province, provinceId } = info;
  const name = district.name;
  const provinceName = province.name;

  // Keep editorially customized titles. Replace only the old generated pattern.
  const oldTitle = /<title>[^<]*District,?[^<]*— Population, Services &amp; Facts \| MyBook\.Pk<\/title>/i;
  const title = `<title>${esc(name)} District, ${esc(provinceName)} — History, Culture &amp; Facts | MyBook.Pk</title>`;
  html = replaceTag(html, oldTitle, title);

  // Replace only the old generated description; preserve editorially written descriptions.
  const oldDescription = /<meta\s+name="description"\s+content="Learn about [^"]+ District in [^"]+, including population, headquarters, education, health, culture, public issues and local places\."\s*\/?\s*>/i;
  const about = String(district.about || "").replace(/\s+/g, " ").trim();
  const lead = about ? about.replace(/\.$/, "") : `Explore ${name} District in ${provinceName}`;
  const descriptionText = `${lead}. Population, headquarters, education, healthcare, culture, geography and local places.`;
  const description = `<meta name="description" content="${esc(descriptionText)}" />`;
  html = replaceTag(html, oldDescription, description);

  // Add a concise search-intent summary only to pages that do not already have a rich editorial structure.
  // Preserve custom editorial pages while improving thin/generated district pages.
  if (!/<h2[^>]*>[^<]*(at a glance|quick facts|population and area|schools and hospitals|history)[^<]*<\\/h2>/i.test(html)) {
    const summary = `
    <section class="district-search-answers" aria-labelledby="district-search-answers">
      <h2 id="district-search-answers">${esc(name)} District: Quick Answers</h2>
      <dl>
        <dt>Population</dt><dd>${esc(district.pop || "See the latest Pakistan Bureau of Statistics census table.")}</dd>
        <dt>Headquarters / main city</dt><dd>${esc(district.hq || "See the district profile.")}</dd>
        <dt>Province / territory</dt><dd>${esc(provinceName)}</dd>
        <dt>Famous for</dt><dd>${esc(about || "Its local history, communities and geography.")}</dd>
        <dt>Geography</dt><dd>${esc(about || "The district's landscape and settlement pattern are described below.")}</dd>
        <dt>Culture</dt><dd>${esc(district.culture || "Local culture and communities are described below.")}</dd>
        <dt>Education</dt><dd>${esc(district.education || "See the district's education information below.")}</dd>
        <dt>Healthcare</dt><dd>${esc(district.health || "See the district's healthcare information below.")}</dd>
        <dt>Villages / local areas</dt><dd>${esc(district.villages || "See the local places section below.")}</dd>
      </dl>
    </section>
`;
    const contentMarker = /(<div class="container prose">)/i;
    if (contentMarker.test(html)) html = html.replace(contentMarker, `$1${summary}`);
  }

  // Add contextual internal links once. These are navigation links, not keyword blocks.
  if (!html.includes('class="seo-related-reading"')) {
    const route = provinceRoutes[provinceId];
    const provinceDistricts = (districts[provinceId]?.districts || [])
      .filter((d) => fs.existsSync(path.join(ROOT, `${d.slug}.html`)));
    const currentIndex = provinceDistricts.findIndex((d) => d.slug === district.slug);
    const nearby = [];
    for (const offset of [-2, -1, 1, 2]) {
      const candidate = provinceDistricts[currentIndex + offset];
      if (candidate && candidate.slug !== district.slug) nearby.push(candidate);
    }

    const hubSlugs = {
      punjab: "lahore",
      sindh: "hyderabad",
      kpk: "peshawar",
      balochistan: "quetta",
      gb: "gilgit",
      ajk: "muzaffarabad",
      ict: "islamabad"
    };
    const hubSlug = hubSlugs[provinceId];
    const hub = provinceDistricts.find((d) => d.slug === hubSlug && d.slug !== district.slug);

    const relatedDistricts = [hub, ...nearby]
      .filter(Boolean)
      .filter((d, i, arr) => arr.findIndex((x) => x.slug === d.slug) === i)
      .slice(0, 5)
      .map((d) => `<li><a href="${esc(d.slug)}.html">${esc(d.name)} District</a></li>`)
      .join("");

    const block = `
    <section class="seo-related-reading" aria-labelledby="related-reading">
      <h2 id="related-reading">Explore More About ${esc(provinceName)}</h2>
      <p>Continue exploring this region through the province guide, national reference pages and other district profiles.</p>
      <ul>
        <li><a href="${esc(route)}">${esc(provinceName)} province guide</a></li>
        <li><a href="districts.html">All districts of Pakistan</a></li>
        <li><a href="geography.html">Pakistan geography</a></li>
        <li><a href="culture.html">Pakistan culture and heritage</a></li>
        <li><a href="history.html">Pakistan history</a></li>
        ${relatedDistricts}
      </ul>
    </section>
`;

    const marker = /\s*<\/div><\/section>\s*<div id="site-footer">/i;
    if (marker.test(html)) {
      html = html.replace(marker, `\n${block}  </div></section>\n  <div id="site-footer">`);
    } else {
      const footerMarker = /\s*<div id="site-footer">/i;
      if (footerMarker.test(html)) html = html.replace(footerMarker, `\n${block}\n  <div id="site-footer">`);
    }
  }

  return html;
}

let changed = 0;
let skipped = 0;

for (const [slug, info] of districtMap) {
  const file = `${slug}.html`;
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) {
    skipped++;
    continue;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const updated = optimizeMetadata(original, info);

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, "utf8");
    changed++;
  }
}

console.log(`Enhanced SEO metadata and contextual internal links on ${changed} district pages; skipped ${skipped} missing district files.`);
