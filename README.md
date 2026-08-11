# GradeAppeal

<div align="center">

## Fair Grade Appeals with Stakes on GenLayer

| **GradeAppeal Platform** |
|---|
| **Lock the rubric. Stake GEN. Appeal once. Let AI judge against the locked rules.** |

[![Live App](https://img.shields.io/badge/Live-grade--appeal--frontend.vercel.app-0f172a?style=for-the-badge&logo=vercel)](https://grade-appeal-frontend.vercel.app)
[![Contract](https://img.shields.io/badge/Contract-GenLayer_Python-1f6feb?style=for-the-badge)](#core-contract-api)
[![Frontend](https://img.shields.io/badge/Frontend-Next.js_+_TypeScript-111827?style=for-the-badge)](#project-structure)
[![Network](https://img.shields.io/badge/Network-GenLayer_Studionet-16a34a?style=for-the-badge)](#environment-variables)

</div>

---

## Overview

GradeAppeal is a transparent grade-appeal protocol on GenLayer. Teachers publish a score with a **locked rubric**, justification, and GEN stake. Students may appeal **once** with on-chain evidence text and stake. GenLayer AI compares both sides against the same locked rubric and settles the stake pot.

The protocol is designed to reduce he-said/she-said disputes:

1. Rubric and score are locked at publish time
2. Both sides put real GEN behind their position
3. AI verdicts are constrained: uphold, raise, or inconclusive — **never lower a grade to punish appealing**
4. Appeal history stays auditable on-chain

No URL fetching — evidence is on-chain text only.

## Core Value Proposition

- **Locked rubric:** grading rules cannot change after publish
- **Skin in the game:** teacher and student both stake GEN
- **One-shot appeals:** reduces spam while allowing a real challenge
- **Transparent AI judgment:** verdict + reasoning against the locked rubric
- **Student safety valve:** cancel before judge (refund student stake; still one-shot)
- **No punitive downgrade:** appealing cannot make the grade worse as punishment

## Protocol Flow

1. **Teacher publishes a grade** (`publish_grade`) with score, max score, rubric, justification, student, appeal window, and GEN stake
2. **Student files an appeal** (`file_appeal`) once with reason, evidence, optional proposed score, and stake
3. **Teacher may respond** (`respond_to_appeal`) before judgment
4. **Student may cancel** (`cancel_appeal`) before AI judgment — student stake refunded; cannot re-appeal
5. **Anyone calls judge** (`judge_appeal`) — AI verdict + payout + final score update when raised
6. **Teacher closes after deadline** (`close_grade`) if no open appeal — recovers remaining teacher stake

## Verdicts

| Verdict | Meaning | Stake outcome |
|---------|---------|---------------|
| `UPHOLD_ORIGINAL` | Original score fits the locked rubric | Teacher receives the pot |
| `RAISE_GRADE` | Student was under-graded vs rubric | Student receives the pot; `final_score` updated |
| `INCONCLUSIVE` | Not enough evidence to decide | Stakes returned to both |
| `CANCELLED` | Student cancelled before judgment | Student stake refunded; teacher stake stays |

## Risk Controls

| Risk | Mitigation in GradeAppeal |
|------|---------------------------|
| Rubric changed after grading | Rubric locked at `publish_grade` |
| Frivolous appeals | Student must stake; only one appeal per grade |
| Teacher self-grading abuse | Teacher cannot publish a grade for their own address |
| Punitive retaliation for appealing | No `LOWER_GRADE` punishment path |
| Stuck student stake | `cancel_appeal` refunds student stake before judgment |
| Premature teacher withdrawal | `close_grade` only after appeal deadline with no open appeal |
| Opaque dispute outcomes | Verdict, confidence, and reasoning stored on-chain |
| Off-chain evidence disappearing | Evidence is on-chain text (no URL dependency) |

## Core Contract API

| Function | Type | Description |
|----------|------|-------------|
| `publish_grade` | write (payable) | Teacher posts score + locked rubric + appeal window |
| `file_appeal` | write (payable) | Graded student challenges the score once |
| `respond_to_appeal` | write | Teacher optional reply before judgment |
| `cancel_appeal` | write | Student withdraws before judgment (refund; still one-shot) |
| `judge_appeal` | write | AI arbitration + payout + final score |
| `close_grade` | write | Teacher closes after deadline if no open appeal |
| `get_grade` / `get_all_grades` | view | Grade reads |
| `get_appeal` / `get_grade_appeals` | view | Appeal reads |
| `get_grades_for_student` / `get_grades_for_teacher` | view | Role filters |
| `get_protocol_config` | view | Stake + window bounds |

## Project Structure

```text
contracts/   # GenLayer intelligent contract (Python)
deploy/      # Contract deployment scripts
frontend/    # Next.js application (TypeScript)
tests/       # Contract/integration tests
```

## Environment Variables

Configure in `frontend/.env.local` (see `frontend/.env.example`):

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_GENLAYER_RPC_URL=https://studio.genlayer.com/api
NEXT_PUBLIC_GENLAYER_CHAIN_ID=61999
NEXT_PUBLIC_GENLAYER_CHAIN_NAME=GenLayer Studionet
NEXT_PUBLIC_GENLAYER_SYMBOL=GEN
```

## Local Development

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

Deploy `contracts/grade_appeal.py` via GenLayer Studio (`deploy/deployScript.ts`), then update `NEXT_PUBLIC_CONTRACT_ADDRESS`.

- Minimum stake: **0.01 GEN**
- Default appeal window: **7 days** (bounds 60s – 30 days)

## StudioNet note

Public StudioNet RPC is rate-limited (**30 requests/minute**, **500/hour**). Avoid rapid retries while testing.

## Links

- Live app: [https://grade-appeal-frontend.vercel.app](https://grade-appeal-frontend.vercel.app)
- Full source: [https://github.com/hoasine/grade-appeal-full](https://github.com/hoasine/grade-appeal-full)
- Contract repo: [https://github.com/hoasine/grade-appeal](https://github.com/hoasine/grade-appeal)

## Disclaimer

Prototype for education fairness experiments. Not institutional academic policy.
