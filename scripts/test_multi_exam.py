import json, re
from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parent.parent
registry=json.loads((ROOT/'subjects.json').read_text(encoding='utf-8'))
subjects=registry['subjects']
assert len(subjects)==15, f'Expected 15 official subject entries, got {len(subjects)}'
ids=[s['id'] for s in subjects]
assert len(ids)==len(set(ids)), 'Subject IDs must be unique'
expected={'russian','mathematics','physics','chemistry','informatics','biology','history','social_science','geography','literature','english','german','french','spanish','chinese'}
assert set(ids)==expected, f'Subject registry mismatch: {set(ids)^expected}'
for subject in subjects:
    assert subject.get('name') and subject.get('description') and subject.get('themes'), subject['id']
    assert all(t.get('title') and t.get('description') for t in subject['themes']), subject['id']
    assert subject.get('sources',{}).get('fipiPage','').startswith('https://fipi.ru/'), subject['id']
    assert subject.get('sources',{}).get('openBank','').startswith('https://'), subject['id']
    assert subject.get('sources',{}).get('project2027','').endswith('_2027.zip'), subject['id']
    assert subject.get('sources',{}).get('approved2026','').endswith('_2026.zip'), subject['id']
    assert subject.get('sources',{}).get('openVariant2026','').startswith('https://doc.fipi.ru/ege/otkrytyy-bank-zadaniy-ege/otkrytyye-varianty-kim-ege/2026/'), subject['id']
    assert subject.get('sources',{}).get('openVariant2026','').endswith('_1_ege2026.zip'), subject['id']
math=next(s for s in subjects if s['id']=='mathematics')
assert {t['id'] for t in math['tracks']}=={'math_basic','math_profile'}
assert next(t for t in math['tracks'] if t['id']=='math_basic')['bankCount']==441
assert next(t for t in math['tracks'] if t['id']=='math_profile')['bankCount']==26
profile_tasks = [task for task in json.loads((ROOT/'tasks_data.json').read_text(encoding='utf-8')) if task.get('subjectId') == 'math_profile' and task.get('sourceType') == 'author_original']
assert len(profile_tasks) == 26, f"Profile math bank count must match usable original exercises, got {len(profile_tasks)}"
assert all(task.get('correctAnswer') not in (None, '') and task.get('explanation') for task in profile_tasks), 'Profile math exercises need an answer and explanation'
profile_demo = [task for task in json.loads((ROOT/'tasks_data.json').read_text(encoding='utf-8')) if task.get('subjectId') == 'math_profile' and task.get('sourceType') != 'author_original']
assert all(task.get('correctAnswer') is None for task in profile_demo), 'Unfinished profile templates must not be auto-scored'
assert 'subject.html?subject=math_profile' in (ROOT/'topics.html').read_text(encoding='utf-8')
assert 'subject.html?subject=math_profile' in (ROOT/'self-study.html').read_text(encoding='utf-8')
# Non-mathematics subjects have pilot banks, not full exam-ready trainers.
pilot_subjects = [s for s in subjects if s['id'] != 'mathematics']
assert all(s.get('status') == 'pilot' for s in pilot_subjects)
tasks = json.loads((ROOT/'tasks_data.json').read_text(encoding='utf-8'))
for subject in pilot_subjects:
    actual = sum(1 for task in tasks if task.get('subjectId') == subject['id'] and task.get('sourceType') == 'author_original')
    assert actual == subject.get('bankCount'), f"{subject['id']}: registry says {subject.get('bankCount')} pilot tasks, found {actual}"
assert all(s.get('status') != 'available' for s in pilot_subjects), 'Pilot banks must not be labelled as complete'
# Each separate global page loads the new context script and has subject navigation.
for fname in ['index.html','topics.html','self-study.html','theory.html','official.html','subjects.html','subject.html']:
    html=(ROOT/fname).read_text(encoding='utf-8')
    assert 'multi-exam.js' in html, f'{fname} does not load multi-exam.js'
    assert 'data-nav-page="subjects"' in html, f'{fname} lacks subject navigation'
for fname in ['topics.html','self-study.html','theory.html','official.html']:
    html=(ROOT/fname).read_text(encoding='utf-8')
    assert 'id="multi-subject-page-content"' in html, f'{fname} lacks dynamic subject section host'
# Subject catalog and dashboard are their own HTML documents.
assert 'id="subjects-catalog"' in (ROOT/'subjects.html').read_text(encoding='utf-8')
assert 'id="subject-dashboard"' in (ROOT/'subject.html').read_text(encoding='utf-8')
js=(ROOT/'multi-exam.js').read_text(encoding='utf-8')
assert 'window.EGE_ACTIVE_SUBJECT_ID' in js and 'ege-plus-active-subject-v1' in js
assert 'function renderSubjectsCatalog()' in js and 'function renderGenericSection(item, page)' in js
assert "page === 'study' && item.id !== 'math_basic'" in js, 'Profile math needs its own practice bank on the study page'
assert 'renderSubjectPractice(item)' in js, 'Subject-specific practice bank is not rendered'
app = (ROOT/'app.js').read_text(encoding='utf-8')
assert "if (ACTIVE_SUBJECT_KEY !== 'math_basic') return;" in app, 'Legacy base-math trainer must not run for other subjects'
assert "item.bankCount > 0 ? item.bankCount : '—'" in js, 'Subject dashboards must show real starter-bank counts'
assert "item.status === 'pilot' ? '2'" not in js, 'Subject dashboard must not hard-code pilot task counts'
assert 'project2027' in js and 'approved2026' in js
assert 'src.openVariant2026' in js and 'Реальный открытый вариант ЕГЭ-2026' in js
assert "const words = q.split(/\\s+/).filter(Boolean)" in js, 'Global search must support multi-word queries'
assert "retry-subject-catalog" in js and "home-subject-preview-grid" in js, 'Catalog load errors must offer retry on homepage and subject pages'
assert "event.key.toLowerCase() === 'k'" in js, 'Global search keyboard shortcut missing'
# Ensure all subject nav section URLs preserve subject query params at runtime.
assert "subject=${encodeURIComponent(subjectId)}" in js
sw=(ROOT/'sw.js').read_text(encoding='utf-8')
for asset in ['./subjects.html','./subject.html','./multi-exam.js','./subjects.json']:
    assert asset in sw, f'Missing from service worker app shell: {asset}'
print('PASS: 15 official EGE subjects registered; mathematics has distinct base/profile tracks.')
print('PASS: every subject has source links, described topic groups and transparent content status.')
print('PASS: seven independent pages include subject-aware routing; section pages have separate content hosts.')
print('PASS: progress routing and service-worker cache include the multi-subject resources.')
