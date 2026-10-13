import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
JS = (ROOT / "app.js").read_text(encoding="utf-8")

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
    def handle_starttag(self, tag, attrs):
        value = dict(attrs).get("id")
        if value:
            self.ids.append(value)

parser = IdParser()
parser.feed(HTML)
duplicates = sorted({value for value in parser.ids if parser.ids.count(value) > 1})
assert not duplicates, f"Duplicate HTML IDs: {duplicates}"

el_block = JS[JS.index("const el = {"):JS.index("\n  };", JS.index("const el = {"))]
bindings = re.findall(r"\$\('#([a-zA-Z0-9_-]+)'\)", el_block)
missing = sorted(set(bindings) - set(parser.ids))
assert not missing, f"Missing DOM bindings: {missing}"
for required in ("why-ege", "self-study", "topic-mode-select", "start-topic-practice-button", "random-set-button", "start-exam-button", "random-fipi-task-button"):
    assert required in parser.ids, f"Missing user-facing control: {required}"
for phrase in ("ТЕМЫ И ВАРИАНТЫ", "Смешанная подборка", "Это авторский вариант, не официальный КИМ ФИПИ"):
    assert phrase in HTML, f"Missing clarity label: {phrase}"
assert "Отработка по типу" in JS, "Topic drill mode label missing from app logic"
print(f"PASS: {len(parser.ids)} unique HTML IDs; {len(bindings)} fixed DOM bindings; explicit practice-mode labels present.")
