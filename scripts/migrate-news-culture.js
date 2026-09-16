const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://pakistan-atlas.vercel.app";

const latestPath = path.join(ROOT, "latest-news.html");
const culturePath = path.join(ROOT, "culture.html");
const appPath = path.join(ROOT, "js", "app.js");
const sitemapPath = path.join(ROOT, "scripts", "generate-sitemap.js");

// Only migrate when latest-news.html is genuinely the old Culture archive.
// Do not trigger merely because the Current News page links to Culture.
if (fs.existsSync(latestPath)) {
  const latest = fs.readFileSync(latestPath, "utf8");
  const isLegacyCultureArchive = /<title>\s*Pakistan Culture &amp; Society\s*\|\s*Traditions, Food, Music &amp; Heritage\s*<\/title>/i.test(latest)
    && /<h1[^>]*>\s*Pakistan Culture &amp; Society\s*<\/h1>/i.test(latest);

  if (isLegacyCultureArchive) {
    let culture = latest
      .replace(/https:\/\/pakistan-atlas\.vercel\.app\/latest-news\.html/g, `${SITE}/culture.html`)
      .replace(/href="latest-news\.html"/g, 'href="culture.html"')
      .replace(/href='latest-news\.html'/g, "href='culture.html'")
      .replace(/\b(latest-news\.html)\b/g, "culture.html");

    culture = culture.replace(/<meta name="robots"[^>]*>\s*/i, "");
    culture = culture.replace(/<meta http-equiv="refresh"[^>]*>\s*/i, "");
    fs.writeFileSync(culturePath, culture, "utf8");

    const news = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#01411c">
  <title>Pakistan Current News &amp; Public Updates | Pakistan Atlas</title>
  <meta name="description" content="A Pakistan Atlas starting point for current news, public updates, official announcements and reliable sources. Headlines change frequently; use the linked sources for the latest reports.">
  <link rel="canonical" href="${SITE}/latest-news.html">
  <link rel="icon" href="favicon.svg" type="image/svg+xml">
  <meta property="og:title" content="Pakistan Current News &amp; Public Updates | Pakistan Atlas">
  <meta property="og:description" content="Current Pakistan news and public-update sources, with links to established news organisations and official information channels.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE}/latest-news.html">
  <meta property="og:site_name" content="Pakistan Atlas">
  <meta property="og:locale" content="en_PK">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Pakistan Current News &amp; Public Updates | Pakistan Atlas">
  <meta name="twitter:description" content="A current-news starting point for Pakistan Atlas. Follow the linked sources for live headlines and official updates.">
  <link rel="stylesheet" href="css/style.css?v=7">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"CollectionPage","name":"Pakistan Current News & Public Updates","url":"${SITE}/latest-news.html","description":"A current-news and public-updates starting point for Pakistan Atlas.","isPartOf":{"@type":"WebSite","name":"Pakistan Atlas","url":"${SITE}/"},"inLanguage":["en","ur"]}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Current News","item":"${SITE}/latest-news.html"}]}
  </script>
</head>
<body>
  <div id="site-header"></div>
  <main id="main-content">
    <section class="page-hero">
      <div class="container">
        <p class="eyebrow">Pakistan Atlas · Current News</p>
        <h1>Pakistan Current News &amp; Public Updates</h1>
        <p>Use this page as a reliable starting point for current Pakistan news, public announcements and major developments. Because headlines change throughout the day, the source links below take you to the latest reporting rather than reproducing stale headlines here.</p>
      </div>
    </section>
    <section>
      <div class="container prose">
        <h2>Latest reporting</h2>
        <div class="archive-grid">
          <article class="archive-card"><h3>National news</h3><p>Follow established Pakistani news organisations for the latest national reports, politics, economy and public affairs.</p><p><a href="https://www.dawn.com/" rel="noopener noreferrer">Dawn</a> · <a href="https://www.geo.tv/" rel="noopener noreferrer">Geo News</a> · <a href="https://www.bbc.com/urdu" rel="noopener noreferrer">BBC Urdu</a></p></article>
          <article class="archive-card"><h3>Official updates</h3><p>For government announcements, statistics and official notices, check the relevant public institution directly.</p><p><a href="https://www.pakistan.gov.pk/" rel="noopener noreferrer">Government of Pakistan</a> · <a href="https://www.pbs.gov.pk/" rel="noopener noreferrer">Pakistan Bureau of Statistics</a></p></article>
          <article class="archive-card"><h3>Business &amp; economy</h3><p>Use established financial and national news sources for current market, trade, inflation and economic reporting.</p><p><a href="https://www.dawn.com/business" rel="noopener noreferrer">Dawn Business</a> · <a href="https://www.reuters.com/world/asia-pacific/" rel="noopener noreferrer">Reuters Asia-Pacific</a></p></article>
          <article class="archive-card"><h3>Culture &amp; heritage</h3><p>For the educational Pakistan Atlas archive covering traditions, languages, food, music, crafts and heritage, visit Culture.</p><p><a href="culture.html">Pakistan Culture &amp; Society</a></p></article>
        </div>
        <h2>About this page</h2>
        <p>Pakistan Atlas is an educational project. This page deliberately avoids presenting old headlines as if they were current. Always check the linked publisher or official institution for the latest information, publication date and full context.</p>
        <div class="urdu" lang="ur" dir="rtl"><h2>حالیہ خبریں اور عوامی معلومات</h2><p>یہ صفحہ پاکستان کی موجودہ خبروں اور سرکاری معلومات کے لیے قابلِ اعتماد ذرائع تک رسائی کا نقطۂ آغاز ہے۔ تازہ سرخیوں کے لیے متعلقہ خبر رساں ادارے یا سرکاری ادارے کی ویب سائٹ دیکھیں۔</p></div>
      </div>
    </section>
  </main>
  <div id="site-footer"></div>
  <script src="js/app.js?v=3"></script>
</body>
</html>
`;
    fs.writeFileSync(latestPath, news, "utf8");
    console.log("Migrated the legacy Culture archive to culture.html and created Current News at latest-news.html.");
  }
}

// Restore the intended main navigation without removing any existing section.
if (fs.existsSync(appPath)) {
  let app = fs.readFileSync(appPath, "utf8");
  app = app.replace(
    /const NAV = \[[\s\S]*?\];/,
    `const NAV = [
  ["index.html", "Home"],
  ["latest-news.html", "Current News"],
  ["culture.html", "Culture"],
  ["current-affairs.html", "Literature"],
  ["politics.html", "Geography"],
  ["sports.html", "Sports"],
  ["history.html", "History"],
  ["showbiz.html", "Showbiz"],
  ["about.html", "About"]
];`
  );
  fs.writeFileSync(appPath, app, "utf8");
}

// Culture is now a real canonical indexable page, so it belongs in the sitemap.
if (fs.existsSync(sitemapPath)) {
  let sitemap = fs.readFileSync(sitemapPath, "utf8");
  sitemap = sitemap.replace('  "culture.html",\n', "");
  fs.writeFileSync(sitemapPath, sitemap, "utf8");
}
