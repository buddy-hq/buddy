# LAUNCH-06 — Session lifecycle, event streaming, transcript state, and runtime isolation

Audit date: 2026-07-13
Pass status: Verification complete
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records the completed discovery and independent verification passes. Every retained finding below was traced through the current Buddy code path; focused probes were used where they materially strengthened the result.

## Candidate bugs

None. All nine discovery candidates were resolved by the verification pass.

## Verified bugs

### L06-C01 — P1 — Abort can cross the authorized notebook boundary by session ID

- **Locations:** `packages/buddy/src/session/orchestration/abort-actions.ts:6-21`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts:160-184`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/middleware/workspace-routing.ts:212-234`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:232-235`
- **Trigger:** A caller knows an active session ID from notebook A and submits the Buddy abort route using a different allowed notebook B as its directory.
- **Expected:** Session mutations prove that the target session belongs to the authorized directory and return not-found without affecting another notebook.
- **Observed in discovery:** Buddy validates that B is allowed but does not call the session-in-directory ownership check used by the other mutation routes. Vendored workspace routing resolves the session globally by ID and replaces the requested directory with that session's stored directory before the abort handler cancels it.
- **Impact:** A stale renderer, remote client, or confused concurrent notebook can cancel the wrong agent turn, including tools and subagents operating in another notebook.
- **Verification evidence:** `abortSessionRun` validates only that the supplied directory is allowed, then forwards the unbound session ID. The vendored workspace middleware independently resolves that ID and substitutes the session's stored directory before `promptSvc.cancel`; unlike other Buddy mutations, this route never calls `ensureRuntimeSessionExists`. The cross-notebook cancellation path is therefore reachable whenever the caller knows the session ID.
- **Verification result:** Retained as P1.

### L06-C02 — P1 — Async prompt success is acknowledged before durable admission

- **Locations:** `packages/buddy/src/session/orchestration/interaction-actions.ts:90-103`, `packages/buddy/src/session/orchestration/interaction-actions.ts:147-180`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:311-329`, `vendor/opencode/packages/opencode/src/session/prompt.ts:1035-1071`
- **Trigger:** Buddy, the backend utility, or the machine stops after `/prompt_async` returns 204 but before the forked prompt fiber persists the user message and parts, or the detached fiber fails during prompt preparation.
- **Expected:** A success acknowledgement means the prompt is durably queued for exactly-once processing across restart; otherwise admission fails synchronously.
- **Observed in discovery:** The vendored handler checks that the session exists, forks the complete legacy prompt operation into the server scope, and immediately returns no-content. User-message persistence occurs later inside that fork, with no durable inbox, admission record, or acknowledgement barrier. Buddy then runs its accepted-prompt hook after receiving this non-durable acknowledgement.
- **Impact:** An optimistic user turn can disappear after an acknowledged submission, while learner evidence or other accepted-prompt state can say it was admitted. The user has no reliable retry truth and a retry can duplicate a prompt that did persist.
- **Verification evidence:** The HTTP handler performs only `requireSession`, forks the complete `promptSvc.prompt` effect into process scope, and immediately returns `NoContent`. `createUserMessage` and both message/part writes execute inside that detached effect, after the acknowledgement boundary. No admission record, durable queue, or restart replay exists, while Buddy's `onAccepted` hook runs after receiving the 204.
- **Verification result:** Retained as P1.

### L06-C03 — P1/P2 — Concurrent prompts and compaction markers can be persisted but never drained

- **Locations:** `vendor/opencode/packages/opencode/src/effect/runner.ts:115-138`, `vendor/opencode/packages/opencode/src/session/prompt.ts:1052-1071`, `vendor/opencode/packages/opencode/src/session/prompt.ts:1081-1130`, `vendor/opencode/packages/opencode/src/session/prompt.ts:1319-1347`, `vendor/opencode/packages/opencode/src/session/compaction.ts:513-536`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts:273-293`
- **Trigger:** A second prompt/command or manual summarize request arrives while the same session's provider turn is active, such as through two clients, a stale busy status after reconnect, or nearly simultaneous submissions.
- **Expected:** The second operation is rejected as busy before persistence or enters a durable queue that the active runner is guaranteed to drain.
- **Observed in discovery:** Prompt and summarize persist their new user/compaction records before entering the per-session runner. `ensureRunning` discards newly supplied work when a runner already exists and merely awaits that run. If the active provider step returns its normal `stop`, the loop breaks without reloading messages, so the concurrent record can remain unanswered until an unrelated future turn happens to restart the loop.
- **Impact:** A request can report success yet leave a visible user turn or requested compaction permanently pending, with client behavior depending on a narrow race. Retrying can later cause duplicate or unexpectedly ordered work.
- **Verification evidence:** Both prompt and summarize persist their records before calling `loop`. `Runner.ensureRunning` discards the new work effect when the session is already running and only awaits the existing deferred. The active loop loaded its message snapshot before the concurrent record existed and breaks immediately on a normal `stop`, so neither caller starts a drain of the newly persisted work before returning success.
- **Verification result:** Retained as P1/P2.
- **Reassessment status:** Open. The notebook-wide Buddy admission mechanism was discarded.
- **Why reopened:** Vendored OpenCode owns prompt persistence and runners by `SessionID`. The rejected implementation serialized every session in a notebook and added a separate Buddy admission/monitoring lifecycle, breaking independent conversations without fixing the vendor owner.
- **Later work:** Correct or adopt the behavior at the vendored prompt/run-state owner during a tracked vendor update. The acceptable outcome is atomic same-session busy rejection before persistence or a queue the vendored runner durably drains. Do not add a Buddy project or session gate.

### L06-C04 — P1 — Aborting a Buddy tool does not stop its underlying durable mutation

- **Locations:** `packages/buddy/src/learning/runtime/create-buddy-tool.ts:162-179`, `packages/buddy/src/learning/runtime/create-buddy-tool.ts:204-227`, `packages/buddy/src/learning/features/lesson-workspace/tools/restore-checkpoint.ts:14-28`, `packages/buddy/test/session/abort-tools.test.ts:10-23`, `packages/buddy/test/session/abort-tools.test.ts:49-74`
- **Trigger:** The user aborts while a Buddy tool is awaiting permission, storage, or another asynchronous step and the tool implementation does not explicitly observe `ctx.abort` before its later mutation.
- **Expected:** Abort either cooperatively cancels and joins the tool operation before the turn is terminal, or the runtime keeps authority over the operation until it settles and reports its real outcome.
- **Observed in discovery:** The shared wrapper races `definition.execute()` against an abort rejection but neither cancels nor waits for the losing execution promise. Several durable Buddy tools perform writes/restores without signal checks; for example, teaching checkpoint restore can continue after its permission wait. The abort regression test uses an abort-unaware sleeping tool and asserts only prompt rejection, not that the tool stops or cannot mutate later.
- **Impact:** A turn can be shown as aborted while its tool later overwrites a lesson, saves an artifact, updates memory, or performs another durable side effect. This breaks cancellation truth and can cause changes after the user believes execution has stopped.
- **Verification evidence:** The shared wrapper is a `Promise.race` and has no way to cancel or join `definition.execute`. A focused in-process probe latched an abort-unaware Buddy tool after execution began, aborted its context, observed the exposed execution reject with `AbortError`, and then observed the tool's delayed mutation complete. `teaching_restore_checkpoint` likewise performs its restore after permission without checking the signal.
- **Verification result:** Retained as P1.
- **Reassessment status:** Open. The generic wait-after-abort wrapper was discarded.
- **Why reopened:** Vendored OpenCode already supplies `Tool.Context.abort`; cancellation must be cooperative at the operation that owns each side effect. The rejected wrapper raced abort and then could wait forever for an abort-unaware promise, making Stop hang without cancelling the mutation.
- **Later work:** Audit Buddy-owned durable tools individually. Propagate `ctx.abort` into cancellable operations and check it at safe transaction boundaries before mutation/publication. Do not add another global tool wrapper that claims cancellation authority it does not have.

### L06-C05 — P1 — A hard restart can strand a session behind an incomplete assistant message

- **Locations:** `vendor/opencode/packages/opencode/src/session/prompt.ts:1081-1130`, `vendor/opencode/packages/opencode/src/session/prompt.ts:1186-1219`, `vendor/opencode/packages/opencode/src/session/status.ts:21-48`, `vendor/opencode/packages/opencode/src/session/run-state.ts:77-86`, `packages/web/src/state/chat-reducer.ts:19-32`, `packages/web/src/state/session-status.ts:59-75`, `packages/web/src/lib/directory-chat/use-directory-chat-state.ts:461-467`, `packages/web/src/components/prompt/submit.ts:26-41`, `packages/web/src/state/chat-actions.ts:1946-1992`
- **Trigger:** The backend is killed, crashes, loses power, or is OOM-terminated after persisting an assistant row but before the provider step records completion/error.
- **Expected:** Restart deterministically marks the interrupted row terminal or resumes it, and the composer remains usable without relying on ephemeral client repair.
- **Observed in discovery:** The assistant record is persisted before provider execution and finalized only by an in-process interruption finalizer. A hard stop bypasses that finalizer, while session run status is in-memory and restarts as idle. The frontend independently treats the last assistant with no error, finish, or completion time as active and turns submit into abort. Post-restart abort finds no runner and repairs only client-local message state; the server row remains incomplete and can become active again on transcript reload.
- **Impact:** A session can reopen permanently in an abort-only/busy state after an ordinary crash-recovery event, hiding recovery behind repeated local state and forcing the user to abandon or manipulate the thread.
- **Verification evidence:** The assistant row is persisted before provider execution and receives its terminal error/completion only from an in-process interruption finalizer. Session status and runners are instance-memory maps that restart idle, and no startup repair scans incomplete assistant rows. The frontend infers busy from that durable incomplete row; abort with no runner publishes idle and only seals/marks the local transcript, while a subsequent server reload restores the same incomplete row.
- **Verification result:** Retained as P1.

### L06-C06 — P1/P2 — Slow event subscribers have unbounded backend queues

- **Locations:** `packages/buddy/src/routes/compatibility.ts:151-170`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts:33-65`, `vendor/opencode/packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts:25-41`, `packages/buddy/src/http/opencode-event-stream.ts:181-219`, `vendor/opencode/packages/core/src/event.ts:110-164`
- **Trigger:** A renderer is suspended/backgrounded, a TCP client remains open without reading, or a large/high-rate stream of text deltas, tool events, file events, and Buddy client actions outruns one subscriber.
- **Expected:** Per-subscriber buffers are bounded; overflow disconnects that subscriber with a resync requirement or applies a documented safe coalescing policy.
- **Observed in discovery:** Buddy proxies the vendored global stream. That stream uses a callback queue fed by `Queue.offerUnsafe` with no capacity, and the instance stream explicitly uses `Queue.unbounded`. Buddy's multiplexed stream also enqueues broker events without inspecting demand. A bounded `allBounded` helper with an overflow error exists in the event package but is not used by these HTTP handlers.
- **Impact:** One or more slow clients can retain an unbounded number of global event payloads and grow backend memory until severe pressure or OOM terminates every notebook session.
- **Verification evidence:** The instance handler explicitly constructs `Queue.unbounded`, the global callback feeds `Queue.offerUnsafe` without capacity, and Buddy's multiplexing `ReadableStream` enqueues broker events independently of downstream demand. The core event package already exposes `allBounded` with an overflow error, but neither HTTP event handler uses it. Queue growth is therefore structurally unbounded for a connected slow subscriber.
- **Verification result:** Retained as P1/P2.

### L06-C07 — P1 — Session patch attribution can capture and later erase concurrent work

- **Locations:** `vendor/opencode/packages/opencode/src/session/run-state.ts:35-69`, `vendor/opencode/packages/opencode/src/session/processor.ts:424-469`, `vendor/opencode/packages/opencode/src/session/processor.ts:539-553`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:55-64`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:235-298`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:318-379`, `vendor/opencode/packages/opencode/src/session/revert.ts:38-87`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:408-523`
- **Trigger:** Two sessions in the same notebook mutate files concurrently, or the user/external editor changes a file between one agent step's starting snapshot and finishing patch capture; that session is later reverted.
- **Expected:** A session patch contains only mutations causally owned by that turn, and revert detects conflicts rather than overwriting unrelated later work.
- **Observed in discovery:** Run serialization is per session, so same-directory sessions can execute together. Snapshot locking serializes Git bookkeeping only; it does not isolate writes. At step finish, `patch` stages and diffs all worktree changes since the starting tree, so another session or the user can be attributed to the first turn. Revert checks only the selected session's busy state, then force-checks out or deletes every file listed in its patches.
- **Impact:** Reverting one turn can silently overwrite or delete another active session's work or edits made directly by the user, causing cross-session attribution errors and durable data loss.
- **Verification evidence:** Run serialization is keyed only by session ID. Snapshot `track` and `patch` serialize Git bookkeeping but `patch` stages every changed/untracked worktree path since the starting tree, with no session ownership metadata. Revert later enumerates those paths and force-checks them out or deletes them after checking only the selected session's busy state, so concurrent session or user edits can be captured and overwritten.
- **Verification result:** Retained as P1.
- **Reassessment status:** Open. Vendor-backed revert/unrevert behavior was restored.
- **Why reopened:** The hardening pass disabled the feature at Buddy's HTTP layer with unconditional `409` responses even though vendored OpenCode owns snapshot attribution and rewind semantics. That removed vendor behavior without correcting causal attribution.
- **Later work:** Address attribution/conflict detection at the vendored snapshot/revert owner in a tracked vendor parity change. Until then, preserve vendor behavior and document the risk; do not replace it with a Buddy route-level ban.

### L06-C08 — P1/P2 — Revert and unrevert report success after partial filesystem failure

- **Locations:** `vendor/opencode/packages/opencode/src/snapshot/index.ts:162-165`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:382-405`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:425-443`, `vendor/opencode/packages/opencode/src/snapshot/index.ts:466-523`, `vendor/opencode/packages/opencode/src/session/revert.ts:68-98`
- **Trigger:** Git checkout/read-tree fails, a file is locked by another Windows process or antivirus, permissions change, deletion fails, or storage returns an I/O error during revert/unrevert.
- **Expected:** The mutation fails atomically or reports a non-success result while preserving transcript/revert state that accurately describes the filesystem.
- **Observed in discovery:** Snapshot restore logs failed Git commands and returns normally. Single-file revert logs and keeps a file when checkout fails, while the removal helper catches every failure. Session revert then records the revert marker and hides the message range; unrevert clears its marker after restore returns, regardless of these suppressed filesystem failures.
- **Impact:** Buddy can claim undo/restore succeeded and alter the visible transcript while files are only partially changed. The user may continue from a false state, overwrite work, or lose the built-in path back to the pre-revert snapshot.
- **Verification evidence:** `Snapshot.restore` logs failed `read-tree`/`checkout-index` and returns success. Per-file revert similarly keeps a file after failed checkout when it existed in the snapshot, and its removal helper catches every filesystem error. `SessionRevert` then sets or clears the transcript revert marker because those snapshot operations cannot signal failure to it.
- **Verification result:** Retained as P1/P2.

### L06-C09 — P1/P2 — Buddy runtime plugin bootstrap fails open to an unguarded reduced runtime

- **Locations:** `packages/opencode-adapter/src/plugin-live.ts:68-101`, `packages/opencode-adapter/src/plugin-live.ts:161-204`, `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts:144-186`
- **Trigger:** Buddy runtime hook creation fails during bootstrap graph preload, tool catalog compilation, tool UI registration, dynamic import, duplicate registration, or another plugin-factory error.
- **Expected:** The affected runtime/prompt fails closed with a visible actionable error or enters an explicit degraded state that cannot be mistaken for the Buddy persona.
- **Observed in discovery:** Runtime factory rejection removes the cached promise, logs a warning, and returns an empty hook list. Patched plugin initialization, listing, and triggers then continue with only upstream hooks. The omitted Buddy factory owns the Buddy tool map and auth hook as well as message/system transformations and system-prompt capture.
- **Impact:** A prompt can run without the tools, auth integration, instruction filtering, and message transforms that define its configured Buddy runtime. Failures become nondeterministic behavior or authority differences rather than a bounded startup error.
- **Verification evidence:** `loadRuntimeHooks` deletes its cache entry and rethrows a factory error, but `getRuntimeHooks` converts every such error to `EMPTY_RUNTIME_HOOKS`. Patched plugin init, list, and trigger then continue with upstream hooks. The sole registered Buddy factory builds the complete Buddy tool map, auth hook, instruction filtering, system transform, and prompt capture, so a factory failure produces a normal-looking but materially reduced runtime rather than failing the request or declaring degraded state.
- **Verification result:** Retained as P1/P2.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Session create/list/get/update, same-project nested-directory ownership, forking, archive/delete, and paginated message retrieval were traced without another high-impact candidate.
- Frontend optimistic-message promotion, orphan-part adoption, active-load merge/tombstones, adjacent delta coalescing, transcript pagination, and bounded inactive-session eviction were reviewed without a retained candidate.
- Reconnect performs session, status, permission, question, and active-transcript resynchronization; no separate event-order or reconnect-loss candidate survived the first pass.
- SSE frame normalization and multiline-data handling, instance async context, canonical instance keys, config-overlay invalidation, one-time runtime patching, and desktop global runtime disposal were reviewed without another retained candidate.
- Vendored cancellation does interrupt the active runner and background-job tree when operations cooperate with its signal; the retained cancellation candidate is specifically the detached Buddy tool promise boundary.

## Discovery candidate intentionally not promoted

- Live `message.part.updated` frames carry their part under `payload.properties`, while `packages/buddy/src/http/opencode-event-stream.ts:75-84` attempts to decorate `payload.part`. This can omit Buddy tool labels/hidden-summary metadata until transcript reload, but it was not promoted because the reviewed effect is presentation-only and below this campaign's critical/high-impact threshold.
