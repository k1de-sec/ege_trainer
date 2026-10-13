import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = json.loads((ROOT / "tasks_data.json").read_text(encoding="utf-8"))
FIPI = json.loads((ROOT / "fipi_links.json").read_text(encoding="utf-8"))

ids = [task.get("externalId") for task in DATA]
assert all(ids), "Some tasks miss externalId"
assert len(ids) == len(set(ids)), "Duplicate externalId values"

basic = [task for task in DATA if task.get("subjectId") == "math_basic"]
assert len(basic) == 441, f"Expected 441 basic practice tasks, found {len(basic)}"
counts = Counter(int(task["taskNumber"]) for task in basic)
assert counts == Counter({number: 21 for number in range(1, 22)}), counts
type_counts = Counter(task.get("taskType") for task in basic)
assert len(type_counts) == 21, f"Expected 21 task types, found {len(type_counts)}"
assert all(count == 21 for count in type_counts.values()), f"Topic practice should have 21 variants per type: {type_counts}"
for task in basic:
    assert str(task.get("correctAnswer", "")).strip(), f"Missing answer: {task['externalId']}"
    assert str(task.get("explanation", "")).strip(), f"Missing explanation: {task['externalId']}"
    assert task.get("sourceType") in {"author_original", "author_generated"}, f"Unexpected source tag: {task['externalId']}"

project = FIPI.get("projectId")
assert project == "E040A72A1A3DABA14C90C97E0B6EE7DC8"
assert FIPI.get("bankUrl", "").startswith("https://ege.fipi.ru/")
assert FIPI.get("officialBankInfoUrl", "").startswith("https://fipi.ru/")
assert FIPI.get("topics"), "No official FIPI links configured"
for number, info in FIPI["topics"].items():
    assert 1 <= int(number) <= 21, number
    assert info.get("title")
    assert info.get("questionIds"), number
    for qid in info["questionIds"]:
        assert re.fullmatch(r"[A-F0-9]{6}", qid), (number, qid)
    assert info.get("navigator", "").startswith("https://doc.fipi.ru/navigator-podgotovki/")

# Verify every linked FIPI question is built from a trusted base/project ID.
for number, info in FIPI["topics"].items():
    for qid in info["questionIds"]:
        url = f"https://ege.fipi.ru/bank/index.php?proj={project}&qid={qid}"
        assert "ege.fipi.ru/bank/index.php" in url

print(f"PASS: {len(basic)} basic tasks, 21 variants per number and task type, unique IDs, answers and explanations present.")
print(f"PASS: {sum(len(v['questionIds']) for v in FIPI['topics'].values())} official navigator example IDs mapped across {len(FIPI['topics'])} task numbers.")
