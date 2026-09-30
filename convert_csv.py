import csv
import json

SRC = 'Dining_Out_NYC_Locations_20260929.csv'
OUT = 'data.js'

rows = []
with open(SRC, newline='', encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        lat = (r.get('Latitude') or '').strip()
        lon = (r.get('Longitude') or '').strip()
        if not lat or not lon:
            continue
        name = (r.get('Assumed Name(s)') or '').strip() or (r.get('Business Legal Name') or '').strip()
        rows.append([
            name,
            (r.get('Street') or '').strip(),
            (r.get('Borough') or '').strip(),
            (r.get('License Type') or '').strip(),
            round(float(lat), 6),
            round(float(lon), 6),
        ])

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('window.NYC_DINING_DATA = [\n')
    for row in rows:
        f.write('  ' + json.dumps(row, ensure_ascii=False) + ',\n')
    f.write('];\n')

print(f'wrote {len(rows)} rows to {OUT}')
