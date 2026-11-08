import pymupdf, re, json, sys
doc = pymupdf.open(sys.argv[1])
GROUP_RE = re.compile(r'^(AM|A1|A2|A|B1|BE|B|C1E|C1|CE|C|D1E|D1|DE|D|T)(\s*,\s*(AM|A1|A2|A|B1|BE|B|C1E|C1|CE|C|D1E|D1|DE|D|T))*\s*,?$')
rows = []
for pno, page in enumerate(doc):
    w = page.rect.width
    lines = []
    for b in page.get_text('dict')['blocks']:
        for l in b.get('lines', []):
            txt = ''.join(s['text'] for s in l['spans']).strip()
            if txt: lines.append((l['bbox'][0], l['bbox'][1], l['bbox'][3], txt))
    starts = sorted([(y0, x, t) for x, y0, y1, t in lines if x < 120 and re.match(r'^\d{1,3}\.', t)])
    for i, (y0, x, t) in enumerate(starts):
        yend = starts[i+1][0] if i+1 < len(starts) else 1e9
        body = [l for l in lines if y0 - 2 <= l[1] < yend - 2]
        groups = ' '.join(l[3] for l in body if l[0] > w * 0.78 and GROUP_RE.match(l[3].replace(' ', '')))
        question = ' '.join(l[3] for l in body if l[0] < w * 0.42)
        answer = ' '.join(l[3] for l in body if w * 0.42 <= l[0] <= w * 0.78)
        rows.append({'page': pno + 1, 'q': re.sub(r'^\d{1,3}\.\s*', '', question), 'a': answer, 'groups': re.sub(r'\s+', '', groups)})
json.dump(rows, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(rows), 'rows;', sum(1 for r in rows if r['groups']), 'with groups')
