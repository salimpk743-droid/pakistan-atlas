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

  // Add contextual internal links once. These are navigation links, not keyword blocks.
  if (!html.includes('class="seo-related-reading"')) {
    const route = provinceRoutes[provinceId];
    const sameProvince = (districts[provinceId]?.districts || [])
      .filter((d) => d.slug !== district.slug && fs.existsSync(path.join(ROOT, `${d.slug}.html`)))
      .slice(0, 4);

    const relatedDistricts = sameProvince
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
