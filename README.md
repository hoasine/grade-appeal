# GradeAppeal

## Fair grade appeals with stakes on GenLayer

Teachers publish a grade with a locked rubric and GEN stake. Students can appeal once with evidence and stake. Teachers may respond. GenLayer AI reviews both sides against the rubric. Students may cancel an open appeal before judgment (refund; still one-shot).

No URL fetching — evidence is on-chain text.

## Protocol flow

1. **publish_grade** (teacher, payable) — score, max, rubric, justification, student, appeal window (`0` = 7 days)
2. **file_appeal** (student, payable) — reason, evidence, optional proposed score
3. **respond_to_appeal** (teacher, optional) — one reply
4. **cancel_appeal** (student, optional) — withdraw before judge; student stake refunded; cannot re-appeal
5. **judge_appeal** (anyone) — AI verdict + payout + final score
6. **close_grade** (teacher) — recover stake only after appeal deadline if no open appeal

## Verdicts

| Verdict | Meaning | Stake outcome |
|---------|---------|---------------|
| `UPHOLD_ORIGINAL` | Grade fits rubric | Teacher receives pot |
| `RAISE_GRADE` | Student under-graded | Student receives pot; `final_score` updated |
| `INCONCLUSIVE` | Not enough evidence | Stakes returned to both |
| `CANCELLED` | Student cancelled | Student stake refunded; teacher stake stays |

Grades are never lowered as punishment for appealing.

## Statuses

`PUBLISHED` → `APPEALED` → `SETTLED` / `CLOSED` (cancel returns to `PUBLISHED`, still one-shot)

## Core API

| Function | Type | Description |
|----------|------|-------------|
| `publish_grade` | payable write | Teacher posts grade + locked rubric + window |
| `file_appeal` | payable write | Graded student challenges the score |
| `respond_to_appeal` | write | Teacher optional reply |
| `cancel_appeal` | write | Student withdraws before judgment |
| `judge_appeal` | write | AI arbitration + payout |
| `close_grade` | write | Teacher closes after deadline |
| `get_grade` / `get_all_grades` | view | Grade reads |
| `get_appeal` / `get_grade_appeals` | view | Appeal reads |
| `get_grades_for_student` / `get_grades_for_teacher` | view | Filters |
| `get_protocol_config` | view | Stake + window bounds |

## Local development

```bash
# Contract tests
pip install -r requirements-dev.txt
python -m pytest tests/direct/test_grade_appeal.py

# Frontend
cd frontend
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_CONTRACT_ADDRESS
npm run dev
```

## Deploy contract

Deploy `contracts/grade_appeal.py` via GenLayer Studio (`deploy/deployScript.ts`).

- Minimum stake: **0.01 GEN**
- Default appeal window: **7 days** (bounds 60s – 30 days)

## Demo script

1. Teacher publishes CS201 homework `6/10` with rubric
2. Student files appeal proposing `9` with evidence
3. Teacher optionally responds — or student cancels
4. Anyone calls `judge_appeal`
5. Or after deadline with no appeal, teacher `close_grade`

## Disclaimer

Prototype for education fairness experiments. Not institutional academic policy.
