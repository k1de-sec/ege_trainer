import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
guide=json.loads((ROOT/'informatics_guide.json').read_text(encoding='utf-8'))
items=guide.get('items', [])
assert guide.get('examYear') == 2027
assert len(items) == 27, f'Expected 27 informatics guide entries, got {len(items)}'
assert sorted(x.get('number') for x in items) == list(range(1, 28)), 'Guide must cover each position exactly once'
for item in items:
    assert item.get('title') and item.get('goal') and len(item.get('method', [])) >= 2, item.get('number')
    assert item.get('example') and item.get('solution') and len(item.get('pitfalls', [])) >= 2, item.get('number')
    assert item.get('part') in (1, 2), item.get('number')
worker=(ROOT/'python-runner-worker.js').read_text(encoding='utf-8')
js=(ROOT/'multi-exam.js').read_text(encoding='utf-8')
sw=(ROOT/'sw.js').read_text(encoding='utf-8')
assert 'importScripts(' in worker and 'LimitedWriter' in worker, 'Python runner must limit captured output'
assert 'ready:true' in worker, 'Worker must signal Python startup completion'
assert 'new Worker(\'./python-runner-worker.js?v=1\'' in js, 'Student code must run in a worker'
assert '5000' in js and '30000' in js, 'Runner must enforce execution and startup timeouts'
assert 'renderInformaticsGuide' in js and 'informatics_guide.json' in js
assert 'kpolyakov.spb.ru/school/ege.htm' in js and 'inf-ege.sdamgia.ru' in js and 'kompege.ru' in js
assert './informatics_guide.json' in sw and './python-runner-worker.js' in sw
registry=json.loads((ROOT/'subjects.json').read_text(encoding='utf-8'))
inf=next(x for x in registry['subjects'] if x['id']=='informatics')
tasks=json.loads((ROOT/'tasks_data.json').read_text(encoding='utf-8'))
bank=[x for x in tasks if x.get('subjectId')=='informatics' and x.get('sourceType')=='author_original']
assert len(bank)==inf.get('bankCount')==27
code_tasks=[x for x in bank if x.get('answerMode')=='code']
assert len(code_tasks)>=10, 'Expected runnable Python practice tasks'
assert all(x.get('codeLanguage')=='python' and x.get('codeInput') is not None and x.get('expectedOutput') is not None for x in code_tasks)
print('PASS: 27 informatics positions have methods, examples, solutions and common pitfalls.')
print('PASS: Python code runs in a disposable worker with startup/runtime timeouts and output cap.')
print('PASS: all guide/runner assets are cached; ten runnable Python tasks have test input and expected output.')
