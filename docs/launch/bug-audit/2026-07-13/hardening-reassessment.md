# Hardening pass reassessment

## Status

Reassessment complete as of 2026-07-14. This is the decision log for the eight commits that were
moved back into the `main` working tree for a from-first-principles review. No implementation was
accepted merely because it closed an audit checkbox. The surviving Buddy-owned diff passes focused
tests, repository lint, and root typecheck; rejected vendor-owned mechanisms are absent.

The task's pre-compaction user text, assistant text, reasoning summaries, file changes, and
compaction markers are preserved verbatim in [hardening-thread-history.md](hardening-thread-history.md).

## Non-negotiable ownership boundary

This hardening pass applies to Buddy-owned behavior and Buddy-owned state. When vendored OpenCode
owns a runtime behavior—and especially when its backend and desktop app already implement that
behavior—Buddy must reuse or adopt the vendor pattern. Buddy must not add a parallel lock, queue,
gate, polling monitor, lifecycle, or recovery system on top. If there is no verified vendor-native
correction, leave the finding open instead of inventing a Buddy mechanism to close it.

## Review rule

For every new lock, queue, gate, journal, or recovery state:

1. Identify the actual owner and concurrency key.
2. Compare runtime/session behavior with vendored OpenCode before adding a Buddy mechanism.
3. Keep a Buddy mechanism only for Buddy-owned product or durable state.
4. Discard a redundant or over-broad mechanism instead of layering another patch over it.
5. Reopen the original finding when the proposed implementation is rejected.

## Final disposition ledger

| Commit | Group | Ownership evidence | Preliminary disposition | Reason / required action |
| --- | --- | --- | --- | --- |
| `7688d3f146` | Directory scope plus idempotent review/question-set submissions | HTTP directory selection, flashcard, question-set, and learner-memory files are Buddy-owned compatibility/product state. | **Keep with client correction** | Conflicting query/Buddy/OpenCode directory scopes now fail instead of silently choosing one. Durable request records return the original result for the same key, reject key/payload conflicts, and use stable learner-memory event IDs. Both flashcard clients use a synchronous in-flight ref, so two rating callbacks cannot enter before React commits `submitting`; each admitted callback captures one immutable request payload and key. All 29 focused backend/web tests pass. |
| `fb6c6b6d9c` | Learner-memory locks and consolidation publication | Learner memory is Buddy-owned and learner-global. | **Keep with correction** | The learner-global lock and consolidation publication journal match the state owner. Deterministic memory now performs select/create-or-update/write through one narrow atomic upsert under that same lock, and its `memory_applied` effect event is append-once from the stable source event. No second queue or lock owner was added. Focused concurrency, goal-scope, and publication-recovery tests pass. |
| `e9c39d0dfc` | Session turn admission and disabled rewind | Vendored `SessionRunState` stores runners by `SessionID`; different sessions are independent. Vendored revert/unrevert owns transcript and snapshot behavior. | **Discarded; finding reopened** | Removed notebook/project-wide single-flight admission, async admission polling, stream-lifetime callbacks, and unconditional Buddy `409` responses for revert/unrevert. No replacement Buddy turn-admission mechanism is accepted. The same-session vendor race remains open for a vendor-native correction. |
| `0fc24915d7` | Resource extraction budgets | Resource preparation is Buddy-owned. | **Keep partially; finding remains open** | Keep source, declared archive expansion, parser-growth, text, page, and chunk ceilings. The one-process global promise queue was removed because one stuck build blocked every resource/notebook, and parallel selective-PDF analysis was restored. All 31 resource tests pass. Wall-clock timeout, cooperative cancellation, actual inflated-byte enforcement, and a justified concurrent-work policy remain open; the current limits alone do not close `L10-C04`. |
| `26627b9982` | Backend recovery and multi-window ownership | Vendored OpenCode has an Electron desktop owner for window registration/restoration, focused-window routing, deep-link buffering, and local-sidecar lifecycle. | **Discarded; findings reopened** | The parallel Buddy `main-window-registry`, `pending-deep-links`, and `backend-supervisor` abstractions and their tests are deleted. The three touched Buddy desktop files match the pre-hardening parent. If multi-window support is still required, port the vendor registry/window flow as a separate parity change. Do not retain a novel restart supervisor merely to close the audit. |
| `c97af9cd08` | Atomic file writes, locks, and abort wrapper | Config, lesson workspace, and project-editor writes are Buddy-owned. Tool cancellation is already signaled by vendored OpenCode through `Tool.Context.abort`. | **Split: keep with correction; abort discarded** | Keep atomic individual replacement and config/lesson mutation serialization. Project-editor locks now live in Buddy global state and are keyed by lexical plus resolved target identities instead of appearing beside user files. The generic wait-after-abort wrapper was removed. Thirty-one focused config, project-editor, directory-scope, and teaching tests pass. This does not claim a crash-atomic transaction across multiple lesson files. |
| `ec652c505b` | Onboarding completion gate | Onboarding is Buddy product state. | **Keep with correction** | The entry resolver requires persisted `setupCompleted`. The live route no longer derives or writes completion from “connected OpenAI + any open project”; connectivity may preselect the provider UI only. Completion is now written solely at the explicit successful setup boundary. All 32 focused onboarding tests pass. |
| `b8b7a17caf` | Audit and deployment documentation | Documentation must describe the code that survives this reassessment. | **Rewritten** | `combined.md` and the owning finding files now report 9 resolved and 7 open blockers, explain every rejected implementation, and constrain later work to the correct vendor or Buddy owner. |

## Completed exit plan

1. Removed the entire `26627b9982` desktop diff: restored its tracked Buddy desktop files to
   the pre-hardening parent and delete its new helpers/tests. Do not replace it during this pass.
2. Kept `e9c39d0dfc` session admission and the `c97af9cd08` generic abort wrapper removed. No
   design replacements in this pass; their vendor-owned findings remain open.
3. Retained only the Buddy-owned groups in the ledger: directory conflict rejection, durable
   flashcard/question-set idempotency, corrected learner-memory mutation/publication, config and
   lesson-workspace serialization, project-editor compare-and-replace, corrected onboarding state,
   and the bounded subset of resource limits.
4. Ran the focused flashcard/question-set backend and web tests. Previously recorded
   focused passes cover learner memory (15), onboarding (32), config/project/teaching/directory
   routes (31), and resources (31). The desktop tests cease to be acceptance evidence because that
   implementation is being discarded.
5. Rewrote `combined.md` and affected finding files to reopen `L02-C03`, `L03-C02`, `L06-C03`,
   `L06-C04`, `L06-C07`, and the incomplete portion of `L10-C04`; remove historical resolved-count
   claims that depended on rejected mechanisms.
6. Ran repository-root `bun lint` and `bun typecheck`; both passed. `bun fmt` remains intentionally
   deferred until the user is satisfied.

No wholesale reset is required. `main` already points at the pre-hardening parent, and the original
eight-commit chain remains recoverable in `hardening-audit`. The surviving changes are uncommitted,
so rejected groups can be removed path-for-path while preserving corrected Buddy-owned work.

## Vendor comparison notes

### Session execution

- `vendor/opencode/packages/opencode/src/session/run-state.ts` owns a map of runners keyed by
  `SessionID`.
- `vendor/opencode/packages/opencode/src/effect/runner.ts` joins an existing run for the same
  session; it does not serialize unrelated sessions in one project.
- `vendor/opencode/packages/opencode/src/session/prompt.ts` persists the user message before calling
  `ensureRunning`. This confirms the same-session admission race is real, but it does not justify a
  notebook-wide mutex.

Decision: reject Buddy-owned turn admission at both project and session scope. The hardening
mechanism stays removed, and the finding stays open rather than being relabeled as fixed. Any later
correction must be made at the vendored runner/prompt owner or adopted from its established pattern;
Buddy must not grow another gate, queue, polling monitor, or parallel session lifecycle.

### Tool abort

- Vendored OpenCode supplies `Tool.Context.abort` and its built-in tools perform cooperative
  cancellation around the operation they own.
- The hardening wrapper in `packages/buddy/src/learning/runtime/create-buddy-tool.ts` races the tool
  against abort, then waits without a deadline for the original promise to settle.
- Most Buddy tools do not observe the signal, so this can turn Stop into an unbounded wait.

Decision: reject the generic wait-after-abort wrapper. Audit durable mutation tools individually and
place cancellation checks at safe transaction boundaries.

### Review and question-set idempotency

- These routes mutate Buddy object state and Buddy learner memory; vendored OpenCode has no owner
  for these product transactions.
- Flashcard review already serialized one object inside the active backend before this hardening
  pass. The new pending transaction records the updated deck, review record, response, request hash,
  and stable ingestion event before publication. Recovery can repeat every atomic write safely.
- Question-set attempts serialize with a file lock scoped to the question-set object. Each
  submission has its own pending transaction, committed response, and pending-ingestion record.
- Learner-memory ingestion is append-once by stable event ID. A crash between ingestion and outbox
  cleanup may replay the event, but cannot append it twice.

Decision: keep the durable server-side design. Do not broaden it into a new global queue or gate.
The pre-existing flashcard in-process queue is not being reclassified as cross-process protection.

### HTTP directory scope

- Directory selection is Buddy's compatibility boundary around typed SDK query parameters and the
  Buddy/OpenCode directory headers.
- Silently preferring the query value allowed a directory-scoped client header to disagree with the
  route payload. Resolving each non-empty scope and rejecting more than one distinct result is the
  smallest safe behavior; matching scopes continue normally.

Decision: keep conflict rejection. It removes ambiguous authority without adding state, a lock, or
a second runtime owner.

### Learner-memory serialization

- `LearnerMemoryPath.root(directory)` intentionally resolves to one learner-global root, so one
  `.mutation.lock` under that root has the correct ownership and cross-process key.
- Direct same-memory status, edit, strength, delete, reset, event append, and goal-set mutations now
  keep their read/modify/write sequence under that lock.
- `upsertDeterministicLearnerMemory` still calls `listLearnerMemories` before entering the lock used
  by `createLearnerMemory` or `writeLearnerMemory`. Concurrent review/question-set ingestion can
  both select “missing,” or both derive updates from the same prior value.
- Replaying one stable ingestion can also append multiple random `memory_applied` events even when
  the stable source event and evidence file deduplicate successfully.

Decision: retain the correctly owned lock. The deterministic path now uses one narrow atomic upsert
primitive and makes its effect event append-once from the stable source event. No second queue or
lock owner was added. Focused concurrency verification passes.

### Desktop window and backend lifecycle

- `vendor/opencode/packages/desktop/src/main/window-registry.ts`, `windows.ts`, and `index.ts` already
  own Electron window registration/restoration, last-focused routing, new-window behavior, and
  pending deep links.
- `vendor/opencode/packages/desktop/src/main/server.ts` and `index.ts` own local-sidecar startup,
  readiness, health observation, and shutdown. The vendor currently logs a later exit rather than
  offering the Buddy hardening commit's restart/quit supervisor.
- The hardening commit created separate Buddy `main-window-registry`, `pending-deep-links`, and
  `backend-supervisor` state machines. Their focused tests prove their local behavior only; they do
  not justify duplicating the established desktop owner or adding stronger recovery semantics that
  the vendor owner does not implement.

Decision: discard commit `26627b9982`'s current implementation and reopen `L02-C03` and `L03-C02`.
Restore the touched Buddy desktop files and delete the new helpers/tests. Multi-window behavior may
later be ported deliberately from the vendor registry/window flow. Backend restart supervision stays
open unless it becomes an explicit Buddy product requirement; it must not survive merely because a
hardening checkbox requested it.

Removal completed: the three tracked Buddy desktop files now match the pre-hardening parent, all six
new helper/test files are absent, and `git diff` reports no remaining `packages/desktop-electron`
changes.

### Onboarding completion

- `setupCompleted` is persisted Buddy onboarding state and is the only available durable attestation
  that the setup sequence reached its completion boundary.
- The entry resolvers added by this hardening commit correctly return onboarding before consulting
  open-project recovery when `setupCompleted` is false.
- The mounted onboarding route still calls `markSetupCompleted()` when OpenAI is connected and any
  open project exists. A partially created/opened notebook from an interrupted setup satisfies that
  condition, so the route immediately undoes the resolver's protection.

Decision: keep the persisted gate. The live route's derived-completion branch and its helper were
removed. Existing provider connectivity may preselect the provider UI; neither provider state nor
notebook presence writes the completion flag. Focused onboarding verification passes.

### Config, lesson workspace, and project files

- Project config patches are serialized by the resolved notebook config-file path, so a repository
  root and one of its nested directories share the same in-process owner. The merge now occurs
  inside that critical section instead of using a stale pre-lock snapshot.
- Teaching workspace operations serialize by the session-owned `.buddy/teaching/<session>` root.
  Lesson, checkpoint, and metadata replacements are individually atomic. This prevents competing
  revisions from both committing, but it is deliberately not described as a crash-atomic
  transaction across all three files.
- Project-editor compare-and-save is Buddy UI behavior. It locks both lexical and resolved target
  identities, stages a same-directory replacement, and rechecks target identity plus content
  version immediately before rename. Locks are stored under Buddy global state, not in the user's
  project or watched directory.
- Vendored OpenCode supplies cancellation to tools but does not own these Buddy file transactions.
  The removed generic abort wrapper is not needed for the retained file serialization.

Decision: keep the file/config/workspace mechanisms with the relocated project lock; keep the
generic abort wrapper discarded. Do not upgrade the documentation to claim multi-file crash
transactions or perfect protection from external filesystem actors.

### Resource preparation budgets

- Resource preparation and its derived packs are Buddy-owned; vendored OpenCode has no parser or
  resource-build concurrency owner to reuse.
- Source-size admission occurs before whole-file PDF/EPUB/DOCX extraction. Declared archive entry,
  per-entry, and aggregate expansion ceilings precede referenced ZIP-entry inflation. Page/text
  growth is checked inside PDF/EPUB loops, and chunk counts are checked during splitting rather than
  only after all derived output exists.
- The hardening commit's module-global promise tail did not express a resource or notebook owner.
  One hung parser would block every later resource in the process. It was removed; only the
  pre-existing per-pack in-flight deduplication remains.
- Selective OCR's complexity scan and native parse are independent and were restored to parallel
  execution. The page-count check already runs through PDF metadata before those parser modes.
- The numeric ceilings are product policy, not vendor-derived guarantees. They still need real
  large-textbook measurements, especially the 64 MiB source ceiling.
- There is still no wall-clock deadline, parser/subprocess cancellation, trustworthy accounting of
  bytes actually inflated when an archive lies, or justified bounded-concurrency policy.

Decision: retain the early/growth budgets and the user-visible failure. Do not replace the rejected
global queue until the remaining work has an explicit owner, bounded waiting, and cancellation.
`L10-C04` is partial/open, not fixed.

## Change log

- **2026-07-14:** Moved commits `7688d3f146` through `b8b7a17caf` back into the `main` working tree
  with their code preserved. Chemistry work remains isolated in the `chemistry-pipeline` worktree.
- **2026-07-14:** Reopened the combined audit's resolved claims pending this reassessment.
- **2026-07-14:** Rejected notebook-wide session admission and the generic wait-after-abort pattern
  based on vendored ownership and failure behavior.
- **2026-07-14:** Removed the rejected session admission/monitoring group and restored vendor-backed
  revert/unrevert. `L06-C03`, `L06-C04`, and `L06-C07` are open again pending minimal designs.
- **2026-07-14:** Incorrectly began reconstructing turn admission as a smaller process-local
  `SessionID` lease after the group had already been rejected. This repeated the prohibited Buddy
  gate pattern. The new module and all partial interaction-runtime wiring were removed immediately;
  no route ever used them. Verified `interaction-actions.ts` is back to its pre-attempt contents and
  the temporary admission file no longer exists. The durable decision remains: no Buddy turn gate;
  keep the vendor-owned race open until there is a vendor-native correction.
- **2026-07-14:** Exported the complete textual task history available through the Codex history
  API into `hardening-thread-history.md`: 12 user messages, 39 assistant messages, 48 reasoning-
  summary items, 25 file-change records, and three compaction markers across four chronological
  turns. Added the vendor-ownership rule above as a non-negotiable boundary so later compactions
  cannot reinterpret the rejected session gate as pending implementation. The API exposes concise
  reasoning summaries rather than a hidden token-by-token stream; the export states that limitation
  and reproduces every textual item it returned without reconstruction.
- **2026-07-14:** Removed the global resource build queue and restored parallel selective-PDF
  analysis while retaining extraction budget checks.
- **2026-07-14:** Kept project-editor atomic compare-and-replace, but moved its cross-process locks
  from adjacent user-project files into Buddy global state keyed by canonical target identity.
- **2026-07-14:** Corrected the flashcard client admission race in both review surfaces. React state
  remains presentation state; a synchronous ref now admits exactly one rating callback, and that
  callback owns a local immutable idempotency key and payload. This removes the pre-render window
  where two different ratings could share one key and turn a successful review into a visible
  conflict.
- **2026-07-14:** Accepted the server-side review/question-set idempotency design after tracing its
  write ordering and crash replay. It is scoped to Buddy object and learner-memory state, uses
  stable append-once ingestion events, and adds no vendor-runtime concurrency owner. No additional
  global or notebook-wide serialization was added.
- **2026-07-14:** Completed focused verification for the retained review/question-set group. All 14
  backend flashcard/question-set route tests and all 15 web Bench/inline-idempotency tests passed.
  This includes committed retry replay, key/payload conflict rejection, orphan recovery, pending
  flashcard recovery, key rotation after answer changes, and failed-key reuse after remount.
- **2026-07-14:** Rejected the claim that learner-memory serialization was complete. Deterministic
  memory upsert still selects outside the learner-global lock, leaving duplicate/lost-update races
  during concurrent durable ingestion. The lock and publication journal remain salvageable; the
  upsert and its effect event require a narrow atomic/idempotent correction.
- **2026-07-14:** Corrected that remaining learner-memory race without adding another concurrency
  mechanism. A shared atomic upsert now performs deterministic select/create-or-update/write under
  the existing learner-global file lock. Its `memory_applied` event ID is derived from the stable
  source event and appended once, so concurrent/replayed ingestion cannot duplicate the effect
  event. Added a concurrent replay regression test; execution is pending the focused test pass.
- **2026-07-14:** The first direct focused-test invocation did not execute product assertions. It
  bypassed Buddy's required test bootstrap: the goal suite rejected real global storage paths for
  missing `BUDDY_TEST_HOME`, and the memory suites then encountered the associated initialization
  cycle. This is classified as an invalid test invocation, not a code failure; rerun through the
  repository-configured test environment.
- **2026-07-14:** Reran through `packages/buddy/test/preload.ts`: all 15 focused learner-memory,
  consolidation-publication, and goal-scope tests passed, including the new concurrent deterministic
  replay regression. The memory correction is accepted subject to the later repository lint and
  root typecheck gates.
- **2026-07-14:** Accepted the desktop window registry and backend supervisor after tracing startup,
  ready, stale-child, intentional-stop, close, focus, and broadcast paths. All six focused desktop
  state-machine tests passed. Deep-link storage is accepted only for main-window ownership and
  ordering; no unimplemented renderer-acknowledgement guarantee is being claimed.
- **2026-07-14:** Reversed that desktop acceptance after applying the clarified vendor-ownership
  boundary to `vendor/opencode/packages/desktop`. The vendor already has Electron window registry,
  last-focused routing, window restoration, deep-link buffering, and sidecar lifecycle patterns.
  The Buddy hardening commit's parallel registries and novel restart supervisor are therefore marked
  for discard despite their six passing unit tests. `L02-C03` and `L03-C02` are reopened; any later
  multi-window correction must be a vendor-parity port, not another local state-machine design.
- **2026-07-14:** Removed the complete desktop hardening group. Restored `index.ts`, `menu.ts`, and
  `windows.ts` exactly to the pre-hardening parent; deleted the three new desktop state-machine
  helpers and their three tests. Verified there is no remaining `packages/desktop-electron` diff.
  No replacement was added during this pass.
- **2026-07-14:** Reopened all rejected or incomplete findings in their owning audit files with an
  explicit rejection reason and later-work boundary. `combined.md` now reports 9 resolved and 7 open
  launch blockers instead of the obsolete 15/1 split. The reopened blockers are `L02-C03`,
  `L03-C02`, `L06-C03`, `L06-C04`, `L06-C07`, the previously open `L08-C06`, and partially fixed
  `L10-C04`. Vendor-owned later work points to vendor parity/owner changes; Buddy-owned cancellation
  and resource work points to individual operation owners and explicitly forbids replacement global
  wrappers or queues.
- **2026-07-14:** Completed the final ownership/diff sweep before repository checks. There is no
  diff in session prompt/core SDK orchestration, the generic Buddy tool wrapper, the Electron
  package, or `vendor`; the temporary admission and desktop state-machine symbols are absent.
  `git diff --check` passes. The remaining added locks, pending records, journals, and idempotency
  helpers are confined to Buddy-owned config, teaching workspace, project editor, resource,
  flashcard, question-set, learner-memory, onboarding, and HTTP compatibility state. Chemistry and
  unrelated `script/user-command.ts`/`cgpsc_home.html` files remain outside this reassessment.
- **2026-07-14:** Repository completion gates passed. Root `bun lint` exited 0 with six warnings
  (one existing Bench iframe warning, two warnings in unrelated `script/user-command.ts`, and three
  existing dotted-glow warnings). Root `bun typecheck` completed all seven Turbo tasks successfully.
  No formatting was run, per repository instruction.
- **2026-07-14:** Normalized trailing whitespace in the newly added audit Markdown, then staged the
  68-file surviving hardening scope for commit. Cached and working-tree whitespace checks pass.
  Unrelated `script/user-command.ts` and `cgpsc_home.html` remain unstaged; chemistry remains staged
  only in the separate `chemistry-pipeline` worktree. No Electron, session-admission, generic abort-
  wrapper, or vendor paths are staged.
- **2026-07-14:** Rejected the onboarding commit as complete after tracing the mounted route. Its
  connected-provider/open-project auto-continue branch still writes `setupCompleted`, recreating
  `L03-C06` after an interrupted notebook setup. The persisted gate is retained, but completion
  must stop being inferred from incidental provider/project state.
- **2026-07-14:** Removed that derived completion path rather than patching another condition onto
  it. The connected-provider effect now only preselects ChatGPT; it cannot navigate, choose a
  notebook, or call `markSetupCompleted`. Removed the obsolete directory auto-continue helper and
  its test. Focused onboarding verification is pending.
- **2026-07-14:** All 32 focused onboarding-flow tests passed after the correction, including
  incomplete-setup, partial backend registration, stale persisted context, recovery, and pending
  personalization cases. The onboarding group is accepted subject to repository lint/root
  typecheck.
- **2026-07-14:** Accepted the remaining config, directory-scope, teaching-workspace, and
  project-editor changes after the project-lock relocation and abort-wrapper removal. All 31
  focused tests across those four route suites passed. The accepted scope is serialization plus
  atomic individual replacement; multi-file crash atomicity remains explicitly unclaimed.
- **2026-07-14:** Accepted the resource budget checks but not the original closure claim. All 31
  resource tests passed after removing the ownerless global queue and restoring selective-PDF
  parallelism. `L10-C04` remains partial/open for deadlines, cancellation, actual inflated bytes,
  bounded concurrency, and empirical validation of the source ceiling.
- **2026-07-14:** Accepted reviewer finding P2 on append-once learner events. Event IDs are global
  across the learner event log, but the first implementation checked only the incoming event's
  month partition. Append-once now searches every event partition while holding the existing
  learner-global mutation lock. No new lock or index owner was added; a cross-month replay
  regression test covers the failure that previously poisoned SQLite index rebuilds.
- **2026-07-14:** Accepted reviewer finding P2 on PDF metadata failure. Early PDF.js metadata
  extraction remains in place for page-budget admission, but only `ResourceBudgetExceededError`
  aborts extraction. Other metadata failures now produce empty outline metadata plus a warning and
  still proceed through LiteParse/OCR before the existing PDF.js/system fallback chain. A focused
  regression test forces metadata failure while verifying successful LiteParse extraction.
- **2026-07-14:** Verification for both reviewer fixes passed: 57 focused learner-memory and
  resource tests, repository lint, and the single root typecheck. Lint reported only four existing
  warnings in dotted-glow and the Bench iframe test. No formatting was run.

## Repository checkpoint

- Main is intentionally based at `903ab06bc25327d00f234d760d9239fdbce6297e`; the eight hardening
  commits are uncommitted changes here so each mechanism can be kept, reworked, or discarded.
- The original eight-commit chain remains recoverable from the `hardening-audit` branch/worktree.
- The exact chemistry delta is staged only in the `chemistry-pipeline` worktree. It is out of scope
  for this reassessment and must not be edited here.
- `script/user-command.ts` was an unrelated pre-existing main-worktree modification and is excluded
  from every hardening decision.
