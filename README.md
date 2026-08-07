# GradeAppeal

## Transparent grade appeals on GenLayer

Teachers publish an assignment grade with a locked rubric, GEN stake, and an appeal window. Students can appeal **once** with stake + reason/evidence text. Teachers may respond before judgment. GenLayer AI validators re-check the grade against the rubric and settle the stakes.

No URL fetching required — evidence is on-chain text.

## Protocol flow

1. **publish_grade** (teacher, payable) — score, max score, rubric, justification, student, appeal window (`0` = 7 days)
2. **file_appeal** (student, payable) — reason, evidence text, optional proposed score (≥ assigned, ≤ max)
3. **respond_to_appeal** (teacher, optional) — one written response before judgment
4. **judge_appeal** (anyone) — AI verdict + payout + final score
5. **close_grade** (teacher) — recover stake only **after** appeal deadline, if no open appeal

## Verdicts

| Verdict | Meaning | Stake outcome |
|---------|---------|---------------|
| `UPHOLD_ORIGINAL` | Assigned grade fits rubric | Teacher receives pot |
| `RAISE_GRADE` | Student under-graded | Student receives pot; `final_score` updated |
| `INCONCLUSIVE` | Not enough / non-rubric evidence | Stakes returned to both |

`LOWER_GRADE` is intentionally unsupported (mapped to `INCONCLUSIVE`). Appeals never punish the student with a lower score.

## Rules

- One appeal per grade (one-shot)
- Appeal must be filed before `appeal_deadline_at`
- Teacher cannot close before the appeal deadline
- Rubric is immutable after publish

## Statuses

`PUBLISHED` → `APPEALED` → `SETTLED` / `CLOSED`

## Core API

| Function | Type | Description |
|----------|------|-------------|
| `publish_grade` | payable write | Teacher posts grade + locked rubric + window |
| `file_appeal` | payable write | Graded student challenges the score |
| `respond_to_appeal` | write | Teacher optional reply |
| `judge_appeal` | write | AI arbitration + payout |
| `close_grade` | write | Teacher closes after deadline |
| `get_grade` / `get_all_grades` | view | Grade reads |
| `get_appeal` / `get_grade_appeals` | view | Appeal reads |
| `get_grades_for_student` / `get_grades_for_teacher` | view | Filters |
| `get_protocol_config` | view | Stake + window bounds |

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest tests/direct/test_grade_appeal.py
```

## Deploy

Deploy `contracts/grade_appeal.py` via GenLayer Studio (`deploy/deployScript.ts`).

- Minimum stake: **0.01 GEN**
- Default appeal window: **7 days**
- Window bounds: **60s – 30 days**

## Demo script

1. Teacher publishes CS201 homework grade `6/10` with rubric (window `0` → 7 days)
2. Student files appeal proposing `9` with evidence citing rubric bands
3. Teacher optionally responds
4. Anyone calls `judge_appeal` → `RAISE_GRADE` / `UPHOLD_ORIGINAL` / `INCONCLUSIVE`
5. Or after deadline with no appeal, teacher `close_grade`

## Disclaimer

Prototype for education fairness experiments. Not institutional academic policy.
