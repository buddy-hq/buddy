# LAUNCH-09 — Learning workspace, managed objects, memory, curriculum, and assessment state

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L09-C01 — P1 — Lesson-workspace revision checks do not serialize saves, restores, or multi-file commits

- **Locations:** `packages/buddy/src/learning/features/lesson-workspace/service/operations.ts:58-100`, `packages/buddy/src/learning/features/lesson-workspace/service/operations.ts:108-178`, `packages/buddy/src/learning/features/lesson-workspace/service/operations.ts:181-210`, `packages/buddy/src/learning/features/lesson-workspace/service/operations.ts:271-345`, `packages/buddy/src/learning/features/lesson-workspace/service/workspace.ts:51-54`, `packages/buddy/src/learning/features/lesson-workspace/service/workspace.ts:229-345`, `packages/buddy/src/learning/adapters/http/lesson-workspace/workspace-operations.ts:177-184`, `packages/buddy/src/learning/adapters/http/lesson-workspace/workspace-operations.ts:238-256`
- **Trigger:** Submit two saves with the same `expectedRevision`, restore while a save is in flight, or terminate the process between a lesson/checkpoint file write and the matching `workspace.json` write.
- **Expected:** The revision comparison and all affected file/metadata writes form one serialized compare-and-swap operation. Restore rejects or reconciles newer work instead of silently replacing it, and restart observes either the old state or the complete new state.
- **Observed in discovery:** `save` reads and checks a revision before any mutation but holds no session lock through the subsequent file and metadata writes, so concurrent callers can both pass the same check and return the same next revision while one body wins. `restore` accepts no expected revision at all and writes every checkpoint over the live files. Provision, save, add-file, checkpoint, restore, sync, and metadata persistence use separate direct filesystem writes with no transaction or recovery journal.
- **Impact:** Concurrent user/editor and agent activity can lose lesson edits, restore over newer work, or leave file hashes, active paths, checkpoints, and revision metadata describing different states after a crash.
- **Verification pending:** Add barriers after revision read and around every file/metadata write; run same-revision saves, save-versus-restore, add-file-versus-save, and crash-at-each-boundary cases; restart and assert a single monotonic revision with a self-consistent file/checkpoint/metadata bundle.
- **First-pass confidence:** High.

### L09-C02 — P1 — A crash during managed-object replacement strands the only good copy as disposable staging data

- **Locations:** `packages/buddy/src/objects/store.ts:171-250`, `packages/buddy/src/objects/store.ts:801-831`
- **Trigger:** Replace an existing managed object and terminate after its live directory is renamed to the generated `.backup.tmp` directory but before the staged replacement is renamed into place.
- **Expected:** Restart deterministically restores either the old object or the complete new object from a durable transaction marker; orphan cleanup must distinguish recovery backups from disposable staging directories.
- **Observed in discovery:** Replacement renames the live directory to a randomly named backup and only then promotes staging. No journal identifies that backup or restores it on scan/restart. The generic orphan collector classifies every `.object-*.tmp` directory—including `.backup.tmp`—as disposable and recursively deletes it.
- **Impact:** A power loss or process kill in a narrow but ordinary replacement window makes the object disappear even though a complete prior copy exists on disk, and a later cleanup can permanently erase that only copy. Every managed kind using `writeObjectRecord` inherits the failure.
- **Verification pending:** Fault-inject after each rename/removal/index boundary for every replacement lifecycle; restart, list, resolve, and run orphan collection; assert that exactly one valid object revision is recovered and the prior copy is never treated as garbage.
- **First-pass confidence:** High.

### L09-C03 — P1 — Managed-object deletion can race with writers and resurrect deleted content

- **Locations:** `packages/buddy/src/objects/store.ts:171-250`, `packages/buddy/src/objects/store.ts:453-499`, `packages/buddy/src/objects/store.ts:748-799`, `packages/buddy/src/learning/features/flashcards/storage/read-deck.ts:101-111`, `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts:196-209`, `packages/buddy/src/learning/features/question-sets/storage/submit-attempt.ts:141-163`
- **Trigger:** Delete an object while a replacement writer has copied its live directory into staging, or while a flashcard review/question attempt has read the object and is about to write `state/`.
- **Expected:** A tombstone is a terminal generation barrier. Once deletion begins, older-generation writers and reads fail, no state is recreated behind the tombstone, and delete plus index removal is serialized with all object mutations.
- **Observed in discovery:** The only lock protects read-modify-write access to the shared index, not an object's directory. A writer can copy the pre-delete object, deletion can then write a tombstone and remove content, and the writer can rename the tombstone-bearing directory to backup, promote its pre-delete staging copy, delete the backup, and upsert the live index—removing the deletion marker and resurrecting the object. Kind-specific state readers/writers also access `state/` without first binding the operation to a manifest generation, so a review or attempt can recreate user-deleted state after cleanup.
- **Impact:** A user-deleted artifact can reappear, or sensitive review/attempt data can remain hidden behind a tombstone and later be revived. List/index truth can disagree with filesystem truth during the race.
- **Verification pending:** Interleave delete at every replacement and review/attempt boundary with deterministic barriers; then resolve by ID, list, inspect the tombstone and all state/revision directories, rebuild the index, and restart. The object must remain unavailable and no post-tombstone files may survive.
- **First-pass confidence:** High for replacement resurrection; medium-high for kind-specific state recreation until reproduced.

### L09-C04 — P1 — Disabled learner-memory consent is bypassed by forced extraction and direct search routes

- **Locations:** `packages/buddy/src/learning/features/memory/session-extraction.ts:123-160`, `packages/buddy/src/learning/features/memory/session-extraction.ts:162-264`, `packages/buddy/src/learning/features/memory/session-extraction.ts:266-400`, `packages/buddy/src/routes/learner.ts:93-96`, `packages/buddy/src/routes/learner.ts:676-702`, `packages/buddy/src/routes/learner.ts:755-780`, `packages/buddy/src/learning/features/memory/retrieval.ts:172-219`, `packages/buddy/src/learning/features/memory/tools/search-memory.ts:28-40`
- **Trigger:** Disable learner memory for a notebook, then call `POST /memory/session/extract` with `force: true` or call the direct `/memory/search` route.
- **Expected:** Disabled consent blocks transcript extraction, retrieval delivery, and usage mutations at every public runtime boundary. Any diagnostic override is development-only, explicit, and unable to persist learner data into the production store.
- **Observed in discovery:** `force` explicitly bypasses the enabled check, the internal-memory-session guard, attention gate, and extraction budgets. The public route exposes that flag without a development guard, allowing it to append events and persist candidate patches, raw summaries, and stage-one outputs under the learner-global root while memory is disabled. The agent search tool checks `settings.enabled`, but the direct HTTP search route does not; it always requests `recordUsage: true`, which appends a usage event and strengthens returned memories.
- **Impact:** Turning memory off does not reliably stop transcript-derived learner data from being created or existing memory from being retrieved and mutated. Forced stage-one data can also become eligible for later consolidation if the feature is re-enabled.
- **Verification pending:** Disable memory in a notebook containing sentinel transcript and memory values; invoke both routes; diff every learner-memory artifact and index before/after; assert no transcript/candidate/event/strength mutation and no search result. Repeat while disabling during an already-running extraction.
- **First-pass confidence:** High on the route behavior; whether `force` is intended as a supported production override requires product-policy confirmation.

### L09-C05 — P1 — Hard delete and reset leave consolidated memories that immediately resurface

- **Locations:** `packages/buddy/src/learning/features/memory/paths.ts:6-16`, `packages/buddy/src/learning/features/memory/paths.ts:79-143`, `packages/buddy/src/learning/features/memory/storage.ts:180-203`, `packages/buddy/src/learning/features/memory/storage.ts:501-547`, `packages/buddy/src/learning/features/memory/markdown.ts:11-30`, `packages/buddy/src/learning/features/memory/runtime/snapshot.ts:57-109`, `packages/buddy/src/routes/learner.ts:922-947`, `packages/buddy/src/routes/learner.ts:992-1015`
- **Trigger:** Delete a working memory that also exists in consolidated `MEMORY.md`, or use the learner-memory reset endpoint after consolidation has created `MEMORY.md` and `summary.md`.
- **Expected:** Hard deletion removes the memory from every active read path, and reset removes all learner-memory content and derived artifacts (or clearly offers a different, narrowly named working-set reset).
- **Observed in discovery:** Delete removes an ID only from `working-memory.md`. Search merges consolidated records whose IDs are absent from the working file, so that exact deleted record becomes searchable again. Reset removes only `working-memory.md` and `working-summary.md`; it preserves consolidated `MEMORY.md`, `summary.md`, goals, events, evidence, candidates, raw/stage-one outputs, reports, and job state. Route-level regeneration rewrites only the working files, while runtime snapshots continue injecting lines from the preserved consolidated summary.
- **Impact:** A user can be told that memory was deleted or reset while Buddy still retrieves, injects, and retains it. This breaks correction/privacy expectations and can make an incorrect or sensitive memory impossible to forget through the product controls.
- **Verification pending:** Seed the same sentinel ID/body into working and consolidated files plus the summary, exercise single delete and full reset, then search, build a runtime snapshot, restart, run consolidation, and inspect every artifact. The sentinel must be absent from all active and durable paths appropriate to each operation.
- **First-pass confidence:** High.

### L09-C06 — P1 — Learner-global memory mutations are uncoordinated read-modify-write operations

- **Locations:** `packages/buddy/src/learning/features/memory/paths.ts:6-16`, `packages/buddy/src/learning/features/memory/storage.ts:90-126`, `packages/buddy/src/learning/features/memory/storage.ts:128-177`, `packages/buddy/src/learning/features/memory/storage.ts:434-469`, `packages/buddy/src/learning/features/memory/retrieval.ts:172-219`, `packages/buddy/src/learning/features/memory/index-store.ts:39-128`, `packages/buddy/src/learning/features/memory/evidence.ts:83-115`
- **Trigger:** Ingest or edit memories concurrently from two notebooks, run deterministic checkpoint/practice ingestion alongside a user correction, or search with `recordUsage` returning multiple memories.
- **Expected:** The single learner-global store has a global mutation coordinator or transactional database. Independent writes merge without loss, event append and index publication have truthful success semantics, and usage updates for multiple results all persist.
- **Observed in discovery:** Every directory resolves to the same learner-memory root. `writeLearnerMemory` reads the entire Markdown registry, changes one record, and atomically replaces the whole file without a lock or compare-and-swap. Search deliberately calls multiple instances of that operation in `Promise.all`, so their strength updates can each start from the same snapshot and last-writer-win. Every working-memory write and JSONL event append independently rebuilds the same SQLite index; opening a rebuild drops both index tables before beginning its population transaction. Event parsing silently discards malformed JSONL lines.
- **Impact:** Concurrent notebooks and even one multi-result search can lose memory creations, corrections, or strength updates. Racing rebuilds can fail after canonical data was already changed, causing a reported failure that invites a duplicate retry while the index is missing or partial.
- **Verification pending:** Barrier two independent creates/edits and a multi-result usage search at the registry-read boundary; run concurrent event appends/rebuilds; verify every record, event, strength, and index row exactly once before and after restart. Add process-level concurrency, not only promises in one runtime.
- **First-pass confidence:** High on lost-update mechanics; medium-high on the exact SQLite failure mode until stress/fault injection.

### L09-C07 — P1/P2 — Consolidation edits canonical memory files in place without validating or rolling back the result

- **Locations:** `packages/buddy/src/learning/features/memory/consolidation.ts:145-202`, `packages/buddy/src/learning/features/memory/consolidation.ts:204-270`, `packages/buddy/src/learning/features/memory/consolidation.ts:298-429`, `packages/buddy/src/learning/features/memory/subagents/memory-consolidator.md:16-47`, `packages/buddy/src/learning/features/memory/storage.ts:185-203`, `packages/buddy/src/learning/features/memory/runtime/snapshot.ts:57-67`
- **Trigger:** The consolidation model partially edits one target, writes malformed memory blocks, reports unrelated candidate IDs, times out after editing, or returns invalid structured output after changing the files.
- **Expected:** Consolidation writes to a staged generation, validates every registry record and selected/rejected candidate ID, derives the summary from validated state, and atomically publishes both files only after success; failure preserves the prior canonical generation.
- **Observed in discovery:** The subagent is instructed and permitted to edit `MEMORY.md` and `summary.md` directly. Post-run checks only prove that both paths exist and that the model reported those paths; they do not parse the registry, validate candidate membership, compare the summary, or preserve a backup. The catch path marks the job failed but leaves any partial canonical edits in place, and a retry starts from those already-mutated files.
- **Impact:** One model/tool failure can silently drop prior memories, leave invalid blocks that disappear from search, inject arbitrary stale lines through `summary.md`, or repeatedly merge the same candidates across retries.
- **Verification pending:** Use a deterministic fake consolidator for malformed blocks, nonexistent candidate IDs, one-file edits, timeout after first edit, and crash before job success. Assert canonical byte-for-byte rollback on every failure and schema/candidate consistency on success.
- **First-pass confidence:** High on missing validation/rollback; severity depends on reproduced model/tool failure behavior.

### L09-C08 — P1 — Committing one curriculum goal set archives every unrelated active goal set

- **Locations:** `packages/buddy/src/learning/features/memory/goals/storage.ts:31-43`, `packages/buddy/src/learning/features/memory/goals/storage.ts:56-107`, `packages/buddy/src/learning/features/curriculum-planning/tools/commit-goal.ts:29-55`, `packages/buddy/src/learning/features/curriculum-planning/tools/commit-goal.md:1`, `packages/buddy/src/learning/features/memory/runtime/snapshot.ts:70-109`
- **Trigger:** Commit a valid goal set for a different scope or `contextLabel` while another set is active; concurrent goal-writer sessions amplify the same whole-file read-modify-write risk.
- **Expected:** As the tool contract states, a commit archives only the previous active set with the same scope and `contextLabel`; independent course/topic contexts coexist and concurrent commits cannot erase one another.
- **Observed in discovery:** `replaceActiveGoalSet` builds `archivedSetIds` from every active goal and maps every active record to `archived`, without comparing either scope or context label. It then replaces the learner-global `goals.json` from an unlocked snapshot.
- **Impact:** Defining goals for one subject silently removes all other active curricula from runtime snapshots and teaching orchestration. Two simultaneous commits can additionally leave only one newly written set.
- **Verification pending:** Commit sequential course/topic sets across several context labels, then commit two contexts concurrently with a barrier after read; assert only the matching predecessor is archived and all independent sets remain active after restart.
- **First-pass confidence:** High.

### L09-C09 — P1 — Review and question-attempt retries can durably apply the same answer twice

- **Locations:** `packages/buddy/src/learning/features/flashcards/types.ts:159-164`, `packages/buddy/src/learning/features/flashcards/storage/review.ts:67-155`, `packages/buddy/src/learning/features/flashcards/storage/review-transaction.ts:79-113`, `packages/buddy/src/learning/features/question-sets/types.ts:74-81`, `packages/buddy/src/learning/features/question-sets/storage/submit-attempt.ts:165-218`, `packages/buddy/src/learning/features/memory/ingestion.ts:12-148`, `packages/web/src/components/bench/flashcard-bench-review.tsx:165-202`, `packages/web/src/components/bench/question-set-bench-review.tsx:257-267`, `packages/web/src/routes/$directory._bench.objects.$kind.$objectID.tsx:1021-1036`
- **Trigger:** Lose the HTTP response after a durable review/attempt commit, or make learner-memory event/index/evidence ingestion fail after that commit; then retry from an error UI or transport client.
- **Expected:** The client supplies a stable submission identity, the backend returns the prior result for a retry, and learning-state commit plus downstream memory ingestion use an idempotent outbox/reconciliation path.
- **Observed in discovery:** Neither request schema contains an idempotency key. A flashcard review commits the updated deck and a new review record before awaiting learner-memory ingestion; a question set writes a newly generated attempt file before doing the same. Any later error becomes an HTTP failure even though the core action is durable. Retrying creates another review/attempt ID; the flashcard path schedules the already-updated card again. Question-set UIs keep the answers and permit another submission, while flashcard UIs surface a generic error with no way to tell whether the rating committed.
- **Impact:** One ambiguous network/index failure can double-advance or double-penalize a card, duplicate assessment attempts/evidence, and feed false mastery or weakness into learner memory.
- **Verification pending:** Inject response loss and failures after each durable write and each ingestion stage, retry with identical UI input, restart, and assert one review/attempt, one schedule transition, one memory event/evidence record, and the original result returned to the retry.
- **First-pass confidence:** High.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage and seams with no additional retained candidate

- Lesson-workspace session/path normalization, supported-language mapping, typed SDK calls, frontend conflict display, checkpoint/status behavior, file activation, and LSP response assembly were traced. Relative-path containment did not produce a separate candidate; concurrency and multi-file durability are captured in `L09-C01`.
- Managed-object manifest schemas, kind/object/revision IDs, index cache rebuild behavior, duplicate-ID resolution, tombstones, kind registration, generic reads/views, and the flashcard/question-set consumers were traced. Generic record/index lifecycle failures are owned here; whiteboard-specific `sessions.json` indexing remains in `LAUNCH-10`.
- Learner-memory enablement, startup extraction leases/budgets, transcript source filtering/redaction, JSONL events, evidence, stage-one SQLite claims, consolidation leases, working/consolidated retrieval, maintenance, tools, routes, prompt snapshots, and settings UI/API paths were included. The learner-global root is intentional; the retained failures are its consent, deletion, concurrency, and publication semantics.
- Secret redaction covers common OpenAI/AWS/Bearer/key-value forms in source and model output. Pattern completeness needs future privacy hardening, but no additional candidate was retained without a concrete release-path secret fixture.
- Question-set authoring validates unique IDs, correct-choice cardinality, none-of-the-above rules, and exact selected-choice sets. No incorrect scoring candidate was retained in this pass.
- Flashcard scheduling, pending-review recovery, daily new/review limits, leech handling, and local-calendar grouping were traced. Absolute due timestamps remain stable across restart; local-day regrouping after a time-zone change and one-hour DST wall-clock drift were noted but not retained without a clearer product contract or material launch impact.
- The current curriculum SQL table is declarative and unused; durable active goals flow through learner-global `goals.json`. Curriculum/assessment subagent prompts and feature wiring add no separate persistence path beyond the candidates above.
