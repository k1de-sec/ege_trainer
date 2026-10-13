import re
from html.parser import HTMLParser
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
PAGES=['index.html','topics.html','self-study.html','theory.html','official.html']
HTML={name:(ROOT/name).read_text(encoding='utf-8') for name in PAGES}
JS=(ROOT/'app.js').read_text(encoding='utf-8')
class IdParser(HTMLParser):
    def __init__(self): super().__init__(); self.ids=[]
    def handle_starttag(self,tag,attrs):
        value=dict(attrs).get('id')
        if value:self.ids.append(value)
all_ids=set()
for name, source in HTML.items():
    parser=IdParser(); parser.feed(source)
    assert len(parser.ids)==len(set(parser.ids)), f'{name}: duplicate IDs'
    all_ids.update(parser.ids)
el_block=JS[JS.index('const el = {'):JS.index('\n  };',JS.index('const el = {'))]
bindings=re.findall(r"\$\('#([a-zA-Z0-9_-]+)'\)",el_block)
missing=sorted(set(bindings)-all_ids)
assert not missing, f'JS bindings not present on any route: {missing}'
for phrase in ('Оригинальные задания ФИПИ','Смешанная подборка','авторские упражнения','Официальные источники'):
    assert any(phrase in source for source in HTML.values()), f'Missing clarity label: {phrase}'
assert 'Отработка по типу' in JS, 'Topic drill mode label missing'
assert 'if (!el.taskContent) return;' in JS, 'JS should gracefully handle pages without a task workspace'
assert 'if (!el.search || !el.typeFilter || !el.listCount || !el.taskList) return;' in JS, 'JS should gracefully handle pages without a task list'
print(f'PASS: {len(all_ids)} unique IDs across page-specific HTML documents; {len(bindings)} JS DOM bindings resolve across the site.')
