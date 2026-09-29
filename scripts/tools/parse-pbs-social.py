# One-off helper used to build data/sources/pbs-2023-social-districts.json.
# Input: `pdftotext -layout` output of the PBS 2023 census district tables, saved as
#   t12_<prov>_districts.txt (Table 12: literacy rate, enrolment and out-of-school population) and
#   t11_<prov>_districts.txt (Table 11: population by mother tongue)
# from https://www.pbs.gov.pk/wp-content/uploads/census_tables/tables/table_{11,12}_<prov>_districts.pdf
# (<prov> = punjab, sindh, kp, balochistan). Names are kept as printed by PBS; units are matched to the
# Table 1 units by position in scripts/tools/import-pbs-2023-social.js. Not part of the CI pipeline.
import re, json, sys, os
LANGS = ["urdu","punjabi","sindhi","pashto","balochi","kashmiri","saraiki","hindko","brahvi","shina","balti","mewati","kalasha","kohistani","others"]
def nums(line):
    return [None if t == '-' else float(t.replace(',', '')) for t in re.findall(r'(?<!\S)(-|[\d,]+(?:\.\d+)?)(?!\S)', line)]
def t12(path):
    L = open(path).read().splitlines(); out = []; cur = None
    for i, ln in enumerate(L):
        if ln.strip().startswith('Population >=5'):
            name = L[i-1].strip()
            cur = dict(name=name); out.append(cur)
        elif cur is not None:
            s = ln.strip()
            for key, lab in (("pop10", "Population >=10"), ("literate10", "Literate >=10"), ("lit", "Literate %"), ("oos", "Out of School Children (5-16)")):
                if s.startswith(lab):
                    v = nums(s[len(lab):])
                    if len(v) != 12: raise SystemExit(f"{path}: {name}: {lab}: {len(v)} numbers")
                    cur[key] = v
    return out
def t11(path):
    L = open(path).read().splitlines(); out = []
    for i, ln in enumerate(L):
        if ln.strip() == 'ALL LOCALITIES' and L[i+1].strip().startswith('ALL SEXES'):
            name = L[i-1].strip()
            v = nums(L[i+1].strip()[len('ALL SEXES'):])
            if len(v) != 16: raise SystemExit(f"{path}: {name}: {len(v)} numbers")
            out.append(dict(name=name, total=int(v[0]), tongues={k: int(x or 0) for k, x in zip(LANGS, v[1:])}))
    return out
res = {}
for prov in ["punjab", "sindh", "kp", "balochistan"]:
    lit = t12(f"t12_{prov}_districts.txt"); mt = t11(f"t11_{prov}_districts.txt")
    def pack(r):
        lt, pop10, l10, oos = r["lit"], r["pop10"], r["literate10"], r["oos"]
        return dict(name=r["name"], literacy_pct=lt[0], literacy_male_pct=lt[1], literacy_female_pct=lt[2],
                    literacy_rural_pct=lt[4], literacy_urban_pct=lt[8],
                    population_10plus=int(pop10[0]), literate_10plus=int(l10[0]),
                    out_of_school_5_16=int(oos[0] or 0), out_of_school_5_16_male=int(oos[1] or 0), out_of_school_5_16_female=int(oos[2] or 0))
    res[prov] = dict(literacy=[pack(r) for r in lit if "lit" in r], mother_tongue=mt)
json.dump(res, open(sys.argv[1], "w"), indent=1)
print({p: (len(v["literacy"]), len(v["mother_tongue"])) for p, v in res.items()})
