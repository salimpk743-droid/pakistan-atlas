# Sets the google-adsense-account meta tag on every HTML page (moved unchanged from the inline step in
# .github/workflows/generate-sitemap.yml). NOTE: this publisher ID differs from ADSENSE_PUBLISHER in
# scripts/generate-seo.js (ca-pub-8924686927214586); see the PR notes. Neither ID has been changed.
from pathlib import Path
import re

tag = '<meta name="google-adsense-account" content="ca-pub-3672700167787763">'
verification = re.compile(r'^(google[0-9a-f]+|yandex_[0-9a-f]+|pinterest-[0-9a-f]+)\.html$', re.I)

for path in sorted(Path('.').rglob('*.html')):
    if any(part.startswith('.') for part in path.parts) or verification.match(path.name):
        continue
    text = path.read_text(encoding='utf-8')
    pattern = r'<meta\s+[^>]*google-adsense-account[^>]*>'
    if re.search(pattern, text, re.I):
        new = re.sub(pattern, tag, text, count=1, flags=re.I)
    elif re.search(r'</head\s*>', text, re.I):
        new = re.sub(r'</head\s*>', f'  {tag}\n</head>', text, count=1, flags=re.I)
    else:
        continue
    if new != text:
        path.write_text(new, encoding='utf-8')
