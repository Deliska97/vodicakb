import json, sys
from pathlib import Path

SLOVAK = 0

def load_tests(path):
    raw = Path(path).read_text(encoding='utf-8')
    return json.loads(raw[raw.index('=') + 1:].rstrip().rstrip(';'))[SLOVAK]

def section_of(position, sections):
    return max((s for s in sections if s['start'] <= position), key=lambda s: s['start'])['id']

def build(tests):
    sections = [{'id': int(k), 'name': v[0]['txt'], 'start': v[0]['zacina']} for k, v in tests[0]['okruhy'].items()]
    questions, exams = {}, []
    for test in tests:
        ids = []
        for pos_key, entries in sorted(test['otazky'].items(), key=lambda kv: int(kv[0])):
            q, position = entries[0], int(pos_key)
            options = [o['odpoved'] for o in test['odpovede'][pos_key]]
            record = {
                'id': q['id'],
                'section': section_of(position, sections),
                'points': q['body'],
                'text': q['text'],
                'image': Path(q['obrazok']).as_posix().replace('/', '_') if q['obrazok'] else None,
                'options': options,
                'correct': q['platna'] - 1,
            }
            known = questions.get(q['id'])
            if known and (known['options'][known['correct']] != options[record['correct']]):
                raise ValueError(f"question {q['id']} has conflicting correct answers")
            questions.setdefault(q['id'], record)
            ids.append(q['id'])
        exams.append({'number': test['cislo'], 'questions': ids})
    meta = {k: tests[0][k] for k in ('pocet', 'cas', 'minbody', 'maxbody')}
    return {
        'source': 'Ministerstvo vnútra SR – elektronické skúšobné testy (minv.sk/?elektronicke-testy)',
        'exam': {'questionCount': meta['pocet'], 'timeLimitSeconds': meta['cas'], 'passPoints': meta['minbody'], 'maxPoints': meta['maxbody']},
        'sections': [{'id': s['id'], 'name': s['name']} for s in sections],
        'questions': sorted(questions.values(), key=lambda q: q['id']),
        'tests': exams,
    }, sorted({q['obrazok'] for t in tests for e in t['otazky'].values() for q in e if q['obrazok']})

if __name__ == '__main__':
    data, images = build(load_tests(sys.argv[1]))
    out = Path(sys.argv[2]); out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    Path(sys.argv[3]).write_text('\n'.join(images), encoding='utf-8')
    print(len(data['questions']), 'questions,', len(data['tests']), 'tests,', len(images), 'images')
