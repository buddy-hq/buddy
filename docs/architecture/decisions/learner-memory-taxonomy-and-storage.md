# Learner Memory Taxonomy & Storage Architecture

## Status

**Shipped** storage, retention types, and pedagogy-kind enum: `packages/buddy/src/learning/features/memory/` (especially `types.ts`, `storage.ts`) and consolidator contract `packages/buddy/src/learning/features/memory/subagents/memory-consolidator.md`. Prompt delivery: `packages/buddy/src/learning/shared/learner-context-delivery.ts`.

**On-disk layout (ops):** [Learner Memory Operating Guide](../../guides/learner-memory.md) is the file-name authority for the two-lane tree. This ADR owns **why** file-first and two-lane exist, plus taxonomy and cache rules.

Related: [Curriculum Principles](../../learning/curriculum/principles.md), [OpenCode Decoupling](../decoupling/about.md).

---

## 1. Core principle

> **Pedagogical vocabulary is the semantic layer. Memory is the runtime substrate.**

Terms such as goal, evidence, misconception, practice, feedback, and review remain useful because models and educators already understand them. The failure of earlier Buddy iterations was making every term a **synchronous runtime object** in the agent loop.

- **Pedagogical vocabulary** names the domain for prompts, UI, and educators.
- **Durable memory** is files, event logs, and rebuildable indexes that persist across sessions without owning the hot path.

Product objects (still the right mental model, even when not 1:1 files):

- **Learner profile:** background, preferences, constraints, motivation anchors, recurring patterns.
- **Learning map:** active goals, evidence, fragile skills, misconceptions, open loops, due review, project context.
- **Memory ledger:** inspectable provenance — source events, confidence, strength, last seen / last used, learner corrections.

Buddy should feel continuous without becoming a visible LMS. Memory is used quietly; the learner can inspect and correct it.

### Ownership boundary

Memory is shared infrastructure (or a shared contract), not a composable persona feature. Multiple features may record evidence or query learner context, but they must depend on the memory contract rather than treating the storage implementation as a capability that can be independently composed or removed. This keeps cross-feature writes, retention, and provenance under one authority.

## State domains and notebook neutrality

A notebook or project directory is a **neutral workspace**, not a subject and not a curriculum container. It owns project files, notebook-local teaching artifacts, and lightweight workspace context; the active teaching runtime decides how that workspace is used.

Keep three domains separate:

- **Runtime teaching state** is session-local and short-lived: the persona, current teaching approach, activity/scaffolding, surface, and workspace interaction state for this turn.
- **Learner store** is the cross-project canonical record of learner facts: goals, evidence, fragile skills, misconceptions, preferences, constraints, and open loops.
- **Workspace state** is notebook-local: project context, pinned references, and teaching artifacts situated in that project.

Runtime teaching state is not learner state. A current activity, surface, or scaffolding choice must not be persisted as if it were a durable learner fact. Likewise, sidebar views, progress summaries, review schedules, alignment views, and session plans are **derived projections**, not canonical truth; they can be cached and rebuilt from learner evidence plus workspace context.

The write rule follows from this boundary: prefer evidence and observations first, then derive summaries and review state. Explicit learner corrections and high-signal practice or assessment events may update the working lane directly, but no projection should silently become the source of truth.

---

## 2. Two axes: retention type vs pedagogy kind

`memoryType` governs decay and strengthening. Pedagogy kind governs educational meaning. They are orthogonal.

### 2.1 Four cognitive retention types (research + shipped)

Shipped field: `memoryType` / `LearnerMemoryRetentionTypeSchema`.

| Type | Educational role | Decay / lifecycle | Example |
|---|---|---|---|
| **`semantic`** | Learning facts, mastery, misconceptions | Slow decay; refresh with retrieval or new evidence | Can explain X; confuses A with B |
| **`procedural`** | Habits and teaching patterns that work for this learner | Strengthens when reused; should change teaching style | Learns APIs from concrete routes first |
| **`episodic`** | Session/project continuity | Fast decay; keep only if consolidated | Stuck on validation boundaries yesterday |
| **`flashbulb`** | High-significance or pinned moments | No automatic decay until explicit change | Breakthrough after repeated failed practice |

Default **mapping from shipped pedagogy kind → retention** (`retentionTypeForPedagogyKind` in `storage.ts`) is an implementation convenience, not a claim that evidence is always a “milestone”:

- `preference`, `constraint` → `procedural`
- `evidence` → `flashbulb`
- `project_context` → `episodic`
- `goal`, `fragile_skill`, `misconception`, `open_loop` → `semantic`

### 2.2 Research / proposed ten pedagogy kinds (not the runtime enum)

The redesign proposed this `PedagogyKind` list for teaching semantics:

1. **`goal`** — active objectives and milestones
2. **`evidence`** — artifacts or results that show mastery
3. **`fragile_skill`** — partial skill needing guided practice
4. **`misconception`** — incorrect model that needs repair
5. **`feedback_loop`** — open instructional loop awaiting learner action
6. **`review`** — spaced retrieval due
7. **`preference`** — how the learner wants help (diagrams, brevity, …)
8. **`constraint`** — time, environment, tooling limits
9. **`motivation`** — personal stakes and anchors
10. **`project_context`** — workspace-specific topics and references

Treat `feedback_loop`, `review`, and `motivation` as **design vocabulary**. They are **not** members of the shipped Zod enum.

### 2.3 Shipped eight pedagogy kinds

Runtime: `LearnerMemoryTypeSchema` (stored as `pedagogyKind` and legacy `type`):

`preference`, `constraint`, `goal`, `evidence`, `fragile_skill`, `misconception`, `project_context`, **`open_loop`**

`open_loop` is the shipped stand-in for unfinished instructional loops (the proposal’s `feedback_loop`). Status values are separate: `active`, `hidden`, `rejected`, `resolved`, `stale`.

---

## 3. File-first storage (why, then two-lane)

### 3.1 Why file-first instead of SQL-first

Canonical memory is on disk under the Buddy learner-memory root (typically `~/.buddy/learner-memory/`), not a SQL-first product model.

- The learner model changes faster than a frozen relational schema.
- Files are inspectable, diffable, editable, backup-friendly, and portable.
- Markdown and JSON are native for both humans and models.
- Text search (grep / BM25) works on the projections.
- Codex-style split: SQLite for **jobs, leases, watermarks, retries, retrieval acceleration**; agent-readable memory as files.

```text
Canonical JSON / JSONL  →  source of truth
Generated Markdown      →  agent/human read path (MEMORY.md, summary.md, working-*)
SQLite                  →  disposable index and job ledger
```

Progressive disclosure: **summary → searchable registry → specific evidence**, then `learner_memory_search` when the turn needs more. Do not put raw memory rows in the stable system prompt.

Historical proposal paths such as `memories/<id>.json` as the only mutable `MEMORY.md` are **not** the current contract. The original redesign already noted two-lane files as the implementation.

### 3.2 Why two lanes

Chat-time writes must not clobber consolidated knowledge.

- **Base lane** (`MEMORY.md`, `summary.md`): consolidator-only. Chat CRUD must not rewrite these.
- **Working lane** (`working-memory.md`, `working-summary.md`): explicit edits, corrections, deterministic evidence.
- **Audit / index:** `events/YYYY-MM.jsonl`, `evidence/<id>.json`, rebuildable `index.sqlite`.

The consolidator folds validated working evidence into the base lane. Exact filenames and operator toggles: the [operating guide](../../guides/learner-memory.md).

Learner-global memory follows the OS user. Project-keyed rows may live under the same root with a stable project identity (not raw path only). Old workspace `.buddy/learner` trees are migration input only.

---

## 4. Prompt-cache delivery (fingerprint and delta)

Volatile learner memory must not sit in the **stable system-prompt prefix**. Delivery is layered:

| Layer | Contents | When | Cache |
|---|---|---|---|
| Stable system prompt | Memory protocol, teaching behavior, search rules | Every run, unchanged | Prefix-cache friendly |
| Session bootstrap | Compact selected learner snapshot | First delivery for the session (or after compaction dropped the digest) | One-time dynamic cost |
| Delta | Added / updated / removed bullets vs last fingerprint | Only when selected context **materially** changes | No repeat of unchanged payload |
| Unchanged | Nothing (or a same-fingerprint ref elsewhere in the prelude) | Fingerprint match | No extra memory block |
| On-demand | `learner_memory_search` | Model needs depth | Tool result, not system prefix |

Shipped helpers: `buildLearnerContextView` hashes the **rendered learner-facing body** (map / progress / profile lines), not volatile strength or last-used timestamps. `decideLearnerContextDelivery` emits bootstrap if there is no previous fingerprint, **omits** the block if fingerprints match, otherwise a `<learner_context_delta previous="…" current="…">` with Added / Updated / Removed lines. Instruction: use the context when relevant; do not mention it unless it helps the learner.

Runtime should store the last delivered fingerprint on the session (see `lastDeliveredLearnerContextDigest` in message-transform orchestration). Compaction should keep the latest digest; resume re-bootstraps only if the digest is missing. Delivery is not memory-usage reinforcement.

Deterministic events (question-set attempts, flashcards, checkpoints) may update evidence immediately; background extraction/consolidation stay off the hot path.

## Historical research and rejected delivery decisions

### Context first, behaviors second (research / superseded)

An earlier learner-context brainstorm made this product bet:

> Feed the model rich awareness of the learner first; observe the teaching behaviors that emerge; hard-code only the gaps that remain.

Its proposed sequence was **Phase 1: feed context → Phase 2: identify behavioral gaps → Phase 3: add explicit rules or tools only for those gaps**. The bet remains useful research context, but it is not a second runtime router and does not override the shipped memory taxonomy or prompt-cache contract.

The proposed context layers were:

- **Session pulse:** the proposed live signal set was:

  | Signal | Intended use |
  |---|---|
  | Message count | Distinguish an early turn from a long working session. |
  | Session duration | Notice when a learner may need a pause. |
  | Topic drift | Gently redirect a conversation that has left its focus. |
  | Question/answer ratio | Notice passive receipt versus active learner participation. |
  | Tool usage | Distinguish coding-along or artifact work from reading-only turns. |

- **Cross-session learning history:** related-session summaries, number of attempts, last-session time, and progress changes. The original research called this the highest-value layer because it turns a stateless chatbot into a tutor that remembers.
- **Learner profile:** durable concepts, recurring struggles, pace, and observed preferences.
- **Curriculum position:** current focus, prerequisites, and a suggested next step.

The specific proposal to inject a computed `<session_pulse>` block into the stable system prompt is **rejected**. First-class context injection rules keep volatile state out of the stable prefix for cache correctness and prompt hygiene. If pulse signals are ever reintroduced, they belong in the turn prelude under the existing change-only delivery policy, not in `<buddy_runtime_context>` or another stable system block. A total learner-context budget of approximately **2,000 tokens** was an open research proposal, not a committed limit; any future budget must be set by the prompt-delivery owner with measurement.

### Sidecar interpretation trigger (decision record)

The learner-memory exploration also compared five ways to interpret free-chat messages:

| Option | Trade-off / when it fits |
|---|---|
| **1. Keep + gate the sidecar** | Smallest stabilization: always persist the raw message, but extract only on high-signal turns and reuse exact prior decisions. Lower cost, but still duplicates some teacher reasoning. |
| **2. Fold updates into the teacher** | The main model has full history and could write through a structured memory tool. Highest context quality, but couples reply generation to durable writes and is invasive. |
| **3. Hybrid classifier/extractor** | A cheap classifier marks ignore/candidate/uncertain; structured extraction runs only for candidates. Best average cost/quality, but adds a recall-sensitive stage. |
| **4. Batch/background summarization** | Persist raw events in the foreground and synthesize evidence later. Lowest chat latency and better multi-turn context, with eventual-consistency trade-offs. |
| **5. Explicit-tool-only updates** | Only explicit practice, assessment, or reflection actions mutate learner state. Highest precision and simplest runtime, but misses organic free-chat signals. |

The rejected anti-pattern is a full sidecar `interpret-message` LLM on every accepted learner message: it runs after the visible reply, lacks the main session's history, duplicates reasoning, and spends latency without improving that turn. **Chosen direction:** raw messages and deterministic high-signal events may be recorded promptly, while model extraction and consolidation run behind an attention gate in background/on-demand work; explicit practice and assessment records remain privileged evidence. This is the reason the storage contract keeps background extraction/consolidation off the hot path.
