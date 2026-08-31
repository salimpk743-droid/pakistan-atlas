# Pakistan Atlas

A static educational website about Pakistan’s provinces, districts, culture, universities and hospitals. Built as plain HTML, CSS and JavaScript so you can host it free on **Vercel** from a **GitHub** repository.

Home page layout matches the brief:

- Welcome to Pakistan banner
- National flag in the centre
- Allama Iqbal on the **left**
- Quaid-e-Azam on the **right**

Replace the placeholder portraits in `images/` with your own files. Keep the same file names.

## Folder map

```
pakistan-atlas/
  index.html
  provinces.html
  districts.html
  culture.html
  education.html
  health.html
  news.html
  about.html
  contact.html
  privacy.html
  terms.html
  disclaimer.html
  ads.txt
  robots.txt
  sitemap.xml
  vercel.json
  css/style.css
  js/app.js
  data/provinces.json
  images/
```

## Put it on GitHub + Vercel

1. Create a free GitHub account if you do not have one.
2. Create a new repository named `pakistan-atlas` (Public).
3. Upload this whole folder, or use Git:

```bash
cd pakistan-atlas
git init
git add .
git commit -m "First version of Pakistan Atlas"
git branch -M main
git remote add origin https://github.com/YOUR-USER/pakistan-atlas.git
git push -u origin main
```

4. Open [vercel.com](https://vercel.com) → Import Git Repository → select `pakistan-atlas`.
5. Framework preset: **Other**. Output directory: leave empty. Click Deploy.
6. You will get a URL like `pakistan-atlas.vercel.app`.

## Custom domain later

When you buy a name (examples: `pakistanatlas.pk`, `harzilapakistan.com`):

- In Vercel → Project → Settings → Domains → add the name.
- At your registrar, add the A / CNAME records Vercel shows.
- After HTTPS is green, replace `YOUR-DOMAIN.com` inside `robots.txt` and `sitemap.xml`.

Cheap reputable registrars for `.com` work worldwide. For `.pk` use PKNIC accredited registrars.

## Google AdSense — do this in order

AdSense rarely approves an empty pretty template. Do the content work first.

1. Replace `editor@example.com` on Contact and Privacy with your real email.
2. Replace portraits and province photos.
3. Add **at least 15–25 original articles** (district stories, festival explainers, university guides). Aim for 800+ words, your own sentences, named sources (PBS, HEC, provincial sites).
4. Keep Privacy, About, Contact, Disclaimer linked in the footer (already done).
5. Site must be on a real domain, not only a preview URL, when you apply.
6. You must be 18+. Use a bank account / payment profile Google accepts in Pakistan.
7. After approval, Google gives a `ca-pub-` code. Paste the script in every page `<head>` and replace the dashed “Advertisement space” boxes with the official ad unit.
8. Replace `ads.txt` with the exact line from AdSense.

Do not click your own ads. Do not hide ads over text. Do not copy Wikipedia pages.

## How to add a district

Edit `data/provinces.json` → `district_samples` array:

```json
{
  "province": "Punjab",
  "name": "Chakwal",
  "pop": 1720000,
  "note": "Salt Range district. Add colleges and DHQ here."
}
```

Drop a photo at `images/villages/chakwal.jpg`.

## Colours

Green `#01411C`, gold `#C9A227`, cream page. Change them in `css/style.css` under `:root`.

## Honest limits of this first version

- District list is a starter set, not all 160+.
- University and hospital counts are narrative, not a scraped national table.
- News page is a method, not a live agency feed.
- You should sit with official PBS / HEC sheets and type them in so the site stays authentic.

That slow typing is what makes AdSense and students both trust the site.
