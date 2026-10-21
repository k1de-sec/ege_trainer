from pathlib import Path
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parent.parent
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]; self.hrefs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if a.get('id'): self.ids.append(a['id'])
        if tag=='a' and a.get('href'): self.hrefs.append(a['href'])
for fname in ['index.html','subjects.html','subject.html','topics.html','self-study.html','theory.html','official.html']:
    p=Parser(); p.feed((ROOT/fname).read_text(encoding='utf-8'))
    assert len(p.ids)==len(set(p.ids)), f'{fname}: duplicate ids'
    assert any('subjects.html' in h for h in p.hrefs), f'{fname}: no link to subjects catalog'
for fname in ['topics.html','self-study.html','theory.html','official.html']:
    s=(ROOT/fname).read_text(encoding='utf-8')
    assert 'data-page=' in s
    assert 'id="multi-subject-page-content"' in s
    assert 'href="./subjects.html"' in s
for fname in ['subjects.html', 'subject.html']:
    source=(ROOT/fname).read_text(encoding='utf-8')
    nav=re.search(r'<a\b(?=[^>]*class="nav-link active")(?=[^>]*data-nav-page="([^"]+)")[^>]*>',source)
    assert nav and nav.group(1)=='subjects', f'{fname}: subject navigation should be active'
js=(ROOT/'multi-exam.js').read_text(encoding='utf-8')
for id_ in ['math_basic','math_profile','russian','physics','chemistry','informatics','biology','history','social_science','geography','literature','english','german','french','spanish','chinese']:
    assert id_ in js, f'{id_} not recognized by the URL context manager'
assert 'topics.html?subject=' not in js or 'subject=${encodeURIComponent(subjectId)}' in js
print('PASS: all standalone page documents have unique IDs and links to subject selection.')
print('PASS: subject routes are recognized and scoped links retain selected-subject context.')
