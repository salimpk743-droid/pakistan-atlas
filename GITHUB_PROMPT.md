# Prompt you can paste into GitHub Copilot, Cursor, v0 or another builder

Use this if you want another platform to extend the site. Keep the existing file names.

---

Build and improve a static educational website called **Pakistan Atlas**.

Purpose: authentic, calm, student-friendly knowledge about Pakistan so young people can learn every province and district. The site should also be ready for Google AdSense later (original articles, Privacy, About, Contact, Disclaimer, ads.txt).

Home page design (must keep):
- Full-width banner: “Welcome to Pakistan” / خوش آمدید پاکستان
- Flag of Pakistan in the centre
- Allama Muhammad Iqbal portrait on the LEFT
- Quaid-e-Azam Muhammad Ali Jinnah portrait on the RIGHT
- Deep Pakistan green (#01411C) and gold accents
- Clean serif headings, easy body text, mobile menu

Existing pages to keep: index, provinces, districts, culture, education, health, news, about, contact, privacy, terms, disclaimer.

Data lives in data/provinces.json. Do not invent fake exact campus counts. Use PBS 2023 census as the population baseline and write the year beside every figure.

Features to add next:
1. One HTML page per province generated from the JSON.
2. Search that filters districts as the user types (already started).
3. A villages gallery grid that reads filenames from images/villages/.
4. Urdu headings beside English titles.
5. Replace placeholder JPEGs when the owner uploads photos, without changing HTML file names.
6. Simple bilingual toggle later, but English remains the default for AdSense language support.

Do not add login, databases, or WordPress. Stay static so Vercel can deploy from GitHub with zero build step.

Never generate hate, communal ranking, medical prescriptions, or scraped news homepages.

---
