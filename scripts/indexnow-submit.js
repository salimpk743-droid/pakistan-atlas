#!/usr/bin/env node
// Submit changed pages to IndexNow (https://www.indexnow.org), which shares them with Bing, Yandex, Seznam,
// Naver and other participating search engines.
//
// Usage: node scripts/indexnow-submit.js <base-ref> [<head-ref>]   (head defaults to HEAD)
//        node scripts/indexnow-submit.js --dry-run <base-ref> [<head-ref>]
//
// Only canonical https://mybook.pk URLs of indexable pages that changed between the two commits are sent.
// No secret is needed: ownership is proven by the key file at the site root. Re-submitting an unchanged URL is
// harmless, so the step is safe to re-run. Optional env: INDEXNOW_WAIT_SECONDS (default 600) - how long to
// wait for the new version of the changed pages to be live before submitting.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const HOST = "mybook.pk";
const SITE = `https://${HOST}`;
const KEY = "0eeb43513893734597d9c7003b956d00";
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);
const dryRun = args[0] === "--dry-run";
if (dryRun) args.shift();
const base = args[0];
const head = args[1] || "HEAD";
if (!base) { console.error("usage: indexnow-submit.js [--dry-run] <base-ref> [<head-ref>]"); process.exit(2); }

const git = (a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" });
const changed = git(["diff", "--name-only", "--diff-filter=AMR", base, head, "--", "*.html"])
  .split("\n").map((s) => s.trim()).filter((f) => f && !f.includes("/"));

function canonicalOf(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return null;
  const html = fs.readFileSync(full, "utf8");
  if (/^google[0-9a-f]+\.html$/i.test(file)) return null;
  if (/<meta\s+name=["']robots["'][^>]*noindex/i.test(html)) return null;
  const m = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!m) return null;
  const url = m[1];
  const own = file === "index.html" ? `${SITE}/` : `${SITE}/${file}`;
  // Only self-canonical pages on the canonical host: a page that canonicalises elsewhere is not submitted.
  return url === own ? url : null;
}
const urls = [...new Set(changed.map(canonicalOf).filter(Boolean))];
console.log(`${changed.length} changed HTML files between ${base} and ${head}; ${urls.length} canonical URLs to submit.`);
if (!urls.length) process.exit(0);
if (dryRun) { urls.forEach((u) => console.log(u)); process.exit(0); }

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
async function live(url, file) {
  try {
    const r = await fetch(url, { cache: "no-store", headers: { "user-agent": "mybook-indexnow-check" } });
    if (!r.ok) return false;
    if (!file) return (await r.text()).trim() === KEY;
    return sha(await r.text()) === sha(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch (_) { return false; }
}
async function main() {
  // Wait until the key file and one changed page are served in their new form, so search engines crawl the new
  // version. If the deployment is slow, submit anyway after the timeout (IndexNow is only a hint to crawl).
  const probeFile = urls[0] === `${SITE}/` ? "index.html" : urls[0].slice(SITE.length + 1);
  const deadline = Date.now() + Number(process.env.INDEXNOW_WAIT_SECONDS || 600) * 1000;
  let ready = false;
  while (Date.now() < deadline) {
    if ((await live(KEY_LOCATION)) && (await live(urls[0], probeFile))) { ready = true; break; }
    await new Promise((r) => setTimeout(r, 20000));
  }
  console.log(ready ? "New version is live." : "Timed out waiting for the new version; submitting anyway.");
  let failed = false;
  for (let i = 0; i < urls.length; i += 10000) {
    const urlList = urls.slice(i, i + 10000);
    const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });
    // 200 = accepted, 202 = accepted, key validation pending, 429 = too many requests (not an error here).
    // 403 SiteVerificationNotCompleted is returned while IndexNow is still checking a new key file: retry a few
    // times, then only warn - the next push submits its own changes once verification has completed.
    for (let attempt = 1; ; attempt++) {
      const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body });
      const text = await r.text();
      console.log(`IndexNow responded ${r.status} for ${urlList.length} URLs (attempt ${attempt}).`);
      if ([200, 202, 429].includes(r.status)) break;
      if (r.status === 403 && /SiteVerificationNotCompleted/.test(text)) {
        if (attempt < 4) { await new Promise((res) => setTimeout(res, 60000)); continue; }
        console.warn(`::warning::IndexNow key verification is still pending; these URLs were not accepted: ${text}`);
        break;
      }
      failed = true; console.error(text); break;
    }
  }
  urls.forEach((u) => console.log(`  ${u}`));
  if (failed) process.exit(1);
}
main();
