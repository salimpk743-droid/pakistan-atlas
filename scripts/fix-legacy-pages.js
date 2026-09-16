const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const redirects = {
  "culture.html": "latest-news.html",
  "news.html": "latest-news.html"
};

for (const [file, target] of Object.entries(redirects)) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const html = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <meta http-equiv="refresh" content="0;url=${target}" />\n  <link rel="canonical" href="https://pakistan-atlas.vercel.app/${target}" />\n  <meta name="robots" content="noindex,follow" />\n  <title>Pakistan Atlas — Redirecting</title>\n</head>\n<body>\n  <p>This page has moved. <a href="${target}">Continue to the current page</a>.</p>\n</body>\n</html>\n`;
  fs.writeFileSync(full, html);
}
