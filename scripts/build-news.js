#!/usr/bin/env node
// Weekly Sunday news builder for mybook.pk. See NEWS.md for the weekly routine.
//
// Inputs:  data/news.json                       (index of articles, newest first; never delete entries)
//          data/news/<yyyy-mm-dd>-<slug>.json    (one file per article: headline, sections, sources, Urdu summary)
// Outputs: news-<yyyy-mm-dd>-<slug>.html         (one raw article page per entry, at the site root)
//          pakistan-weekly-news.html             (archive page listing every article, newest first)
//          pakistan-current-affairs.html: only the text between <!-- mb:latest-news:start --> and
//          <!-- mb:latest-news:end --> is replaced (one "Latest news" line linking the article and the archive).
// The homepage (index.html) is NEVER read or written by this script (owner's instruction, 4 Oct 2026).
// build-site.js then adds the shared head tags, header, footer and breadcrumbs, exactly as for every other page.
// Deterministic and idempotent: the same data always produces byte-identical files.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = "https://mybook.pk";
const ARCHIVE = "pakistan-weekly-news.html";
const OG_IMAGE = `${SITE}/images/og/mybook-pk-1200x630.png`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const longDate = (iso) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const fileFor = (a) => `news-${a.date}-${a.slug}.html`;
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const NEVER_TOUCH = new Set(["index.html"]); // the homepage must not be changed by the news routine
function write(f, s) {
  if (NEVER_TOUCH.has(f)) throw new Error(`build-news: refusing to write ${f}`); const p = path.join(ROOT, f); if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== s) { fs.writeFileSync(p, s); console.log(`build-news: wrote ${f}`); } }

const HEAD_TOP = `  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3672700167787763" crossorigin="anonymous"></script>
  <meta name="google-adsense-account" content="ca-pub-3672700167787763">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-3QCG16GN6M"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-3QCG16GN6M');
  </script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#01411c" />`;
const FONTS = `  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css?v=7" />`;
const AUTHOR = { "@type": "Organization", name: "mybook.pk Editorial", url: `${SITE}/about.html` };
const PUBLISHER = { "@type": "Organization", name: "MyBook.pk", url: `${SITE}/`, logo: { "@type": "ImageObject", url: `${SITE}/images/mybook-pk-logo-512.png`, width: 512, height: 512 } };

function loadArticles() {
  const index = JSON.parse(read("data/news.json"));
  const list = index.articles.map((e) => {
    const a = JSON.parse(read(`data/news/${e.date}-${e.slug}.json`));
    if (a.date !== e.date || a.slug !== e.slug) throw new Error(`build-news: data/news/${e.date}-${e.slug}.json has date/slug ${a.date}/${a.slug}`);
    for (const k of ["headline", "short_headline", "title", "description", "summary", "lead", "published", "modified", "sections", "sources"]) if (!a[k]) throw new Error(`build-news: ${e.date}-${e.slug} is missing "${k}"`);
    return a;
  });
  const dates = list.map((a) => a.date);
  if (dates.some((d, i) => i && d > dates[i - 1])) throw new Error("build-news: data/news.json must be newest first");
  if (new Set(dates.map((d, i) => d + list[i].slug)).size !== list.length) throw new Error("build-news: duplicate entry in data/news.json");
  return list;
}

function articlePage(a, list) {
  const file = fileFor(a);
  const url = `${SITE}/${file}`;
  const ld = {
    "@context": "https://schema.org", "@type": "NewsArticle", headline: a.headline.slice(0, 110), description: a.description,
    datePublished: a.published, dateModified: a.modified, author: AUTHOR, publisher: PUBLISHER,
    mainEntityOfPage: { "@type": "WebPage", "@id": url }, image: [OG_IMAGE], articleSection: a.section || "Pakistan", inLanguage: "en-PK",
    isPartOf: { "@type": "CollectionPage", "@id": `${SITE}/${ARCHIVE}`, name: "Pakistan Weekly News" },
    citation: a.sources.map((s) => s.url)
  };
  const facts = (a.key_facts || []).map((f) => `        <li>${f}</li>`).join("\n");
  const sections = a.sections.map((s) => {
    let h = `\n      <h2 id="${esc(s.id)}">${esc(s.heading)}</h2>\n`;
    if (s.paragraphs) h += s.paragraphs.map((p) => `      <p>${p}</p>`).join("\n") + "\n";
    if (s.list) h += `      <ul>\n${s.list.map((li) => `        <li>${li}</li>`).join("\n")}\n      </ul>\n`;
    return h;
  }).join("");
  const sources = a.sources.map((s) => `        <li>${esc(s.outlet)}, ${esc(s.date)}: <a href="${esc(s.url)}" rel="noopener">${esc(s.title)}</a></li>`).join("\n");
  const urdu = a.urdu ? `
      <div class="urdu" lang="ur" dir="rtl">
        <h2 id="urdu-summary">${esc(a.urdu.heading || "خلاصہ")}</h2>
        <ul>
${a.urdu.points.map((p) => `          <li>${esc(p)}</li>`).join("\n")}
        </ul>
      </div>
` : "";
  const older = list.filter((x) => x.date < a.date).slice(0, 3);
  const more = older.length ? older.map((x) => `<a href="${fileFor(x)}">${esc(x.short_headline)}</a> (${longDate(x.date)})`).join(" · ") + ". " : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_TOP}
  <title>${esc(a.title)}</title>
  <meta name="description" content="${esc(a.description)}" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  <meta property="og:type" content="article" />
  <meta property="article:published_time" content="${a.published}" />
  <meta property="article:modified_time" content="${a.modified}" />
${FONTS}
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>${esc(a.headline)}</h1>
    <p>${esc(a.summary)}</p>
  </div></div>
  <section>
    <div class="container prose">
      <p class="meta">By <strong>mybook.pk Editorial</strong> · Published <time datetime="${a.published}">${longDate(a.published)}</time> · <strong>Updated <time datetime="${a.modified}" data-mb-updated>${esc(a.updated_label || longDate(a.modified))}</time></strong></p>
      <p class="lead-answer">${a.lead}</p>
${facts ? `
      <h2 id="key-facts">Key facts</h2>
      <ul>
${facts}
      </ul>
` : ""}${sections}${urdu}
      <h2 id="sources">Sources</h2>
      <p>Every fact, date and quotation above is taken from the dated reports listed here. Quotations are reproduced as published by these outlets. Spotted an error? Write to <a href="mailto:buildskillspk@gmail.com">buildskillspk@gmail.com</a> or use the <a href="contact.html">contact page</a>; see also <a href="sources-methodology.html">how we check facts</a>.</p>
      <ol>
${sources}
      </ol>

      <h2 id="more-news">More Pakistan news</h2>
      <p>${more}All weekly articles are listed in the <a href="${ARCHIVE}">Pakistan weekly news archive</a>. For a broader round-up of each week, with exam MCQs, see <a href="pakistan-current-affairs.html">Pakistan current affairs (weekly)</a>.</p>
    </div>
  </section>
  <div id="site-footer"></div>
  <script src="js/app.js?v=4"></script>
</body>
</html>
`;
}

function archivePage(list) {
  const latest = list[0];
  const items = list.map((a) => `        <li><a href="${fileFor(a)}">${esc(a.headline)}</a> <span class="meta">(<time datetime="${a.date}">${longDate(a.date)}</time>)</span>: ${esc(a.summary)}</li>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
${HEAD_TOP}
  <title>Pakistan Weekly News: Sunday Articles Archive | MyBook.pk</title>
  <meta name="description" content="Pakistan weekly news from mybook.pk: one detailed, sourced article on the week’s most important Pakistan story, published every Sunday. Full archive, newest first." />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <link rel="canonical" href="${SITE}/${ARCHIVE}" />
${FONTS}
</head>
<body>
  <div id="site-header"></div>
  <div class="page-hero"><div class="container">
    <h1>Pakistan Weekly News: Sunday Articles (Newest First)</h1>
    <p>Every Sunday we publish one detailed article on the most important Pakistan news story of the past week, checked against dated reports from Dawn, The Express Tribune, Geo News, APP, Reuters and official sources.</p>
  </div></div>
  <section>
    <div class="container prose">
      <p class="meta">By <strong>mybook.pk Editorial</strong> · Last updated <time datetime="${latest.date}" data-mb-updated>${longDate(latest.date)}</time></p>
      <p class="lead-answer">Latest news: <a href="${fileFor(latest)}"><strong>${esc(latest.headline)}</strong></a> (${longDate(latest.date)}).</p>

      <h2 id="archive">All weekly news articles</h2>
      <ol class="news-archive">
${items}
      </ol>

      <h2 id="how">How these articles are written</h2>
      <ul>
        <li>One story per week: the most important Pakistan news of the seven days up to the Sunday of publication.</li>
        <li>Only verified facts: every date, number and quotation comes from a dated report by a reliable outlet or an official source, and all sources are listed at the end of each article.</li>
        <li>Older articles are never deleted. Each one keeps its original date and shows the date it was last updated.</li>
        <li>For a wider weekly round-up with MCQs for exam preparation, see <a href="pakistan-current-affairs.html">Pakistan current affairs (weekly)</a>.</li>
        <li>Corrections: email <a href="mailto:buildskillspk@gmail.com">buildskillspk@gmail.com</a> or use the <a href="contact.html">contact page</a>.</li>
      </ul>
    </div>
  </section>
  <div id="site-footer"></div>
  <script src="js/app.js?v=4"></script>
</body>
</html>
`;
}

function replaceBlock(file, html, block) {
  const re = /<!-- mb:latest-news:start -->[\s\S]*?<!-- mb:latest-news:end -->/;
  if (!re.test(html)) throw new Error(`build-news: ${file} has no mb:latest-news markers`);
  return html.replace(re, `<!-- mb:latest-news:start -->${block}<!-- mb:latest-news:end -->`);
}

const list = loadArticles();
for (const a of list) write(fileFor(a), articlePage(a, list));
write(ARCHIVE, archivePage(list));
const latest = list[0];
// Current-affairs hub: one headline + link to the archive.
write("pakistan-current-affairs.html", replaceBlock("pakistan-current-affairs.html", read("pakistan-current-affairs.html"),
  `\n      <p class="lead-answer"><strong>Latest news (${longDate(latest.date)}):</strong> <a href="${fileFor(latest)}">${esc(latest.headline)}</a>. Every Sunday we publish one detailed news article; see the <a href="${ARCHIVE}">weekly news archive</a>.</p>\n      `));
