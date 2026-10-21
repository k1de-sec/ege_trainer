from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent.parent
pages={
 'index.html':('home',['id="practice"','id="home-subject-preview-grid"','class="home-route-grid"'],['id="topics-variants"','id="self-study"','id="theory"','id="sources"']),
 'topics.html':('topics',['id="official-topic-source"','id="topics-variants"','id="topic-workspace"'],['id="self-study"','id="theory"','id="sources"']),
 'self-study.html':('study',['id="self-study"','id="start-exam-button"','id="topic-workspace"'],['id="topics-variants"','id="theory"','id="sources"']),
 'theory.html':('theory',['id="theory"'],['id="topics-variants"','id="self-study"','id="sources"']),
 'official.html':('official',['id="sources"','id="official-task-links"'],['id="topics-variants"','id="self-study"','id="theory"'])
}
for file,(route,required,forbidden) in pages.items():
    s=(ROOT/file).read_text(encoding='utf-8')
    assert f'data-page="{route}"' in s,f'{file}: incorrect route key'
    for token in required: assert token in s,f'{file}: missing route-specific content {token}'
    for token in forbidden: assert token not in s,f'{file}: unrelated page content remains: {token}'
    for target in ('./index.html','./topics.html','./self-study.html','./theory.html','./official.html'):
        assert f'href="{target}"' in s,f'{file}: navigation link missing {target}'
    # The active link should be marked on the correct separate document.
    nav=re.search(r'<a\b(?=[^>]*class="nav-link active")(?=[^>]*data-nav-page="([^"]+)")[^>]*>',s)
    assert nav and nav.group(1)==route, f'{file}: active navigation item does not match route'
# URLs in navigation are documents, not anchors on index.
for file in pages:
    s=(ROOT/file).read_text(encoding='utf-8')
    assert 'href="#topics-variants"' not in s and 'href="#self-study"' not in s and 'href="#theory"' not in s and 'href="#sources"' not in s
print('PASS: five standalone HTML pages each contain only their own main section content and use document navigation.')
