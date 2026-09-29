# One-off helper used to build data/sources/pbs-2023-table1-districts.json.
# Input: `pdftotext -layout` output of the PBS 2023 census Table 1 district PDFs
# (https://www.pbs.gov.pk/wp-content/uploads/census_tables/tables/table_1_{punjab,sindh,kp,balochistan}_districts.pdf)
# saved as t1_<prov>_districts.txt in the working directory. Names are kept exactly as printed by PBS;
# scripts/tools/import-pbs-2023.js normalises them. Not part of the CI pipeline.
import re,json,sys
NUMS=r'([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,-]+)\s+([\d.-]+)\s+([\d,.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d,-]+)\s+([-\d.]+)\s*$'
def num(s): return None if s in('-','') else float(s.replace(',',''))
SKIP=re.compile(r'TABLE 1|CENSUS-2023|POPULATION|NAME OF ADMIN|SQ\.K\.M|GENDER|SIZE|^\s*1\s+2\s+3|AREA\s|PROPORTION')
out={}
for prov in ['punjab','sindh','kp','balochistan']:
    L=open(f't1_{prov}_districts.txt').read().splitlines()
    units=[]; i=0
    while i<len(L):
        ln=L[i]
        m=re.match(r'^(\S.*?)\s{2,}'+NUMS,ln)
        name=None
        if m: name=m.group(1).strip(); g=m.groups()[1:]
        else:
            m2=re.match(r'^\s+'+NUMS,ln)
            if m2:
                # wrapped name: previous text line + next text line
                prev=L[i-1].strip(); nxt=L[i+1].strip() if i+1<len(L) else ''
                if re.fullmatch(r'[A-Z][A-Z .\'()&/-]+',prev) and not SKIP.search(prev):
                    name=prev
                    if re.fullmatch(r'(DISTRICT|TEHSIL|TALUKA|SUB-DIVISION|SUB-TEHSIL|SUB DIVISION)',nxt): name+=' '+nxt; i+=1
                    g=m2.groups()
        if name and name not in ('RURAL','URBAN'):
            units.append(dict(name=name,area_km2=num(g[0]),population_2023=int(num(g[1])),density=num(g[6]),urban_pct=num(g[7]),hh_size=num(g[8]),growth=num(g[10]),male=int(num(g[2])),female=int(num(g[3])),sex_ratio=num(g[5]),population_2017=None if num(g[9]) is None else int(num(g[9]))))
        i+=1
    # build hierarchy
    dists=[]; cur=None
    for u in units[1:]:
        if u['name'].endswith(' DISTRICT'): cur=dict(u,units=[]); dists.append(cur)
        elif cur: cur['units'].append(u)
    for d in dists:
        teh=[u for u in d['units'] if not re.search(r'SUB-TEHSIL',u['name'])]
        s_all=sum(u['population_2023'] for u in d['units']); s_teh=sum(u['population_2023'] for u in teh)
        d['check_all']=s_all==d['population_2023']; d['check_tehsil_only']=s_teh==d['population_2023']
    out[prov]=dists
json.dump(out,open('pbs2023_table1.json','w'),indent=1)
for p,d in out.items():
    print(p,len(d),'tehsil-only sum ok:',sum(x['check_tehsil_only'] for x in d),'all-units sum ok:',sum(x['check_all'] for x in d))
    bad=[(x['name'],len(x['units']),x['population_2023'],sum(u['population_2023'] for u in x['units'])) for x in d if not x['check_all']]
    print('  BAD',bad)
