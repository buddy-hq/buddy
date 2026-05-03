# Learner Context Memory Redesign

Status: proposal  
Scope: replace `packages/buddy/src/learning/learner-model`; no backward compatibility required.

Implementation note: the implemented system now has two file-first lanes. Phase-two consolidation
owns read-only base memory in `MEMORY.md` and `summary.md`. Buddy's chat-time/user-editable working
memory lives in `working-memory.md` and `working-summary.md`. Earlier references in this proposal to
canonical `memories/*.json` or a single mutable `MEMORY.md` should be read as historical design
notes, not the current implementation contract.

## Product Perspective

### Goal

Buddy should have the context a good teacher has:

- what the learner is trying to learn
- what they have demonstrated
- what is fragile or misunderstood
- what feedback loop is still open
- what style of help works for them
- what should be reviewed before it is forgotten
- what matters across projects

Buddy should feel continuous without becoming a visible LMS.

### Key Product Decision

Keep pedagogical vocabulary. Simplify the machinery.

Terms like `goal`, `evidence`, `practice`, `assessment`, `misconception`, `feedback`, `review`, and `curriculum` are useful because models and educators already understand them.

The old system's mistake was making every term a synchronous runtime object.

New rule:

```text
Pedagogical vocabulary is the semantic layer.
Memory is the runtime substrate.
```

### Product Objects

#### Learner Profile

Stable learner-level facts:

- background knowledge
- preferences
- constraints
- motivation anchors
- recurring learning/work patterns

#### Learning Map

Current learning state:

- active goals
- demonstrated evidence
- fragile skills
- misconceptions
- feedback loops
- due reviews
- current project/topic context

#### Memory Ledger

Inspectable evidence behind Buddy's model:

- source session/event
- confidence
- strength
- last seen
- last used
- learner corrections

### Memory Types

Use `memoryType` for retention behavior and `pedagogyKind` for learning semantics.

```ts
type MemoryType = "semantic" | "procedural" | "episodic" | "flashbulb";

type PedagogyKind =
  | "goal"
  | "evidence"
  | "fragile_skill"
  | "misconception"
  | "feedback_loop"
  | "review"
  | "preference"
  | "constraint"
  | "motivation"
  | "project_context";
```

Semantic memories are learning facts: "can explain X", "confuses A with B". They decay slowly.

Procedural memories are learner patterns: "learns APIs best from concrete routes". They strengthen when reused and should strongly affect teaching style.

Episodic memories are session/project continuity: "got stuck on validation boundaries yesterday". They decay quickly.

Flashbulb memories are rare high-significance events: "this finally clicked", "major misconception resolved", "learner pinned this as important". They do not decay automatically.

### User Experience

Normal chat:

- Buddy uses memory quietly.
- It references memory only when useful.
- It does not force the learner through forms.

Memory panel:

- "What Buddy remembers"
- current goals
- evidence
- still fragile
- open loops
- preferences
- due reviews
- edit / hide / pin / resolve controls
- source count and last seen
- "used this turn" indicator

On-demand recall:

- Buddy receives an initial learner context snapshot when the session starts.
- Buddy receives a later learner context delta only when the selected memory context changes.
- If it needs more, it calls `learner_memory_search`.
- This avoids bloating every prompt while preserving deeper continuity and prompt-cache stability.

### End State

- Buddy starts each session with compact learner awareness.
- Buddy does not resend unchanged learner context every turn.
- Buddy can fetch deeper learner memory with a tool.
- The learner can inspect and correct memory.
- Deterministic learning events update evidence immediately.
- Background summarization improves memory after the turn.
- Dynamic learner context does not break prompt caching.

## Implementation Perspective

### Storage Decision

Use file-first canonical memory, not SQL-first memory.

Reason:

- The learner model will evolve quickly.
- SQL schemas force premature structure.
- Files are easier to inspect, diff, edit, back up, and migrate.
- Markdown/JSON are friendlier to models and humans.
- Grep/BM25/file search works well over text memory.
- Codex uses this pattern: SQLite coordinates jobs and selection, but agent-readable memory is file-based.

Use SQLite/Drizzle only as a secondary index and job ledger.

```text
Canonical JSON/JSONL files are source of truth.
Markdown files are generated read artifacts.
SQLite is acceleration and coordination.
```

### What Codex Actually Does

Reference repo:

- `~/code/codex`
- Concrete local path: `/Users/prashantbhudwal/Code/codex`

Codex uses a hybrid model:

- SQLite stores structured runtime state: stage-1 outputs, job leases, retry state, usage counts, last usage, watermarks, and selection metadata.
- Files store the agent-facing memory workspace:
  - `memory_summary.md`
  - `MEMORY.md`
  - `raw_memories.md`
  - `rollout_summaries/*.md`
  - optional `skills/*`
- The model gets a bounded `memory_summary.md`.
- If memory seems relevant, the model searches `MEMORY.md`.
- Only then does it open specific rollout summaries or skill files.

So Codex is markdown-first for agent reads, not raw-markdown-only for the whole system. Its raw memory text is backed by database rows and job metadata; the markdown files are generated, searchable, agent-friendly projections. Buddy should copy that separation: durable file artifacts for human/model inspection, plus a disposable Drizzle/SQLite layer for jobs, usage, watermarks, and retrieval acceleration.

This is progressive disclosure:

```text
summary -> searchable registry -> specific evidence
```

Buddy should use the same principle, but with learner-specific vocabulary and prompt-cache-safe delivery.

### What Is Codex-Inspired

Use `~/code/codex` as the reference implementation for these patterns, especially:

| Pattern | Codex reference path |
| --- | --- |
| Memory storage/job state | `~/code/codex/codex-rs/state/src/runtime/memories.rs` |
| Memory file layout and rebuild helpers | `~/code/codex/codex-rs/core/src/memories/storage.rs` |
| Phase-one/session extraction shape | `~/code/codex/codex-rs/core/src/memories/phase1.rs` |
| Consolidation workflow | `~/code/codex/codex-rs/core/src/memories/phase2.rs` |
| Agent read path/progressive disclosure | `~/code/codex/codex-rs/core/templates/memories/read_path.md` |
| Consolidation prompt and generated file contract | `~/code/codex/codex-rs/core/templates/memories/consolidation.md` |

Borrow:

- file-first agent-readable memory
- background extraction instead of hot-path generation
- per-session extraction before global consolidation
- job leases, retries, and watermarks
- bounded default memory context
- usage tracking to strengthen useful memories
- source-backed summaries
- correction/reset controls
- progressive disclosure from summary to registry to evidence

Do not copy:

- dynamic memory in the system/developer prompt
- raw markdown as the only product/state representation
- Rust implementation
- Codex's exact task-agent memory categories

Buddy-specific changes:

- pedagogical memory kinds
- session bootstrap context plus diffed synthetic learner context updates
- on-demand learner memory search tool
- learner-facing correction UI
- JSON metadata beside markdown for easier product rendering

### Prompt Caching Constraint

Do not inject changing learner context into the stable system prompt prefix.

Split prompt delivery into three layers:

| Layer | Contents | When sent | Cache impact |
| --- | --- | --- | --- |
| Stable system prompt | Memory protocol, teaching behavior, tool-use rules | Every run, unchanged | Cache-friendly prefix. |
| Session bootstrap learner context | Compact selected learner snapshot and context fingerprint | Once when the session starts or is resumed | One-time dynamic prefix cost for the session. |
| Learner context delta | Only changed/added/removed memory bullets since last delivered fingerprint | Only when selected memory context changes | No repeated unchanged memory payload. |

Runtime flow:

```text
compute selected learner context
  -> hash normalized selected context
  -> if session has no delivered fingerprint:
       send bootstrap learner context once
  -> else if fingerprint changed:
       send synthetic learner_context_delta near current user turn
  -> else:
       send no learner context payload
```

Delta shape:

```text
<learner_context_delta previous="ctx_01HX..." current="ctx_01HY...">
Added:
- New open loop: practice bridge-command validation boundaries.

Updated:
- Validation-boundary memory now has assessment evidence from `evt_01HX_QSET_ATTEMPT`.

Removed from default context:
- Route-wiring basics; now considered demonstrated evidence.
</learner_context_delta>
<instruction>
Use this learner context update when relevant. Do not mention it unless it helps the learner.
</instruction>
```

If the selected context has not changed, Buddy sends nothing. The model can still call `learner_memory_search` when the current task needs more detail.

Delivery ledger:

- Store `lastDeliveredLearnerContextFingerprint` on the session.
- Store `lastDeliveredLearnerContextMessageId` only for debugging and compaction.
- Do not treat context delivery as memory usage reinforcement.
- On compaction, preserve only the latest rendered learner context digest and fingerprint.
- On resume, re-bootstrap only if the current session has no delivered digest or the digest was removed by compaction.

Fingerprint rule:

- Hash only normalized rendered learner-facing context.
- Exclude volatile metadata such as raw strength, last-used timestamps, decay scores, and delivery counts.
- Emit a delta only for material teaching changes: new goal, new evidence, resolved misconception, changed preference, removed open loop, or materially different use rule.

Avoid this as the default:

```text
<learner_context>
...
</learner_context>
<instruction>
Use this learner context when relevant. Do not mention it unless it helps the learner.
</instruction>
```

That full block is acceptable as the session bootstrap, not as a repeated per-turn payload. The stable system prompt remains unchanged across turns.

### Canonical File Layout

Scope model:

- learner-global memory lives under Buddy state and follows the OS user.
- project memory lives under the same root but is keyed by a stable project identity, not raw path-only identity.
- cross-project memories are promoted global memories with project source pointers.
- old workspace `.buddy/learner` artifacts are migration input only; the replacement system does not keep writing there.
- project identity must be Windows-safe and path-move tolerant: store `projectId`, canonical path, display path, and source repository fingerprint when available.

Global learner memory root:

```text
Global.Path.state/learner-memory/
  summary.md
  MEMORY.md
  profile.json
  memories/
    <memory-id>.json
    <memory-id>.md
  events/
    YYYY-MM.jsonl
  session-summaries/
    <session-id>.md
    <session-id>.json
  evidence/
    <event-id>.json
  jobs.sqlite
  index.sqlite
```

Canonical data:

- `profile.json`
- `memories/*.json`
- `events/*.jsonl`
- `evidence/*`

Generated read artifacts:

- `memories/*.md`
- `session-summaries/*.md`
- `session-summaries/*.json`
- `summary.md`
- `MEMORY.md`

Derived/secondary data:

- `jobs.sqlite`
- `index.sqlite`

If generated markdown or SQLite is deleted, Buddy can rebuild it from canonical JSON/JSONL files.

### File Roles

#### `summary.md`

Generated compact context candidate.

Purpose:

- give Buddy a bounded learner overview
- guide retrieval
- avoid reading everything

Generated by consolidation.

#### `MEMORY.md`

Generated searchable learner memory registry.

Purpose:

- human/model-readable index
- grep/BM25 target
- points to memory files and evidence

Example block:

```md
## Fragile Skill: Electron bridge validation boundaries

memory_id: mem_...
memory_type: semantic
pedagogy_kind: fragile_skill
strength: 0.71
confidence: 0.82
tags: electron, validation, error-shape
sources: evt_..., ses_...

The learner can wire UI actions to backend routes, but validation boundary decisions remain fragile.
Use concrete bridge-command tasks before abstract API-design discussion.
```

#### `memories/<id>.json`

Product-readable memory record.

```ts
type LearnerMemoryRecord = {
  id: string;
  memoryType: MemoryType;
  pedagogyKind: PedagogyKind;
  status: "active" | "resolved" | "stale" | "rejected";
  title: string;
  body: string;
  tags: string[];
  projectPaths: string[];
  strength: number;
  confidence: number;
  firstSeenAt: string;
  lastSeenAt: string;
  lastUsedAt?: string;
  pinned: boolean;
  hidden: boolean;
  source: "deterministic" | "model_extracted" | "learner_authored";
  sourceEventIds: string[];
  supersededById?: string;
  schemaVersion: number;
};
```

#### `memories/<id>.md`

Generated model/human-readable version of the same memory.

This can change format more freely than canonical JSON. If it conflicts with `memories/<id>.json`, the JSON wins and markdown is rebuilt.

#### `events/YYYY-MM.jsonl`

Append-only evidence stream.

```ts
type LearnerEvent = {
  id: string;
  type:
    | "session_turn"
    | "session_ended"
    | "question_set_attempt"
    | "flashcard_review"
    | "task_assigned"
    | "task_completed"
    | "learner_correction"
    | "profile_update"
    | "memory_used"
    | "learner_context_delivered";
  createdAt: string;
  sessionId?: string;
  projectPath?: string;
  sourceKind: string;
  sourceId?: string;
  payload: unknown;
  searchableText: string;
};
```

#### `index.sqlite`

Derived index only.

Suggested tables:

- `memory_index(memory_id, title, tags, memory_type, pedagogy_kind, status, strength, confidence, last_seen_at, last_used_at, path)`
- `event_index(event_id, type, created_at, session_id, project_path, path)`
- optional FTS table for `MEMORY.md` blocks and memory markdown files

No product truth lives only here.

#### `jobs.sqlite`

Background coordination only:

- extraction jobs
- consolidation jobs
- leases
- retries
- watermarks

### Hot-Path Flow

Runs before every Buddy prompt.

```text
request
  -> resolve persona/project/resource
  -> compute session pulse
  -> read summary.md
  -> query index.sqlite or grep MEMORY.md
  -> score candidates without mutating memory
  -> select within budget
  -> render normalized learner context
  -> compare rendered-context fingerprint with session delivery ledger
  -> if missing fingerprint: add bootstrap synthetic learner-context message
  -> else if fingerprint changed: add learner-context-delta synthetic message
  -> else: add no learner-context payload
  -> record delivery ledger only when a payload is sent
  -> send to runtime
```

No LLM calls.

Hot-path rule:

- prompt-time selection is read-only when the rendered context is unchanged.
- delivery events do not strengthen memories.
- strengthening happens only through explicit search, agent citation, learner open/edit/pin, deterministic evidence, or background consolidation.
- decay is computed for scoring on the hot path but persisted only in background jobs.

If `index.sqlite` is missing:

```text
fallback to rg/MEMORY.md scan
enqueue index rebuild
continue without blocking
```

### Retrieval Strategy

Default retrieval uses progressive disclosure:

1. Always read bounded `summary.md`.
2. Search `MEMORY.md` for relevant tags/project/persona/topic terms.
3. Open only top memory files if more detail is needed for default context.
4. Leave deeper recall to `learner_memory_search`.

Search implementation v1:

- use `index.sqlite` when available
- otherwise use in-process BM25 over parsed `MEMORY.md` blocks
- for developer/debug tools, `rg` over memory root is acceptable

BM25 can be implemented locally over blocks:

```ts
score =
  idf(term)
  * ((termFrequency * (k1 + 1)) /
     (termFrequency + k1 * (1 - b + b * blockLength / averageBlockLength)));
```

Constants:

```ts
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const DEFAULT_CONTEXT_MEMORY_LIMIT = 8;
const MEMORY_SEARCH_RESULT_LIMIT = 12;
```

### Ranking

After text search, rank candidates:

```ts
score =
  textScore
  + pinnedBoost
  + projectMatchBoost
  + pedagogyKindBoost
  + effectiveStrengthBoost
  + openLoopBoost
  - stalePenalty;
```

Constants:

```ts
const PINNED_MEMORY_BOOST = 6;
const ACTIVE_PROJECT_BOOST = 4;
const OPEN_LOOP_BOOST = 4;
const PROCEDURAL_MEMORY_BOOST = 2;
const FLASHBULB_MEMORY_BOOST = 8;
const STALE_MEMORY_PENALTY = 5;
```

Default injection priority:

1. open feedback loops
2. current project context
3. fragile skills / misconceptions
4. active goals
5. recent evidence
6. procedural preferences
7. long-term strengths

### Decay And Strengthening

Each memory has `strength`.

```ts
effectiveStrength =
  strength
  * memoryTypeDecay(memoryType, daysSinceLastUsed)
  * confidenceMultiplier(confidence);
```

Decay:

```ts
function memoryTypeDecay(type: MemoryType, days: number) {
  if (type === "flashbulb") return 1;
  if (type === "semantic") return Math.exp(-days / 180);
  if (type === "procedural") return Math.exp(-days / 90);
  return Math.exp(-days / 30);
}
```

Use-based strengthening:

```ts
const USE_BOOST = {
  toolResult: 0.02,
  agentCited: 0.04,
  learnerOpened: 0.04,
  learnerPinned: 0.2,
} as const;
```

Usage is stored as an event in `events/YYYY-MM.jsonl`, then reflected into the derived index.

### On-Demand Tool

Tool:

```text
learner_memory_search
```

Input:

```ts
type LearnerMemorySearchInput = {
  query: string;
  pedagogyKinds?: PedagogyKind[];
  memoryTypes?: MemoryType[];
  projectScope?: "current" | "global";
  limit?: number;
  includeSources?: boolean;
};
```

Output:

```ts
type LearnerMemorySearchResult = {
  memories: Array<{
    id: string;
    title: string;
    body: string;
    memoryType: MemoryType;
    pedagogyKind: PedagogyKind;
    strength: number;
    confidence: number;
    lastSeenAt: string;
    sourceCount: number;
    path: string;
    sources?: Array<{ eventId: string; note: string; path: string }>;
  }>;
};
```

Side effect:

- append `memory_used` event
- update derived index eventually

Registration checklist:

- register `learner_memory_search` in the Buddy learner tool group.
- gate it by teaching persona/intent and enabled surface.
- remove stale `learner_snapshot_read` prompt/tool references.
- expose memory read/correction routes through Hono/OpenAPI.
- regenerate the typed SDK and use it from web.
- add memory panel queries through `BuddyClient`, not manual fetch.

### Deterministic Event Ingestion

Question sets:

- append `question_set_attempt`
- perfect assessment reinforces `evidence`
- partial assessment reinforces `fragile_skill`
- repeated misses on same tag reinforce `misconception` or `fragile_skill`

Flashcards:

- append `flashcard_review`
- repeated `again` reinforces `fragile_skill`
- stable review success reinforces `evidence`
- leech-like behavior creates a `review` open loop

Chat turns:

- append lightweight `session_turn`
- include persona/resource/workspace metadata
- do not summarize per turn
- do not store every full message as learner memory

Learner corrections:

- append `learner_correction`
- patch memory files synchronously
- correction wins over model extraction

### Background Session Extraction

Triggers:

- session archived
- session idle
- meaningful-turn watermark crossed
- manual "update Buddy memory"

Gate:

- archived, idle, and watermark triggers must pass the attention gate.
- manual extraction still obeys per-session and per-day call budgets unless the update is deterministic.
- deterministic learning events write event/evidence memories without a model extraction call.

Algorithm:

```text
evaluate attention gate and extraction budget
  -> claim extract_session_learning job only if eligible
  -> read transcript since watermark
  -> read deterministic events for session
  -> read current summary.md and relevant MEMORY.md blocks
  -> call small model once
  -> validate output
  -> write memory JSON/MD patches atomically
  -> append session summary
  -> update MEMORY.md and summary.md if needed
  -> rebuild derived index
  -> mark job success/retry
```

Extractor output:

```ts
type SessionLearningExtraction = {
  sessionSummary: string;
  memoryPatches: Array<{
    operation: "create" | "reinforce" | "weaken" | "resolve";
    targetMemoryId?: string;
    memoryType: MemoryType;
    pedagogyKind: PedagogyKind;
    title: string;
    body: string;
    tags: string[];
    confidence: number;
    sourceEventIds: string[];
  }>;
};
```

Rules:

- `evidence` needs deterministic event or explicit task completion.
- `misconception` needs clear repeated or explicit evidence.
- `flashbulb` needs learner marking or major learning transition.
- all patches must cite event IDs.
- validation failure means no mutation.

### Memory Patch Algorithm

Canonical key:

```ts
canonicalKey = normalize(`${memoryType}:${pedagogyKind}:${primaryTag}:${title}`);
```

Flow:

```text
patch
  -> find target by id or canonical key
  -> create JSON/MD files if missing
  -> attach sources
  -> update confidence
  -> update strength
  -> update lastSeenAt
  -> update project paths
  -> atomically rewrite affected files
  -> enqueue index rebuild
```

### Consolidation

Runs in background only.

Algorithm:

```text
claim consolidate_learner_memories job
  -> read summary.md, MEMORY.md, and selected memory files
  -> detect duplicates with normalized key similarity
  -> detect contradictions from statuses/tags
  -> ask model for merge suggestions only
  -> apply merges that reference existing IDs
  -> rewrite MEMORY.md and summary.md
  -> rebuild index.sqlite
```

Consolidation cannot create new memories.

### Routes

```text
GET    /api/learner-context/digest
GET    /api/learner-context/memories
GET    /api/learner-context/memories/:id/sources
PATCH  /api/learner-context/memories/:id
POST   /api/learner-context/memories/search
POST   /api/learner-context/extraction/session/:sessionId
POST   /api/learner-context/index/rebuild
```

### Implementation Phases

1. Stop context rot.
   Remove old learner snapshot injection and old learner tool instructions. Add empty digest delivered as synthetic dynamic context.

2. Add file-first memory root.
   Add layout creation, JSONL event append, memory JSON/MD read-write, and atomic file writes.

3. Add derived index.
   Add Drizzle/SQLite index and rebuild-from-files path. Treat it as disposable.

4. Add retrieval and selected-context digest.
   Implement summary read, MEMORY.md block search, BM25 fallback, scoring, decay, bounded rendering.

5. Add on-demand memory tool.
   Implement `learner_memory_search` with source-backed results and memory-used events.

6. Add deterministic event producers.
   Add question-set, flashcard, task, and correction events.

7. Add background extraction.
   Add jobs, small-model extraction, zod validation, atomic memory patches.

8. Add memory panel.
   Add memory/source routes and UI controls for edit, hide, pin, resolve.

9. Add consolidation and retention.
   Add merge/stale job, flashbulb retention, procedural strengthening behavior.

### Acceptance Criteria

- files are canonical; SQLite can be rebuilt
- prompt-time learner context uses zero LLM calls
- dynamic learner context is not in the system prompt
- pedagogical vocabulary remains first-class
- deterministic learning events become evidence immediately
- Buddy can fetch deeper memory with `learner_memory_search`
- reused memories strengthen
- unused non-flashbulb memories decay
- every visible memory has source pointers
- learner corrections override model extraction
- old learner model can be deleted after replacement tests pass

## Demo: Real File Contents

This demo uses one scenario:

- Learner is building Buddy.
- They are learning Electron bridge validation.
- They completed route wiring before.
- They repeatedly got stuck deciding where validation belongs.
- They prefer concrete project tasks over abstract explanation.

### `summary.md`

```md
# Learner Memory Summary

Use this only when it helps the current turn. Prefer concrete project-grounded teaching.

## Current Learning Map

- Active goal: implement reliable Electron bridge commands in Buddy.
- Demonstrated evidence: can wire UI actions to backend routes.
- Fragile skill: deciding where validation belongs between UI, backend route, and Electron bridge.
- Open loop: complete one bridge-command validation task with structured errors.
- Review due: structured error shape and validation boundary.

## Learner Profile

- Prefers concrete examples before abstractions.
- Learns best when the task is tied to a real Buddy feature.
- Usually wants implementation-shaped plans, not broad conceptual summaries.

## Retrieval Hints

- validation boundary
- electron bridge
- structured errors
- route wiring
- concrete project task
```

### `MEMORY.md`

```md
# Buddy Learner Memory

## Fragile Skill: Electron bridge validation boundaries

memory_id: mem_01HX_VALIDATION_BOUNDARY
memory_type: semantic
pedagogy_kind: fragile_skill
status: active
strength: 0.74
confidence: 0.86
tags: electron, validation, bridge, structured-errors
projects: /Users/prashantbhudwal/Code/buddy
sources: evt_01HX_QSET_ATTEMPT, evt_01HX_SESSION_EXTRACT

The learner can wire UI actions to backend routes, but validation boundary decisions remain fragile.
When this topic appears, prefer one concrete bridge-command task over abstract architecture discussion.

Use when:
- learner asks about Electron bridge commands
- learner asks where validation should happen
- a task involves structured errors or IPC boundaries

Do not use as:
- proof of general Electron mastery
- proof that backend validation itself is weak

## Demonstrated Evidence: UI action to backend route wiring

memory_id: mem_01HX_ROUTE_WIRING
memory_type: semantic
pedagogy_kind: evidence
status: active
strength: 0.67
confidence: 0.79
tags: ui-actions, backend-routes, buddy
projects: /Users/prashantbhudwal/Code/buddy
sources: evt_01HX_TASK_COMPLETED

The learner has demonstrated they can connect a frontend action to an existing backend route.
Do not re-teach this unless the current task shows regression.

## Procedural Preference: Concrete project task before abstraction

memory_id: mem_01HX_CONCRETE_FIRST
memory_type: procedural
pedagogy_kind: preference
status: active
strength: 0.91
confidence: 0.88
tags: teaching-style, concrete-examples, project-grounded
projects: *
sources: evt_01HX_LEARNER_CORRECTION, evt_01HX_SESSION_EXTRACT

The learner prefers concrete, implementation-shaped guidance before broad conceptual explanation.
For design proposals, start with the product behavior and exact implementation flow.
```

### `profile.json`

```json
{
  "schemaVersion": 1,
  "updatedAt": "2026-04-28T10:15:00.000Z",
  "learnerPreferences": [
    "Prefers concrete examples before abstractions.",
    "Wants implementation-shaped plans when discussing architecture."
  ],
  "constraints": [
    "Latency is a hard constraint for learner-context features.",
    "Dynamic context must not break prefix prompt caching."
  ],
  "motivationAnchors": [
    "Learns through real Buddy product work rather than toy examples."
  ],
  "notes": [
    "Treat learner memory as inspectable and correctable."
  ]
}
```

### `memories/mem_01HX_VALIDATION_BOUNDARY.json`

```json
{
  "schemaVersion": 1,
  "id": "mem_01HX_VALIDATION_BOUNDARY",
  "memoryType": "semantic",
  "pedagogyKind": "fragile_skill",
  "status": "active",
  "title": "Electron bridge validation boundaries",
  "body": "The learner can wire UI actions to backend routes, but validation boundary decisions remain fragile. Use concrete bridge-command tasks before abstract API-design discussion.",
  "tags": ["electron", "validation", "bridge", "structured-errors"],
  "projectPaths": ["/Users/prashantbhudwal/Code/buddy"],
  "strength": 0.74,
  "confidence": 0.86,
  "firstSeenAt": "2026-04-25T18:42:00.000Z",
  "lastSeenAt": "2026-04-28T10:15:00.000Z",
  "lastUsedAt": "2026-04-28T10:22:00.000Z",
  "pinned": false,
  "hidden": false,
  "source": "model_extracted",
  "sourceEventIds": ["evt_01HX_QSET_ATTEMPT", "evt_01HX_SESSION_EXTRACT"]
}
```

### `memories/mem_01HX_VALIDATION_BOUNDARY.md`

```md
# Electron bridge validation boundaries

memory_id: mem_01HX_VALIDATION_BOUNDARY
memory_type: semantic
pedagogy_kind: fragile_skill
status: active
strength: 0.74
confidence: 0.86
tags: electron, validation, bridge, structured-errors

## Memory

The learner can wire UI actions to backend routes, but validation boundary decisions remain fragile.

When helping on Electron bridge commands, use a concrete task:

- define the input payload
- choose the validation boundary
- return a structured error shape
- test valid and invalid inputs

Avoid starting with a broad explanation of IPC architecture unless the learner asks for it.

## Evidence

- evt_01HX_QSET_ATTEMPT: partial result on a validation-boundary question set.
- evt_01HX_SESSION_EXTRACT: session extraction found repeated uncertainty about where validation belongs.

## Use Rule

Use for bridge, validation, IPC, structured error, and settings-command tasks in Buddy.
```

### `events/2026-04.jsonl`

```jsonl
{"id":"evt_01HX_TASK_COMPLETED","type":"task_completed","createdAt":"2026-04-25T18:10:00.000Z","sessionId":"ses_01HX_ROUTE","projectPath":"/Users/prashantbhudwal/Code/buddy","sourceKind":"teaching_workspace","sourceId":"checkpoint_01HX_ROUTE","payload":{"title":"Wire settings UI action to backend route","result":"completed","tags":["ui-actions","backend-routes","buddy"]},"searchableText":"Completed task: wire settings UI action to backend route in Buddy."}
{"id":"evt_01HX_QSET_ATTEMPT","type":"question_set_attempt","createdAt":"2026-04-28T09:52:00.000Z","sessionId":"ses_01HX_BRIDGE","projectPath":"/Users/prashantbhudwal/Code/buddy","sourceKind":"question_set","sourceId":"qset_01HX_VALIDATION","payload":{"title":"Electron bridge validation boundaries","groupType":"assessment","totalQuestions":4,"correctQuestions":2,"tags":["electron","validation","bridge","structured-errors"]},"searchableText":"Question-set attempt: Electron bridge validation boundaries, 2 of 4 correct."}
{"id":"evt_01HX_LEARNER_CORRECTION","type":"learner_correction","createdAt":"2026-04-28T10:04:00.000Z","sessionId":"ses_01HX_PLAN","projectPath":"/Users/prashantbhudwal/Code/buddy","sourceKind":"learner","payload":{"targetMemoryId":"mem_01HX_CONCRETE_FIRST","action":"edit","replacementText":"Prefer concrete implementation-shaped plans before conceptual summaries."},"searchableText":"Learner corrected preference: concrete implementation-shaped plans before conceptual summaries."}
{"id":"evt_01HX_CONTEXT_DELIVERED","type":"learner_context_delivered","createdAt":"2026-04-28T10:22:00.000Z","sessionId":"ses_01HX_BRIDGE_NEXT","projectPath":"/Users/prashantbhudwal/Code/buddy","sourceKind":"learner_context","payload":{"deliveryKind":"bootstrap","fingerprint":"ctx_01HX_VALIDATION"},"searchableText":"Learner context delivered: Electron bridge validation boundaries."}
```

### `evidence/evt_01HX_QSET_ATTEMPT.json`

```json
{
  "schemaVersion": 1,
  "id": "evt_01HX_QSET_ATTEMPT",
  "kind": "question_set_attempt",
  "createdAt": "2026-04-28T09:52:00.000Z",
  "sessionId": "ses_01HX_BRIDGE",
  "projectPath": "/Users/prashantbhudwal/Code/buddy",
  "artifactId": "qset_01HX_VALIDATION",
  "title": "Electron bridge validation boundaries",
  "groupType": "assessment",
  "result": {
    "totalQuestions": 4,
    "correctQuestions": 2,
    "status": "partial"
  },
  "tags": ["electron", "validation", "bridge", "structured-errors"],
  "memoryEffects": [
    {
      "memoryId": "mem_01HX_VALIDATION_BOUNDARY",
      "effect": "reinforced",
      "reason": "Partial assessment result indicates this skill remains fragile."
    }
  ]
}
```

### `session-summaries/ses_01HX_BRIDGE.md`

```md
# Session Learning Summary

session_id: ses_01HX_BRIDGE
project: /Users/prashantbhudwal/Code/buddy
generated_at: 2026-04-28T10:15:00.000Z

## Summary

The learner worked on Electron bridge validation for Buddy. They were comfortable connecting UI intent to backend behavior but hesitated on where validation should live and how structured errors should be shaped.

## Memory Patches Applied

- Reinforced `mem_01HX_VALIDATION_BOUNDARY`.
- Created or reinforced open loop: complete one bridge-command validation task.

## Source Events

- evt_01HX_QSET_ATTEMPT
- evt_01HX_TASK_COMPLETED
```

### `session-summaries/ses_01HX_BRIDGE.json`

```json
{
  "schemaVersion": 1,
  "sessionId": "ses_01HX_BRIDGE",
  "projectPath": "/Users/prashantbhudwal/Code/buddy",
  "sourceUpdatedAt": "2026-04-28T10:10:00.000Z",
  "generatedAt": "2026-04-28T10:15:00.000Z",
  "summary": "The learner worked on Electron bridge validation for Buddy. Route wiring appears stronger than validation-boundary decisions.",
  "tags": ["electron", "validation", "bridge", "structured-errors"],
  "memoryPatchIds": ["mem_01HX_VALIDATION_BOUNDARY"]
}
```

### Synthetic Context Injected On A Future Turn

```text
<learner_context>
Current learning map:
- Goal: implement reliable Electron bridge commands in Buddy.
- Evidence: can wire UI actions to backend routes.
- Fragile: validation boundary decisions between UI, backend route, and bridge.
- Open loop: complete one bridge-command validation task with structured errors.

Learner profile:
- Prefers concrete implementation-shaped plans before conceptual summaries.

Use rule:
- If this turn is about Electron bridge commands, skip route-wiring basics and focus on validation boundary plus structured error shape.
</learner_context>
<instruction>
Use this learner context when relevant. Do not mention it unless it helps the learner.
</instruction>
```

## Memory System Touchpoints

This section is the operational contract: every read, write, update, delete, and model-assisted memory path should appear here.

### Write Authority

Buddy does need an update-memory path, but it should not be a hidden free-for-all. A sentence like "I prefer examples before theory" becomes a memory only through one of these paths.

| Writer | Creates memory? | Updates memory? | Model call? | Rule |
| --- | --- | --- | --- | --- |
| Profile/settings UI | Yes | Yes | No | Learner-authored preferences and constraints are deterministic profile facts. |
| Memory panel | Yes | Yes | No | Learner can add, edit, pin, hide, reject, or delete memories directly. |
| `learner_memory_update` tool | Yes | Yes | No by default | Available only when the learner explicitly asks Buddy to remember, forget, correct, or update something. |
| Deterministic event ingesters | Yes | Yes | No | Question sets, flashcards, task checkpoints, and verified practice events write evidence-backed memories. |
| Session extractor | Yes | Yes | Yes | Runs only after the attention gate passes and within the call budget. |
| Consolidator | No new memories | Yes | Yes | Merges, weakens, resolves, or marks stale using existing memory IDs only. |

The update tool is for explicit learner intent, not speculative observation. If the learner says "remember that I prefer examples before theory", the tool can write a procedural preference immediately. If the same sentence appears casually inside a long chat, the background extractor may propose it only if the session qualifies and the evidence is clear.

### Message And Session Signals

The attention gate uses fields already present in OpenCode/Buddy messages, so it does not need extra transcript instrumentation.

| Signal | Source field | Used for |
| --- | --- | --- |
| Non-synthetic learner turns | `message.info.role === "user"`, text parts where `synthetic !== true` and `ignored !== true` | Ignore greetings, injected context, and internal helper text. |
| Session span | first and last learner `time.created` | Approximate elapsed learning time. |
| Active burst density | gaps between learner `time.created` values | Detect continuous work instead of sparse one-off questions. |
| Assistant effort | assistant `tokens.output`, `tokens.reasoning`, `cost`, `time.completed` | Estimate whether Buddy spent meaningful attention. |
| Tool work | `ToolPart.tool`, `ToolPart.state.status`, tool start/end timestamps | Detect actual project work, assessment, search, edits, or verification. |
| Explicit learning artifacts | question-set, flashcard, task, checkpoint, or assessment events | Allow deterministic memory updates without LLM extraction. |
| User correction intent | text like "remember", "forget", "that's wrong", plus UI actions | Route to deterministic update/correction rather than background inference. |
| Session lifecycle | session `time.created`, `time.updated`, `time.archived` | Schedule idle/archive extraction jobs. |

### Attention Gate

Model-assisted extraction is a scarce background job. Trivial sessions should produce no memory call.

Named constants:

```ts
const MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION = 4;
const MIN_SESSION_SPAN_MS_FOR_EXTRACTION = 5 * 60_000;
const ACTIVE_BURST_GAP_MS = 10 * 60_000;
const MIN_ACTIVE_BURST_MESSAGES = 3;
const MIN_ASSISTANT_OUTPUT_TOKENS_FOR_EXTRACTION = 800;
const EXTRACTION_ATTENTION_THRESHOLD = 6;
const MAX_EXTRACTION_CALLS_PER_SESSION = 2;
const MAX_EXTRACTION_CALLS_PER_DAY = 20;
```

Decision algorithm:

```text
if explicit learner memory action:
  apply deterministic update or correction immediately

if deterministic learning event exists:
  write event/evidence memory without model extraction

if extraction_calls_for_session >= MAX_EXTRACTION_CALLS_PER_SESSION:
  skip

if extraction_calls_for_day >= MAX_EXTRACTION_CALLS_PER_DAY:
  queue for next day or manual consolidation

if non_synthetic_user_messages < MIN_NON_SYNTHETIC_USER_MESSAGES_FOR_EXTRACTION:
  skip unless explicit learner memory action exists

attention_score =
  user_message_score
  + session_span_score
  + active_burst_score
  + assistant_effort_score
  + tool_work_score
  + learning_artifact_score
  + correction_signal_score

if attention_score < EXTRACTION_ATTENTION_THRESHOLD:
  skip

claim one extraction job from the last transcript watermark
```

Score components:

| Component | Example scoring | Why it exists |
| --- | --- | --- |
| User message score | `min(3, floor(nonSyntheticUserMessages / 3))` | More learner turns usually means more observable learning state. |
| Session span score | `+1` if span exceeds `MIN_SESSION_SPAN_MS_FOR_EXTRACTION` | Avoid memorizing short drive-by questions. |
| Active burst score | `+2` if at least `MIN_ACTIVE_BURST_MESSAGES` occur within `ACTIVE_BURST_GAP_MS` gaps | Continuous work is stronger signal than isolated messages. |
| Assistant effort score | `+1` if output tokens exceed threshold, `+1` if tool calls completed | Buddy likely did real teaching/work. |
| Tool work score | `+2` for edit/test/assessment/checkpoint tools | Project work creates useful learner context. |
| Learning artifact score | `+3` for question-set, flashcard, practice, or task event | These are high-quality learning observations. |
| Correction signal score | `+3` for explicit remember/forget/correct intent | User-authored memory deserves priority. |

This means "hi" repeated many times is still low value: it has message count but no span, tools, artifacts, effort, or learning signal. A one-shot deep question can still qualify if Buddy produces high effort and tool work, but it will not qualify merely because one message was long.

### Generation Touchpoints

| Touchpoint | Trigger | Gate | Writes | Model call? | Output |
| --- | --- | --- | --- | --- | --- |
| Profile setup/edit | Learner edits preferences, constraints, background, goals | Learner action | `profile.json`, optional memory JSON/MD, `profile_update` event | No | Procedural preference, constraint, motivation, or goal. |
| Memory panel create/edit | Learner directly edits memory | Learner action | target memory JSON/MD, correction event, rebuilt summaries | No | Learner-authored memory or correction. |
| `learner_memory_update` | Learner explicitly says remember/forget/correct/update | Intent must be explicit | target memory JSON/MD, correction/profile event | No by default | Direct memory patch; model may only format text if needed. |
| Question-set attempt | Learner submits assessment | Assessment event exists | `question_set_attempt`, evidence JSON, memory JSON/MD | No | Evidence, fragile skill, misconception, or review loop. |
| Flashcard review | Learner reviews card | Review event exists | `flashcard_review`, optional evidence JSON, memory JSON/MD | No | Review loop, fragile skill, or retained evidence. |
| Task assigned | Buddy creates concrete learning task | Task has success criteria | `task_assigned`, optional goal/feedback-loop memory | No | Open loop or current goal. |
| Task completed/checkpoint accepted | Learner completes or tool verifies task | Verification or learner acceptance | `task_completed`, evidence JSON, memory JSON/MD | No | Evidence, resolved loop, or fragile skill. |
| Learner pins important moment | UI pin or explicit "this is important" | Learner action | correction event, memory JSON/MD | No | Flashbulb or pinned high-strength memory. |
| Session idle extraction | Session idle after meaningful work | Attention gate and call budget | session summary, memory patches, summaries, index/job state | Yes | Preference, project context, fragile skill, misconception, motivation, or open loop. |
| Session archive extraction | Learner closes/archives session | Attention gate and call budget | same as idle extraction | Yes | Consolidated session learning state. |
| Turn-threshold extraction | Long active session crosses meaningful-turn watermark | Attention gate and call budget | same as idle extraction | Yes | Incremental memory patches before archive. |
| Manual "update Buddy memory" | Learner clicks update/consolidate action | Learner action; budget can still apply if model extraction needed | session summary, memory patches, summaries | Sometimes | Forced extraction or deterministic patch. |
| Global consolidation | Enough memory patches accumulated or app finds dirty state | Existing memories only | `MEMORY.md`, `summary.md`, selected memory JSON/MD, index/job state | Yes | Merge, weaken, resolve, stale, supersede. |

### Use Touchpoints

| Touchpoint | Trigger | Reads | Writes | Model call? | Strengthens memory? |
| --- | --- | --- | --- | --- | --- |
| Bootstrap learner context | Session start/resume when no context fingerprint has been delivered | `summary.md`, selected `MEMORY.md` blocks, `index.sqlite`, selected memory JSON | `learner_context_delivered` event, delivered fingerprint | No | No, delivery is not reinforcement. |
| Learner context delta | Selected context fingerprint changes during session | changed memory JSON/MD, `index.sqlite`, source event pointers | `learner_context_delivered` event, delivered fingerprint | No | No, delivery is not reinforcement. |
| On-demand search tool | Agent calls `learner_memory_search` | `MEMORY.md`, `index.sqlite`, selected memory JSON/MD, optional evidence | `memory_used` event | No extra call | Yes, `tool_result` boost. |
| Memory panel render | Learner opens memory UI | `profile.json`, `summary.md`, `MEMORY.md`, memory JSON, evidence on expansion | optional `memory_used` event | No | Yes, `learner_opened` boost. |
| Source inspection | Learner asks "why does Buddy think this?" or developer opens debug view | memory JSON/MD, evidence JSON, events, session summaries | optional `memory_used` event | No | Optional. |
| Background extraction input | Extraction job runs | transcript since watermark, deterministic events, current memory files, summaries | session summary and memory patches | Yes | Not directly; generated patches may reinforce. |
| Consolidation input | Consolidation job runs | active/stale memories, usage events, session summaries | merged summaries and memory states | Yes | Reinforcement affects merge/stale decisions. |

### Update Touchpoints

| Touchpoint | Trigger | Writes | Model call? | Rule |
| --- | --- | --- | --- | --- |
| Use-based strengthening | Memory is returned by search, cited by the agent, opened/edited/pinned by learner, or reinforced by evidence | `memory_used` or correction/evidence event; derived `strength`/`lastUsedAt` later | No | Frequent useful memories get stronger; passive delivery does not count. |
| Deterministic evidence reinforcement | Assessment, flashcard, task, checkpoint | event, evidence, memory JSON/MD, summaries eventually | No | Evidence-backed learning data outranks inferred memory. |
| Model-assisted patch | Session extraction | memory JSON/MD, session summaries, `MEMORY.md`, `summary.md` | Yes | Allowed operations: `create`, `reinforce`, `weaken`, `resolve`; all cite sources. |
| Learner correction | Learner edits, rejects, resolves, pins, hides, or corrects Buddy | correction event, target memory JSON/MD, summaries, index | No | Learner correction wins over extractor output. |
| Profile update | Learner changes preferences/goals/background | `profile.json`, optional memory JSON/MD, profile event | No | Updates procedural learner context deterministically. |
| Decay pass | Memory has low strength and old `lastUsedAt` | memory JSON/MD, summaries, index | No | Reduces stale, unused memories from default context. |
| Consolidation merge | Duplicates or contradictions found | merged memory, superseded memory redirect, summaries, index | Yes | Cannot invent new facts; must reference existing memory IDs. |

Strength boosts:

```ts
const MEMORY_STRENGTH_BOOST_BY_USE = {
  toolResult: 0.02,
  agentCited: 0.04,
  learnerOpened: 0.04,
  learnerPinned: 0.2,
};
```

### Delete, Hide, And Retire Touchpoints

| Touchpoint | Trigger | Writes | Effect | Model call? |
| --- | --- | --- | --- | --- |
| Hide | Learner hides memory | `hidden: true`, correction event, summaries, index | Not used in prompt/search unless debug includes hidden | No |
| Reject | Learner says memory is wrong | status `rejected`, correction event, summaries, index | Not used; evidence kept for audit | No |
| Resolve | Learner resolves, deterministic evidence resolves, or extractor proposes with evidence | status `resolved`, event, memory JSON/MD, summaries | Searchable history; not selected by default unless relevant | No for deterministic, yes for extractor |
| Stale | Decay/consolidation marks low-strength old memory | status `stale`, memory JSON/MD, summaries | Drops from default context; explicit search can find it | No by default |
| Supersede/merge | Consolidation finds duplicates | `supersededById`, merged memory, summaries, index | Old memory remains as redirect/audit trail | Yes |
| Hard delete | Learner explicitly deletes memory or privacy action runs | removes memory JSON/MD, tombstones links, deletion event, rebuilt summaries/index | Memory cannot be used except from backups | No |
| Full reset | Learner resets learner memory | deletes or archives `learner-memory/`, creates empty layout | All learner memory gone; unrelated transcripts remain in their systems | No |

### Rebuild And Recovery Touchpoints

| Touchpoint | Trigger | Reads | Writes | Model call? |
| --- | --- | --- | --- | --- |
| Index rebuild | startup detects missing/stale `index.sqlite`, memory patch completed, debug action | profile, memory JSON/MD, events, session summaries | `index.sqlite` | No |
| Summary rebuild | learner correction, consolidation, debug action | active memory files, profile, recent summaries | `summary.md`, `MEMORY.md` | Usually no for deterministic correction; yes for consolidation rewrite |
| File repair | corrupt JSON, missing markdown companion, missing registry entry | available memory files, events, summaries | repaired JSON/MD, repair report, rebuilt index | No by default |

## Risk-First Delivery Plan

Risk is probability of failure multiplied by blast radius. The first production cut must test the parts most likely to fail because they are subjective, model-mediated, or depend on several moving pieces. Simple implementation bugs such as "did this accidentally enter the system prompt?" remain guardrails, not the main risk proof.

### Biggest Risks In Priority

| Priority | Risk | Probability | Blast radius | Why it is fragile | Required proof |
| --- | --- | --- | --- | --- | --- |
| 1 | Memory quality is bad | High | Very high | Extracting learner state from conversation is subjective. The model can overgeneralize, invent preferences, miss misconceptions, or turn one-off behavior into durable identity. | Evaluation fixtures and real-session extraction must produce bounded, evidence-backed candidate memories. |
| 2 | Retrieval creates context rot | High | High | Even correct memories become harmful if selected for the wrong project, stale goal, weak evidence, or unrelated prompt. | Retrieval must combine BM25, project scope, strength, recency, retention type, and stale penalties. |
| 3 | Memories do not improve teaching | Medium-high | High | A memory can be factually correct but useless: too generic, too verbose, not actionable, or ignored by the agent. | The controlled memory-off/on evaluation must show a visible teaching adaptation without parroting memory text. |
| 4 | Memory generation runs too often | Medium-high | High | Attention gating is heuristic and based on noisy session/message signals. Bad gating either misses important sessions or burns calls on shallow sessions. | Extraction must be notebook-toggleable, delayed out of the turn path, gated by attention, and bounded by per-session/day call budgets. |
| 5 | Corrections do not override bad memory | Medium | High | Bad learner memory has long-lived personalization blast radius unless rejection, hide, and correction dominate extraction/retrieval. | Inject a bad candidate, reject it, and prove it cannot appear in default context or search. |
| 6 | Representation is too rigid or too vague | Medium | Medium-high | If the schema is too strict, it blocks evolution. If it is too loose, retrieval and UI cannot reason over it. | Store candidate memories as typed JSON plus generated markdown and verify the same candidates can be rendered, searched, corrected, and regenerated. |
| 7 | Runtime integration is wired but not observable | Medium | Medium | If we cannot see why a memory was created, selected, or skipped, later failures become impossible to debug. | Every candidate and retrieval result has source pointers, gate reasons, confidence, and debug output. |

Prompt-cache safety, duplicate replay, atomic writes, and rebuild behavior still matter. They are acceptance guardrails. They are not the primary risk because they are deterministic engineering checks with low expected failure probability.

### System Question

Can Buddy generate, reject, store, retrieve, maintain, and use learner memories from real Buddy sessions in a way that improves teaching more often than it creates context rot?

If no, do not build the full learner model. Fix extraction, retrieval, or memory shape first.

### First Production Cut Scope

| Area | Include | Why |
| --- | --- | --- |
| Fixture corpus | 6 to 8 realistic session fixtures using Buddy/OpenCode message shape | Tests the hard judgment problems repeatedly. |
| Real session extraction | Manual route and delayed automatic extraction over real Buddy session messages | Tests the real data path, not a fake transcript path. |
| Notebook toggle | `learner_memory.enabled` and `learner_memory.auto_extract` | Lets each notebook opt into memory and automatic extraction independently. |
| Tunable controls | Attention, approval, delay, call budget, session cap, context limit | Lets the system be calibrated from settings without code edits. |
| Attention gate | Deterministic gate over message count, timestamps, tool use, and learning artifacts | Tests call control before extraction. |
| Bounded extractor | Small-model extraction through the user's connected provider path | Tests the riskiest non-deterministic part directly. |
| Call budget | Per-session and per-day extraction caps | Prevents runaway calls even if the gate is too permissive. |
| Candidate review file | Write `candidate-memory-patches.json` before canonical memory writes | Prevents bad extraction from immediately becoming durable state. |
| Canonical apply path | Apply approved candidates into `memories/*.json` and `events/*.jsonl` | Tests storage only after quality is inspectable. |
| Generated markdown | Build minimal `summary.md` and `MEMORY.md` from canonical JSON/JSONL | Tests model-readable projection. |
| Retrieval selector | Retrieve with BM25, scope, strength, retention, and stale weighting | Tests relevance and context rot risk. |
| Controlled agent eval | Run a few prompts with memory off/on | Tests whether memories actually change teaching behavior. |
| Correction path | Hide/reject/edit/pin/delete bad or important memory | Tests trust and override semantics. |
| Maintenance pass | Rebuild, repair, decay, and consolidate canonical memory | Tests long-term survivability. |
| Settings panel | Show records, scope, sources, pin/hide/delete controls | Tests that the learner can inspect and correct memory. |
| DevTools memory tab | Show session memory, search scores, and manual extraction | Tests turn/session observability for debugging. |

### Single-Cut Feasibility

Yes, this can be implemented in one cut if "one cut" means a notebook-toggleable product slice with real-session extraction disabled by default. It should not require a separate fake-data command to prove the system works.

Single-cut boundary:

| Include in one cut | Keep out of one cut |
| --- | --- |
| fixture corpus | migration of old learner artifacts |
| real-session extraction route | remote multi-user memory sync |
| delayed automatic extraction behind notebook toggle | cross-device profile sharing |
| attention gate | server-side tenancy or permissions |
| bounded extractor through connected user models | hard dependency on SQL as canonical memory |
| candidate review artifact | broad inferred agent writes |
| canonical apply path for approved candidates | SQLite/BM25 index |
| generated `summary.md` / `MEMORY.md` | |
| retrieval selector with decoys | |
| controlled memory off/on eval | migration of old learner artifacts |
| reject/hide/edit/pin/delete correction paths | |
| maintenance pass | |
| learner-facing settings panel | |

Reason:

- The cut tests the highest-probability failures: bad memory generation, context rot, lack of teaching improvement, over-generation, and correction failure.
- It keeps live behavior opt-in at the notebook level while testing the real session path.
- It gives two executable proofs: the evaluation harness and the real-session extraction route.

Expected output of the cut:

```text
~/.buddy/learner-memory/
  candidate-memory-patches.json
  working-memory.md
  working-summary.md
  raw-memories.md
  rollout-summaries/*.md
  events/*.jsonl
  evidence/*.json
  session-summaries/*.md
  session-summaries/*.json
  summary.md
  MEMORY.md
  index.sqlite
  reports/learner-memory-evaluation-report.json
```

Exit criteria for merging the cut:

- automatic extraction is disabled unless the notebook opts in.
- the evaluation harness can run locally and deterministically except for the bounded extractor call.
- every model-generated candidate is reviewable before becoming canonical memory.
- reports show which fixtures passed, failed, or need rubric changes.
- the Codex-inspired file/read-path decisions cite `~/code/codex` references above.

### Fixture Set

| Fixture | Expected behavior |
| --- | --- |
| Greeting-only session | Gate skips. No extraction call. No memory. |
| One-shot shallow Q&A | Gate usually skips. No durable memory unless explicit remember/correct intent exists. |
| Deep tutoring session | Gate allows one extraction. Candidate may include fragile skill, goal, or open loop with source pointers. |
| Project task with verified success | Candidate may include demonstrated evidence, not a vague "learner is good at X". |
| Ambiguous preference statement | Candidate should be low confidence or rejected unless repeated/explicit. |
| Explicit learner correction | Deterministic correction candidate wins over model extraction. |
| Contradictory old/new evidence | Retrieval should prefer recent/source-backed memory or surface uncertainty. |
| Cross-project decoy memory | Retrieval should not select it for an unrelated current project. |

### Product Flow

```text
notebook settings
  -> learner_memory.enabled toggles runtime memory delivery/search
  -> learner_memory.auto_extract toggles delayed real-session extraction

real chat turn
  -> Buddy sends stable system prompt
  -> learner context is delivered as a synthetic prelude only if digest changed
  -> agent can call learner_memory_search for deeper recall
  -> explicit remember/correct/forget/pin uses learner_memory_update

accepted real session
  -> delayed extraction reads real Buddy/OpenCode session messages
  -> run attention gate
  -> enforce per-session/day extraction budget
  -> call small model through user's connected provider only when eligible
  -> write candidate-memory-patches.json
  -> apply approved candidates to canonical JSON/JSONL
  -> write session summary
  -> regenerate summary.md, MEMORY.md, and index.sqlite

evaluation harness
  -> load fixtures
  -> run attention gate
  -> call extractor only for eligible fixtures
  -> write candidate-memory-patches.json
  -> validate candidates against schema and source pointers
  -> human/dev approves a small subset
  -> apply approved candidates to canonical JSON/JSONL
  -> regenerate summary.md and MEMORY.md
  -> run retrieval prompts with decoy memories
  -> run controlled agent prompts with memory off/on
  -> reject one bad memory and verify it disappears
```

### What To Build First

| Step | Build | Risk tested |
| --- | --- | --- |
| 1 | Fixture corpus and human rubric for expected memories, skipped sessions, and rejected memories. | Prevents us from declaring success on happy-path anecdotes. |
| 2 | Attention gate that outputs `skip` / `extract` plus reasons and call budget counters. | Tests over-generation and cost risk. |
| 3 | Extractor prompt and strict output schema for candidate patches only. | Tests memory quality without durable writes. |
| 4 | Candidate review artifact with source message/event pointers and confidence. | Tests inspectability and prevents silent bad memory. |
| 5 | Canonical apply path from approved candidate to JSON/JSONL. | Tests representation and correction surface. |
| 6 | Deterministic markdown generator for `summary.md` and `MEMORY.md`. | Tests model-readable projection and rebuild. |
| 7 | Retrieval selector over approved memories plus decoys with BM25 and retention scoring. | Tests context rot. |
| 8 | Controlled agent eval with memory off/on. | Tests whether memory improves teaching. |
| 9 | Reject/hide/edit path for one bad approved memory. | Tests correction dominance. |

### Success Criteria

| Criterion | Pass condition |
| --- | --- |
| Low-signal sessions stay quiet | Greeting and shallow fixtures produce zero extraction calls and zero memories. |
| Extraction is evidence-backed | Every candidate cites source message IDs, event IDs, or tool evidence. |
| No identity overreach | Extractor does not turn one ambiguous sentence into a durable learner trait. |
| Candidate volume is bounded | Eligible fixture produces at most 3 candidate memories and one session summary. |
| Retrieval beats decoys | Correct memory ranks above cross-project/stale/keyword-similar decoys. |
| Teaching improves | Memory-on answer adapts teaching strategy without parroting private memory text. |
| Correction wins | Rejected/hidden memory does not appear in search or selected context. |
| Cost is bounded | Skipped sessions use no model calls; eligible sessions respect per-session/day extraction budgets. |
| Storage is rebuildable | Approved JSON/JSONL regenerates equivalent `summary.md` and `MEMORY.md`. |
| Prompt guardrails hold | Dynamic learner context stays out of the system prompt and unchanged context is not resent. |

### Non-Goals For This Cut

- Do not migrate old learner-model artifacts.
- Do not make SQL the canonical memory store.
- Do not add multi-user memory permissions.
- Do not sync learner memory across devices.
- Do not allow inferred memory writes through the normal agent tool; inferred writes stay in background extraction.

### Phase Map

| Phase | Purpose | Unlocks |
| --- | --- | --- |
| 1A: Offline risk harness | Fixtures, gate, extractor candidates, rubric, retrieval eval | Confidence that the memory system can form useful memories. |
| 1B: Controlled live loop | Apply 1 to 3 approved memories and test memory off/on in real Buddy sessions | Confidence that memories affect teaching without context rot. |
| 1C: Correction loop | Reject/hide/edit/pin/delete approved memory and verify retrieval/context obeys it | Confidence that bad memory can be contained. |
| 2: Deterministic event ingesters | Question-set, flashcard, task, checkpoint memory writes | Evidence-backed memory without broad model extraction. |
| 3: Explicit learner writes | Enable `learner_memory_update` for explicit remember/forget/correct requests | Learner-authored memory control. |
| 4: Background extraction | Attention-gated session extraction in real use | Automatic learner model growth. |
| 5: Consolidation, decay, indexing | Merge, stale, strengthen, SQLite/BM25 | Scale and long-term maintenance. |

### Decision Gate

| Question | If yes | If no |
| --- | --- | --- |
| Are extracted candidates mostly correct, evidence-backed, and bounded? | Continue to controlled live loop. | Fix extractor prompt/schema/gate before touching runtime. |
| Does retrieval choose useful memories over decoys? | Add real runtime selection. | Fix memory shape, tags, source weighting, or project scope. |
| Does memory-on teaching improve over memory-off? | Add deterministic event ingesters next. | Rework rendered context and use rules. |
| Do corrections dominate retrieval and context? | Enable explicit learner correction/write flows. | Fix status filtering and correction semantics. |
| Does cost stay within budget? | Consider background extraction later. | Tighten attention gate or postpone extraction. |

## Linear Implementation Checklist

- [x] 0. Remove the old learner model from the active codebase.
  - [x] Delete legacy `learner-model` code and legacy learner model tools.
  - [x] Remove old learner model route/test expectations.
  - [x] Keep backward compatibility out of scope because the system was never shipped.

- [x] 1. Establish the new learner memory storage shape.
  - [x] Create a file-first global learner memory root under `~/.buddy/learner-memory`.
  - [x] Store canonical memories as JSON records.
  - [x] Store memory events as JSONL.
  - [x] Generate model-readable markdown projections from canonical data.
  - [x] Keep the storage shape evolvable instead of committing to SQL-only memory.
  - [x] Add optional SQLite/BM25 indexing after the file shape stabilizes.

- [x] 2. Build the phase-one offline risk harness.
  - [x] Add realistic fixture sessions.
  - [x] Include low-signal fixtures that must not create memories.
  - [x] Include deep tutoring and cross-project decoy fixtures.
- [x] Expand fixture corpus to 6 to 8 realistic sessions.
  - [x] Add a human-readable rubric for expected memory quality.

- [x] 3. Add attention gating before any model call.
  - [x] Score sessions using message count, session span, active burst, assistant effort, tool work, and learning artifacts.
  - [x] Skip shallow sessions before extraction.
  - [x] Emit gate decisions and reasons in the evaluation report.
  - [x] Bound eligible sessions to one extraction call each.
  - [x] Make thresholds tunable from global learner-memory settings.

- [x] 4. Wire real model-backed extraction through user-connected models.
  - [x] Add an OpenCode LLM adapter for small text generation.
  - [x] Use the existing provider/auth/subscription path instead of a separate API key.
  - [x] Select `small_model` when explicitly configured.
  - [x] Fall back to OpenCode-recognized small models from connected providers.
  - [x] Stream with `small: true`, no tools, one retry, and a timeout.
  - [x] Run extraction sequentially to avoid uncontrolled backend fanout.
  - [x] Record the provider and model used in the report.
  - [x] Add production-grade fallback handling when the selected provider fails.

- [x] 5. Define the extractor prompt and candidate patch schema.
  - [x] Put the extractor prompt in `extractor.p.md`.
  - [x] Require JSON-only output.
  - [x] Limit output to at most 3 candidates.
  - [x] Validate model output with Zod before writing candidate patches.
  - [x] Assign canonical IDs and source pointers locally, not by the model.
  - [x] Add adversarial prompt fixtures for overgeneralization and sensitive-memory rejection.

- [x] 6. Add candidate review and canonical apply path.
  - [x] Write candidate memory patches before durable memory writes.
  - [x] Apply approved candidates into canonical memory records.
  - [x] Append memory application events.
  - [x] Regenerate markdown projections after writes.
  - [x] Add an explicit candidate review artifact before durable writes.

- [x] 7. Build retrieval and context-rot checks.
  - [x] Add learner memory search over generated memory files.
  - [x] Include project-path relevance in retrieval.
  - [x] Record usage when search returns memories.
  - [x] Test retrieval against decoy queries in the evaluation report.
  - [x] Add richer stale/recency/strength weighting.
  - [x] Add optional BM25/index-backed retrieval.

- [x] 8. Add correction dominance basics.
  - [x] Add hide support for learner memories.
  - [x] Verify hidden memory is removed from normal retrieval after regeneration.
  - [x] Add reject semantics distinct from hide.
  - [x] Add edit semantics.
  - [x] Add learner-facing correction flow.
  - [x] Add hard delete/reset flows.

- [x] 9. Expose developer and API touchpoints.
  - [x] Add `learner-memory:evaluate`.
  - [x] Default the harness to real model-backed extraction.
  - [x] Keep deterministic extraction available for tests via `--deterministic`.
  - [x] Add learner memory list, search, hide, and evaluation routes.
  - [x] Regenerate the SDK for route/schema changes.
  - [x] Add a final product-grade route boundary for live extraction jobs.

- [x] 10. Expose read-only agent access.
  - [x] Add `learner_memory_search`.
  - [x] Register the search tool in learning tool contracts.
  - [x] Keep broad agent write access disabled.
  - [x] Add on-demand memory fetch behavior inside the actual Buddy runtime loop.
  - [x] Add diffed synthetic context injection outside the system prompt.
  - [x] Add cache-safe context versioning so unchanged context is not resent.

- [x] 11. Run controlled memory-off versus memory-on teaching evaluation.
  - [x] Build paired prompts with learner memory disabled and enabled.
  - [x] Score whether memory changes teaching behavior usefully.
  - [x] Verify Buddy adapts without parroting private memory text.
  - [x] Block phase two if memory does not improve teaching.

- [x] 12. Add deterministic event ingesters.
  - [x] Ingest question-set attempts.
  - [x] Ingest flashcard outcomes.
  - [x] Ingest task/checkpoint evidence.
  - [x] Convert verified evidence into memory events without model calls.
  - [x] Ensure evidence-backed data outranks inferred memories.

- [x] 13. Add explicit learner-authored memory updates.
  - [x] Add a constrained `learner_memory_update` capability for explicit remember/forget/correct requests.
  - [x] Require source intent from the learner.
  - [x] Keep implicit model extraction separate from explicit learner control.
  - [x] Make learner correction override extractor output.

- [x] 14. Add background live-session extraction.
  - [x] Trigger extraction only after the attention gate says the session deserves it.
  - [x] Enforce minimum message/session-depth constraints.
  - [x] Enforce max model calls per session and per time window.
  - [x] Write candidate patches before durable memories.
  - [x] Keep extraction out of the hot turn path.
  - [x] Add observability for skipped, extracted, approved, rejected, and failed sessions.

- [x] 15. Add decay, strengthening, and consolidation.
  - [x] Strengthen memories when they are explicitly used, cited, opened, pinned, or reinforced by evidence.
  - [x] Decay stale memories that are old and unused.
  - [x] Keep passive delivery from counting as reinforcement.
  - [x] Merge duplicates through source-backed consolidation.
  - [x] Mark superseded memories without losing audit history.

- [x] 16. Add rebuild, repair, and long-term maintenance.
  - [x] Rebuild markdown summaries from canonical JSON/JSONL.
  - [x] Rebuild search index from files.
  - [x] Repair missing markdown companions.
  - [x] Detect corrupt memory JSON and emit repair reports.
  - [x] Add retention/reset policy.

- [x] 17. Build product UX.
  - [x] Add a learner memory panel.
  - [x] Show why Buddy remembers each item.
  - [x] Let the learner hide, reject, edit, pin, and delete memories.
  - [x] Show project-scoped versus global memory clearly.
  - [x] Show what memory was used for a given answer.
  - [x] Add a Buddy DevTools memory tab for session/turn debugging.
  - [x] Add global settings controls for primary memory tunables plus notebook participation controls.
  - [x] Add a user-facing learner memory guide.

- [x] 18. Final production gate.
  - [x] Memory quality passes the expanded fixture rubric.
  - [x] Retrieval beats decoys across projects and stale memories.
  - [x] Memory-on teaching improves over memory-off.
  - [x] Corrections dominate retrieval and context.
  - [x] Cost stays within the configured call budget.
  - [x] Dynamic learner context stays out of the system prompt.
  - [x] Unchanged learner context is not resent.
