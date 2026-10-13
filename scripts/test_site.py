#!/usr/bin/env python3
"""Sanity checks for the static EGE+ website release."""
import json
import re
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
data = json.loads((ROOT / 'tasks_data.json').read_text(encoding='utf-8'))
html = (ROOT / 'index.html').read_text(encoding='utf-8')
app = (ROOT / 'app.js').read_text(encoding='utf-8')
assert isinstance(data, list) and data, 'Task JSON should be a non-empty list'
ids = [x.get('externalId') for x in data]
assert len(ids) == len(set(ids)), 'Task IDs must be unique'
basic = [x for x in data if x.get('subjectId') == 'math_basic']
assert len(basic) == 441, f'Expected 441 base tasks, got {len(basic)}'
counts = Counter(int(x['taskNumber']) for x in basic)
assert set(counts) == set(range(1, 22)), f'Expected task numbers 1..21, got {sorted(counts)}'
assert all(counts[n] == 21 for n in range(1, 22)), f'Expected 21 variants per task number: {counts}'
for task in basic:
    assert task.get('correctAnswer') not in (None, ''), f"Missing answer: {task.get('externalId')}"
    assert task.get('explanation'), f"Missing explanation: {task.get('externalId')}"
required_ids = ['topic-group-grid', 'topic-mode-select', 'start-topic-practice-button', 'topic-workspace', 'self-study', 'start-warmup-button', 'random-set-button', 'start-exam-button', 'theory', 'sources', 'random-fipi-task-button']
for item_id in required_ids:
    assert re.search(r'\bid=["\']' + re.escape(item_id) + r'["\']', html), f'Missing UI id: {item_id}'
for section in ['#topics-variants', '#self-study', '#theory', '#sources']:
    assert f'href="{section}"' in html, f'Missing nav link to {section}'
assert 'renderMathExpression' in app and 'math-fraction' in app, 'Math renderer missing'
assert 'function startWarmup' in app and "'warmup'" in app, 'Warm-up mode missing'
assert "ege-trainer-web-v7" in (ROOT/'sw.js').read_text(encoding='utf-8'), 'Service worker cache version was not bumped'
print(f'PASS: {len(data)} JSON tasks ({len(basic)} base), 21 types × 21 variants')
print(f'PASS: required page sections and controls: {len(required_ids)}')
print('PASS: math renderer, warm-up mode and cache bump')
