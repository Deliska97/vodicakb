import json
import random
import sys
from collections import Counter, defaultdict
from pathlib import Path

TEST_COUNT = 50
SEED = 20261108
MAX_SEED_ATTEMPTS = 100


class RepairFailed(Exception):
    pass


def official_layout(data):
    by_id = {q['id']: q for q in data['questions']}
    layouts = {tuple(sorted(Counter(by_id[i]['section'] for i in t['questions']).items())) for t in data['tests']}
    if len(layouts) != 1:
        raise ValueError(f'official tests do not share one section layout: {layouts}')
    return dict(next(iter(layouts)))


def section_sequence(pool, slots, per_test, rng):
    sequence = []
    while len(sequence) < slots:
        batch = rng.sample(pool, len(pool))
        sequence.extend(batch)
    sequence = sequence[:slots]
    for start in range(0, slots, per_test):
        repair_window(sequence, start, per_test)
    return sequence


def window_of(position, size):
    start = (position // size) * size
    return start, start + size


def can_swap(sequence, i, j, size):
    i_start, i_end = window_of(i, size)
    j_start, j_end = window_of(j, size)
    if i_start == j_start:
        return False
    incoming, outgoing = sequence[j], sequence[i]
    return incoming not in sequence[i_start:i_end] and outgoing not in sequence[j_start:j_end]


def repair_window(sequence, start, size):
    for i in range(start, start + size):
        if sequence[i] not in sequence[start:i]:
            continue
        candidates = [j for j in range(len(sequence)) if can_swap(sequence, i, j, size)]
        if not candidates:
            raise RepairFailed(f'no swap partner for position {i}')
        sequence[i], sequence[candidates[0]] = sequence[candidates[0]], sequence[i]


def build(data, test_count=TEST_COUNT, seed=SEED):
    for attempt in range(MAX_SEED_ATTEMPTS):
        try:
            return build_with_seed(data, test_count, seed + attempt)
        except RepairFailed:
            continue
    raise ValueError(f'could not build {test_count} duplicate-free tests in {MAX_SEED_ATTEMPTS} seeds starting at {seed}')


def build_with_seed(data, test_count, seed):
    rng = random.Random(seed)
    layout = official_layout(data)
    pools = defaultdict(list)
    for q in sorted(data['questions'], key=lambda q: q['id']):
        pools[q['section']].append(q['id'])
    for section, per_test in layout.items():
        if len(pools[section]) < per_test or per_test * test_count < len(pools[section]):
            raise ValueError(f'section {section}: {len(pools[section])} questions cannot fill {test_count} tests of {per_test}')
    sequences = {s: section_sequence(pools[s], per_test * test_count, per_test, rng) for s, per_test in layout.items()}
    return [
        {'number': n + 1, 'questions': [qid for s, per_test in sorted(layout.items()) for qid in sequences[s][n * per_test:(n + 1) * per_test]]}
        for n in range(test_count)
    ], layout


def verify(data, tests, layout):
    by_id = {q['id']: q for q in data['questions']}
    expected_points = data['exam']['maxPoints']
    for t in tests:
        assert len(t['questions']) == data['exam']['questionCount'], f"test {t['number']} has {len(t['questions'])} questions"
        assert len(set(t['questions'])) == len(t['questions']), f"test {t['number']} repeats a question"
        assert dict(Counter(by_id[i]['section'] for i in t['questions'])) == layout, f"test {t['number']} has a wrong section layout"
        assert sum(by_id[i]['points'] for i in t['questions']) == expected_points, f"test {t['number']} does not total {expected_points} points"
    usage = Counter(i for t in tests for i in t['questions'])
    missing = set(by_id) - set(usage)
    assert not missing, f'{len(missing)} questions are in no test'
    spread = defaultdict(set)
    for qid, count in usage.items():
        spread[by_id[qid]['section']].add(count)
    for section, counts in spread.items():
        assert max(counts) - min(counts) <= 1, f'section {section} usage is uneven: {sorted(counts)}'
    return {s: sorted(c) for s, c in sorted(spread.items())}


if __name__ == '__main__':
    data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
    tests, layout = build(data)
    spread = verify(data, tests, layout)
    Path(sys.argv[2]).write_text(json.dumps(tests, separators=(',', ':')), encoding='utf-8')
    print(f'{len(tests)} tests, every question used; appearances per question by section: {spread}')
