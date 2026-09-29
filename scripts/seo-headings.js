// Keyword-rich H2 headings on hand-written district pages (idempotent).
// Adds the district name to H2s in the page's own (hand-written) content so each heading matches search intent,
// e.g. "Famous People" -> "Famous People from Swat District", "Places to Visit" -> "Tourist Places in Swat".
// Body text is never changed and no words are removed: a heading is only extended. A heading that already names
// the district, one of its tehsils or its headquarters is left as it is, so running this step again changes nothing.
// Pipeline-generated blocks (<!-- mb:...:start/end -->), headings with an id, headings containing markup and
// Urdu headings are skipped.
const fs = require("fs");
const path = require("path");
const L = require("./lib/site");

// Restored alias pages share the district data of their main page.
const ALIASES = {
  "bajur": "bajaur", "dgkhan": "dera-ghazi-khan", "dikhan": "dera-ismail-khan", "rykhan": "rahim-yar-khan",
  "nankana": "nankana-sahib", "tts": "toba-tek-singh", "lakki": "lakki-marwat", "nwa": "north-waziristan",
  "lower-chitral": "chitral-lower", "upper-chitral": "chitral-upper", "mandi-bahauddin": "mbdin"
};

// Whole-heading categories -> keyword-rich heading. {D} = "Swat District", {S} = "Swat".
const RULES = [
  [/^(famous|notable|known|prominent|important)\s+(people|persons|personalities|names|figures)$/i, "Famous People from {D}"],
  [/^(people|personalities|notable people and personalities|famous personalities|famous people and personalities)$/i, "Famous People from {D}"],
  [/^people the city keeps$/i, "Famous People from {D}: $&"],
  [/^(people|names|personalities) (from|of) (this|the) (district|city|valley|region|area)$/i, "Famous People from {D}"],
  [/^tourism and things to see$/i, "Tourist Places and Things to See in {S}"],
  [/^(places to visit|tourist places|tourist attractions|attractions|things to see|tourism|sightseeing|places of interest|places to see)$/i, "Tourist Places in {S}"],
  [/^(tehsils?|talukas?|subdivisions|tehsils and subdivisions|administrative units|administrative divisions)$/i, "$& of {D} (List)"],
  [/^(history|historical background|brief history|a brief history)$/i, "History of {S}: $&"],
  [/^(geography|geography and climate|climate|landscape|physical geography)$/i, "$& of {S}"],
  [/^(culture|culture and traditions|culture and heritage|traditions|heritage|festivals|music|dress|crafts|handicrafts)$/i, "$& of {S}"],
  [/^(food|cuisine|kitchens|local food|traditional food|food and cuisine)$/i, "$& of {S}"],
  [/^(language|languages|languages spoken)$/i, "$& of {D}"],
  [/^(economy|trade|industry|agriculture|education|schools|health|healthcare|hospitals|schools and hospitals|transport|roads|population|demography|demographics)$/i, "$& in {D}"],
  [/^(overview|introduction|at a glance|key facts|quick facts|facts)$/i, "{D}: $&"],
  [/^(the )?(two|three|four|five|six|seven|eight|nine|ten) (tehsils|talukas|subdivisions)$/i, "$& of {D} (List)"],
  [/^(famous people and cultural figures|famous people and personalities|notable people and families)$/i, "$& from {D}"],
  [/^(people who belong|people this district is known for|famous and notable associations|famous and nationally significant associations)$/i, "Famous People from {D}: $&"],
  [/^(culture and geography|language and culture|languages and culture|culture and languages|tourism and heritage)$/i, "$& of {S}"],
  [/^(villages and local places|public issues|population and headquarters|hospitals and healthcare|transport and connectivity|roads and connectivity|major challenges|development opportunities|development priorities|religion|religion and communities|religion and community|religion and community life|agriculture|livestock|literacy and education|population and demographics|public issues and future development|named places|important places|important places and areas|important places and themes|towns and named places|schools and the hospital|school and hospital|road, school, hospital|work|speech|tourism potential|tourism and places to explore|climate and environment)$/i, "$& in {D}"],
  [/^(sources|sources and references)$/i, "$& for {D}"],
];

function nameForms(d) {
  const base = d.name.replace(/\s+District$/i, "").trim();
  const forms = new Set([base, d.name, L.cleanHq(d.hq || "")]);
  for (const u of L.unitsOf(d)) forms.add(String(u.name || "").replace(/\s+(Tehsil|Taluka|Subdivision|Sub-Division)$/i, ""));
  for (const t of d.tehsils_2023 || []) forms.add(String(t.name || "").replace(/\s*\(.*$/, ""));
  return { D: L.districtLabel(d), S: base, forms: [...forms].filter((x) => x && x.length >= 3) };
}

function rename(text, n) {
  const m = text.match(/^(\s*\d+[.)]\s*)?([\s\S]*?)\s*$/);
  const num = m[1] || "", h = m[2];
  const plain = L.decodeEntities(h).toLowerCase();
  if (n.forms.some((f) => plain.includes(f.toLowerCase()))) return null;
  for (const [re, tpl] of RULES) {
    if (re.test(L.decodeEntities(h).trim())) {
      const out = tpl.replace("$&", () => h).replace("{D}", L.esc(n.D)).replace("{S}", L.esc(n.S));
      return num + out;
    }
  }
  const lead = h.match(/^\s*/)[0];
  return `${num}${lead}${L.esc(n.S)}${/:/.test(h) ? " –" : ":"} ${h.slice(lead.length)}`;
}

function processHtml(html, d) {
  const n = nameForms(d);
  // Ranges that belong to generated blocks or restored notices are not touched.
  const skip = [];
  for (const m of html.matchAll(/<!-- (mb:[a-z-]+):start -->[\s\S]*?<!-- \1:end -->/g)) skip.push([m.index, m.index + m[0].length]);
  for (const m of html.matchAll(/<section class="swat-split-notice"[\s\S]*?<\/section>/g)) skip.push([m.index, m.index + m[0].length]);
  const body = html.indexOf("<body");
  return html.replace(/<h2(\s[^>]*)?>([^<]+)<\/h2>/g, (all, attrs = "", text, at) => {
    if (at < body || skip.some(([a, b]) => at >= a && at < b)) return all;
    if (/\bid\s*=/.test(attrs) || /lang\s*=\s*["']ur/.test(attrs)) return all;
    if (/[\u0600-\u06FF]/.test(text)) return all;
    const out = rename(text, n);
    return out ? `<h2${attrs}>${out}</h2>` : all;
  });
}

function run() {
  let changed = 0;
  const pages = [...L.districtIndex].map(([slug, info]) => [slug, info.district]);
  for (const [alias, main] of Object.entries(ALIASES)) {
    const info = L.districtIndex.get(main);
    if (info) pages.push([alias, info.district]);
  }
  for (const [slug, d] of pages) {
    const file = path.join(L.ROOT, `${slug}.html`);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, "utf8");
    const out = processHtml(html, d);
    if (out !== html) { fs.writeFileSync(file, out); changed++; }
  }
  console.log(`Keyword-rich headings: ${changed} pages updated.`);
}

if (require.main === module) run();
module.exports = { run, processHtml };
