# One-off helper used to build data/sources/pbs-2023-table2-urban-localities.json.
# Input: `pdftotext -layout` output of PBS 2023 census Table 2 (urban localities by population size),
# https://www.pbs.gov.pk/wp-content/uploads/census_tables/tables/table_2_<prov>_districts.pdf, saved as
# t2_<prov>_districts.txt. Rows that pdftotext wraps over several lines (some Karachi corporations) are not
# parsed; scripts/tools/import-pbs-2023.js only publishes a district's list when the parsed localities add
# up exactly to the district's urban population. Not part of the CI pipeline.
import re, json, sys
NUMS = r'([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,-]+)\s+([\d,-]+)\s+(-\s*[\d.]+|[\d.]+|-)\s+([\d.]+|-)\s*$'
ROW2 = re.compile(r'^\s+([A-Z][^\d]*?)\s{2,}' + NUMS)   # locality name wrapped onto the previous line
BARE = re.compile(r"^([A-Z][A-Z .'()&/-]+[A-Z)])\s*$")
ROW = re.compile(r'^(\S.*?)\s{2,}([A-Z][^\d]*?)\s{2,}([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,-]+)\s+([\d,-]+)\s+(-\s*[\d.]+|[\d.]+|-)\s+([\d.]+|-)\s*$')
out = {}
for prov in ["punjab", "sindh", "kp", "balochistan"]:
    cur = None; res = {}; pending = None
    for ln in open(f"t2_{prov}_districts.txt").read().splitlines():
        h = re.match(r'^\s{10,}([A-Z][A-Z .\'()&/-]+ DISTRICT)\s*$', ln)
        if h: cur = h.group(1).strip(); res.setdefault(cur, []); continue
        m = ROW.match(ln)
        if m and cur:
            res[cur].append(dict(name=re.sub(r'\s+', ' ', m.group(1)), tehsil=re.sub(r'\s+', ' ', m.group(2)), population_2023=int(m.group(3).replace(',', ''))))
            pending = None; continue
        m2 = ROW2.match(ln)
        if m2 and cur and pending:
            res[cur].append(dict(name=pending, tehsil=re.sub(r'\s+', ' ', m2.group(1)), population_2023=int(m2.group(2).replace(',', ''))))
            pending = None; continue
        b = BARE.match(ln)
        pending = b.group(1).strip() if b and cur and not ln.startswith(' ') else None
    out[prov] = res
json.dump(out, open(sys.argv[1], "w"), indent=1)
print({p: (len(v), sum(len(x) for x in v.values())) for p, v in out.items()})
