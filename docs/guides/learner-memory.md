# Learner Memory in Buddy

Buddy retains durable learning context across sessions on the local machine to avoid starting from zero: goals, fragile skills, misconceptions, demonstrated evidence, and teaching preferences.

---

## 1. Creation & Extraction

- **Explicit:** Learner instructions to remember, forget, correct, pin, or reject facts.
- **Deterministic:** Evidence recorded automatically from learning artifacts (question-set attempts, flashcard reviews, task checkpoints).
- **Automatic Extraction:** A background startup sweep evaluates sufficiently idle sessions when enough signal exists (message span, tool activity, artifacts; shallow or hot sessions are skipped).

Learner corrections override model-inferred extractions.

---

## 2. Controls & Prompt Integration

- **Prompt Caching:** Delivers a compact summary only when memory state changes, preserving cache stability.
- **On-Demand Search:** Calls `learner_memory_search` when deeper recall helps. Results rank by text match, scope, strength, recency, and pinned status.
- **Settings:**
  - *Notebook level:* Toggle memory delivery, search, and auto-extraction.
  - *Global machine level:* Configure extraction/consolidation models, attention gates, and retention limits.
  - *DevTools:* Memory tab provides record inspection, query scoring, and manual extraction testing.

---

## 3. Two-Lane Storage Architecture

Local path: `~/.buddy/learner-memory/`

Buddy maintains a strict two-lane file-first architecture:

- **Consolidated Base Lane (`MEMORY.md`, `summary.md`):** Read-only base memory written strictly by the background consolidator. Chat-time CRUD never rewrites base files.
- **Working Lane (`working-memory.md`, `working-summary.md`):** Editable lane for explicit corrections, new evidence, and chat CRUD.
- **Audit & Index (`events/*.jsonl`, `evidence/*.json`, `index.sqlite`):** Append-only event streams, raw evidence, and rebuildable SQLite search index.

The consolidator periodically folds validated working evidence into the base lane.

## 4. Extraction Pipeline

The automatic path is a background startup sweep over sessions that have been
idle long enough; it is not scheduled by the per-turn message transform. The
current session, internal memory sessions, archived sessions, sessions older
than the startup age limit, and sessions below the idle threshold are excluded
unless extraction is explicitly forced; the sweep also caps the number of
sessions and uses configured concurrency.

Stage-one extraction claims a durable job in `jobs.sqlite` using a SQLite
`BEGIN IMMEDIATE` transaction. Its lease owner, expiry, retry backoff,
last-success watermark, source fingerprint, and source message count survive a
restart, so concurrent workers do not re-extract an unchanged snapshot. The
phase-two consolidator uses the same ledger as a singleton leased job, selects
new or changed stage-one outputs, and publishes the validated base files only
after its staged registry and summary pass validation.

Before a provider call, the pipeline applies the attention gate and per-session
and per-day extraction budgets. [`session-source.ts`](../../packages/buddy/src/learning/features/memory/session-source.ts)
keeps user/assistant evidence and selected learning events, drops system and
skill scaffolding, reasoning, and bulky raw tool material, compacts tool
evidence, and redacts secrets. The effective context prefers the model's
`inputWindow`, then `contextWindow`; the default uses 70% of that window minus
6,000 reserved prompt tokens and 4,000 reserved output tokens, with an 8,000
token minimum. [`text-budget.ts`](../../packages/buddy/src/learning/features/memory/text-budget.ts)
keeps the head and tail when truncation is needed and inserts a marker for the
dropped middle. Stage-one candidate JSON and its ledger are intermediate
evidence, not final memory; consolidation merges, supersedes, or rejects those
candidates into the readable base lane.

The main mechanics live in [`startup.ts`](../../packages/buddy/src/learning/features/memory/startup.ts),
[`session-extraction.ts`](../../packages/buddy/src/learning/features/memory/session-extraction.ts),
[`stage-one-store.ts`](../../packages/buddy/src/learning/features/memory/stage-one-store.ts),
and [`consolidation.ts`](../../packages/buddy/src/learning/features/memory/consolidation.ts).
