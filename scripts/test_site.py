#!/usr/bin/env python3
"""Sanity checks for the EGE+ multi-page static website release."""
import json
import re
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PAGES = ['index.html', 'topics.html', 'self-study.html', 'theory.html', 'official.html']
HTML = {name: (ROOT / name).read_text(encoding='utf-8') for name in PAGES}
APP = (ROOT / 'app.js').read_text(encoding='utf-8')

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=[]
    def handle_starttag(self, tag, attrs):
        value=dict(attrs).get('id')
        if value: self.ids.append(value)

for name, source in HTML.items():
    parser=IdParser(); parser.feed(source)
    duplicates=sorted({value for value in parser.ids if parser.ids.count(value)>1})
    assert not duplicates, f'{name}: duplicate IDs {duplicates}'
    assert '<main' in source and '</main>' in source, f'{name}: missing main'
    for route in ['./topics.html', './self-study.html', './theory.html', './official.html']:
        assert f'href="{route}"' in source, f'{name}: missing navigation to {route}'
    assert 'href="#topics-variants"' not in source and 'href="#self-study"' not in source and 'href="#theory"' not in source and 'href="#sources"' not in source, f'{name}: navigation still uses single-page anchors'

all_html='\n'.join(HTML.values())
# Check all page-specific controls on the page where they belong.
for page, ids in {
    'topics.html': ['official-topic-source','official-task-links-topics','topics-variants','topic-group-grid','topic-mode-select','start-topic-practice-button','topic-workspace','task-list','task-content'],
    'self-study.html': ['self-study','start-warmup-button','random-set-button','start-exam-button','exam-timer','topic-workspace','task-list','task-content'],
    'theory.html': ['theory'],
    'official.html': ['sources','random-fipi-task-button','official-task-links'],
    'index.html': ['practice','why-ege','home-route-grid'],
}.items():
    for item_id in ids:
        if item_id == 'home-route-grid':
            assert 'class="home-route-grid"' in HTML[page], f'{page}: missing {item_id}'
        else:
            assert re.search(r'\bid=["\']'+re.escape(item_id)+r'["\']', HTML[page]), f'{page}: missing {item_id}'
# Assert the pages are actually separate, rather than copied full pages hidden with CSS.
assert 'id="theory"' not in HTML['index.html'], 'Homepage still embeds the theory section'
assert 'id="sources"' not in HTML['index.html'], 'Homepage still embeds official sources'
assert 'id="self-study"' not in HTML['topics.html'], 'Topics page still embeds self-study controls'
assert 'id="theory"' not in HTML['topics.html'], 'Topics page still embeds theory'
assert 'id="sources"' not in HTML['theory.html'], 'Theory page still embeds official source list'
assert 'id="topics-variants"' not in HTML['official.html'], 'Official page still embeds topic browser'

# Bank integrity remains unchanged in this UI patch.
data=json.loads((ROOT/'tasks_data.json').read_text(encoding='utf-8'))
assert isinstance(data,list) and data, 'Task JSON should be a non-empty list'
ids=[x.get('externalId') for x in data]
assert len(ids)==len(set(ids)), 'Task IDs must be unique'
basic=[x for x in data if x.get('subjectId')=='math_basic']
assert len(basic)==441, f'Expected 441 base tasks, got {len(basic)}'
counts=Counter(int(x['taskNumber']) for x in basic)
assert set(counts)==set(range(1,22)), f'Expected task numbers 1..21, got {sorted(counts)}'
assert all(counts[n]==21 for n in range(1,22)), f'Expected 21 variants per task number: {counts}'
for task in basic:
    assert task.get('correctAnswer') not in (None,''), f"Missing answer: {task.get('externalId')}"
    assert task.get('explanation'), f"Missing explanation: {task.get('externalId')}"
assert 'function renderMathExpression' in APP and 'function startWarmup' in APP
assert 'ege-trainer-web-v11' in (ROOT/'sw.js').read_text(encoding='utf-8'), 'Service worker cache was not bumped'
print(f'PASS: {len(data)} tasks; {len(basic)} base math tasks (21 types × 21 variants)')
print('PASS: five separate pages have unique content, routed navigation and the expected page-specific controls')
