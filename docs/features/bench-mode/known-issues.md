# Bench Mode Known Issues

Code-checked 2026-08-30. This file keeps HEAD’s candidate schemas and decision
matrices. **Open** means the gap is still visible in current code.
**Historical / Resolved** keeps shipped lessons without reopening them.

Live architecture: [`current-architecture.md`](current-architecture.md). Tabs:
[`../tabs/system-design.md`](../tabs/system-design.md). External file-sync state
machine (not duplicated here):
[`bench-workspace-file-synchronization-plan.md`](bench-workspace-file-synchronization-plan.md).
Watcher consumption is wired
(`readWorkspaceFileWatcherUpdatePayload` →
`DirectoryWorkspaceLifecycleService.synchronizeWorkspaceFile`); remaining
eight-state completeness belongs in that plan, not as a substitute for the
client-action decision record below.

---

## Historical / Resolved

### Split `bench-navigation.ts`

Status: Resolved (verified: files exist; `bench-navigation.ts` re-exports them).

The original `bench-navigation.ts` mixed target contracts, preferences, layout
policy, open policy, route parsing, transition classification, route
construction, and React navigation. That made future changes too coupled.

Current module split:

```text
packages/web/src/lib/bench-targets.ts
packages/web/src/lib/bench-preferences.ts
packages/web/src/lib/bench-layout-policy.ts
packages/web/src/lib/bench-open-policy-core.ts
packages/web/src/lib/bench-route-adapter.ts
packages/web/src/lib/use-open-bench.ts
packages/web/src/lib/bench-navigation.ts
```

`bench-navigation.ts` remains as a compatibility barrel so existing imports do
not churn.

### Typed client-action channel for agent Bench control

Status: Resolved as an *open work item*. Shipped as `BenchClientActionV2` over
`/api/event` SSE (`directory-workspace-client-actions.ts`, backend
`client-actions.ts`). Transcript is not the live command bus. Keep the original
decision record below.

**Original risk (historical):** `bench_present` returned a tool result, then the
frontend scanned completed chat tool parts to discover presentation actions. That
worked for v1, but the transcript is a weak control bus.

Historical weak spots (addressed by the shipped channel):

- UI action execution depends on transcript retention and parsing.
- Reconnect/replay behavior is easy to get wrong.
- Retries can double-execute unless every event has stable dedupe keys.
- Future artifact presentation or richer agent control would add more parsers.

Decision points that were locked by the shipped design (preserve as the record):

1. Choose the event transport.

   Options:
   - existing chat stream plus structured client-action parts;
   - backend route/action queue polled by frontend;
   - local client event bus fed by tool execution results;
   - websocket/server-sent event channel.

   **Shipped choice:** SSE client-action events on the shared event stream, not
   transcript parsing and not a polled queue.

2. Decide whether actions are persisted or ephemeral.

   **Shipped choice:** required actions pending until terminal completion, abort,
   or expiry; tombstones; live-only best-effort auto-open (see
   `current-architecture.md`).

3. Decide replay semantics after reload/reconnect.

   Questions from the original issue:
   - Should a completed `bench_present` replay open Bench after app reload?
   - Should only not-yet-acknowledged actions replay?
   - Where is the ack stored?

   **Shipped choice:** unexpired required actions redeliver after reconnect;
   completed/expired are tombstoned and not replayed as fresh work.

4. Define action scope.

   Candidate:

   ```ts
   type ClientActionScope = {
     directory: string
     sessionID: string
     actionID: string
   }
   ```

   **Shipped shape:** `BenchClientActionV2` carries `directory`, `sessionID`,
   `actionID`, plus message/call/origin/acknowledgement fields.

5. Define the first action schema.

   Candidate:

   ```ts
   type BenchPresentClientAction = {
     type: "bench.present"
     actionID: string
     target: BenchTarget | null
     close: boolean
   }
   ```

   **Shipped shape:** versioned `command` union (`present`, `focus_tab`,
   `capture_bench_screenshot`, `close`) rather than this v1 sketch.

6. Decide whether `bench_present` returns only model-readable output, or output
   plus a separate non-transcript client action.

   **Shipped choice:** model-readable tool output plus a separate client action;
   transcript observes outcomes.

Recommended direction (historical, executed):

Introduce a typed client-action channel where transcript rendering observes what
happened but does not drive the UI. Keep `bench_present` output model-readable,
and emit a separate deduped `bench.present` action for the frontend to execute.

### Tabs as a product (portion of original runtime-scope issue)

Status: Resolved as “do not implement tabs yet.” Chat-scoped tabs shipped
(`bench-tabs.ts`, [`../tabs/system-design.md`](../tabs/system-design.md)).
Directory-keyed registries and missing `benchInstanceID` remain **Open** below.

Original recommended direction (historical, do not follow):

> Do not implement tabs yet. First introduce a small runtime-scope helper that
> still resolves to the current v1 directory/session behavior. When tabs are
> designed, widen that helper instead of rewriting all maps.

---

## Open

### Renderer readiness is not a first-class tool outcome

Status: Open.

**Code check:** `bench_present` completion maps surface
`context.target.status` through `failedSurfaceResult` in
`packages/buddy/src/learning/features/bench/tools/present.ts`. `loading` becomes
`surface_timeout`; `unavailable` / other non-ready statuses become
`surface_unavailable` / `surface_error`. `ready` and `dirty` still count as
success. There is still no `BenchRendererStatus` with renderer id and structured
unsupported-encoding reasons. Form-feed is accepted in
`packages/web/src/lib/workspace-file-content.ts`; non-UTF-8 still surfaces as
“not readable UTF-8” in `source-file-bench-view.tsx`.

Risk:

`bench_present` can still report success after route commit and context
publication when the mounted renderer later treats the file as unsupported or
crashes, or when status stays `ready`/`dirty` despite a policy failure. Agent-
visible state can remain weaker than user-visible state.

Recent example (narrow fix shipped; broader gap open):

- A PDF-to-text conversion produced a valid UTF-8 `.txt` file containing
  form-feed (`\f`) page separators.
- The source editor path initially treated form-feed as unreadable control
  content and showed a “not readable UTF-8” error, even though the bytes were
  valid UTF-8.
- The narrow text-policy fix is to accept form-feed and validate actual UTF-8
  bytes before decoding, but the broader Bench issue remains: renderer terminal
  readiness is not a first-class required-action contract.

Current weak spots:

- Completion proves navigation/context sync plus a coarse target `status`, not a
  typed renderer terminal status.
- Renderer failures are not always a structured `unsupported`/`error` with
  renderer identity.
- Text-file rendering is UTF-8-only. UTF-16, Latin-1, and other legacy encodings
  are not part of the editable source-file contract.
- Error copy can conflate byte-level encoding failure with renderer policy
  failure unless every layer uses structured reason codes.

Decision points to lock:

1. Define a typed renderer terminal status.

   Candidate:

   ```ts
   type BenchRendererStatus =
     | { status: "loading" }
     | { status: "ready"; renderer: string }
     | { status: "unsupported"; renderer: string; reason: string }
     | { status: "error"; renderer: string; reason: string }
   ```

2. Decide when a required `bench_present` action is complete.

   Options:
   - complete on route commit, as today;
   - complete after renderer terminal readiness;
   - complete on route commit but immediately follow with a renderer failure
     event.

3. Decide the editable text encoding contract.

   Options:
   - UTF-8 only, with explicit unsupported errors for other encodings;
   - detect UTF-16 BOM and read-only render it;
   - detect/transcode multiple encodings and preserve original encoding on save.

4. Decide whether non-UTF-8 text files are editable, read-only, or
   external-only.

Recommended direction:

Keep the source editor UTF-8-only until an encoding-preservation design exists.
Add renderer terminal status to Bench context/action completion so required agent
presentations can return a renderer error instead of a false success. If UTF-16
is added, start with BOM-detected read-only rendering, then only allow editing
once save can preserve the original encoding safely.

### Typed editable-surface lifecycle

Status: Open.

**Code check:** `BenchLeaveGuardInput` / `BenchLeaveGuardResult` exist
(`bench-leave-guard.ts`) with block reasons `dirty` | `saving` | `conflict` |
`save_error` | `sync_error`. Markdown, source-file, and object surfaces register
`leaveGuard`. There is no shared `BenchDirtyState` or `BenchSurfaceLifecycle`
type. `bench_present` blocked leave uses completion `outcome: "blocked"` →
`blocked_by_unsaved_work`, not parsing `metadata: string[]`. Per-surface dirty
UI and save ownership remain duplicated.

Risk:

Markdown owns its own dirty/save/conflict/leave behavior. That is acceptable for
one editable surface, but it becomes a duplication trap when whiteboard edits,
code editors, slides, HTML editors, or future artifact editors need the same
lifecycle guarantees.

Current weak spots:

- Markdown has custom `leaveGuard` logic; source-file and object have their own.
- Route blocking can block navigation, but there is no shared typed resolver UI
  contract.
- Page/window exits are not fully designed for every future editable surface.
- Shared `readDirtyState` / `saveBeforeLeave` is not a single surface contract.

Decision points to lock:

1. Define the canonical dirty states.

   Candidate:

   ```ts
   type BenchDirtyState =
     | "clean"
     | "dirty"
     | "saving"
     | "conflict"
     | "save_error"
     | "sync_error"
   ```

2. Decide whether the Bench parent calls `save()` or each child surface owns all
   save attempts.

3. Decide the leave contract.

   Candidate:

   ```ts
   type BenchSurfaceLifecycle = {
     readDirtyState(): BenchDirtyState
     saveBeforeLeave(): Promise<BenchLeaveGuardResult>
     canLeave(input: BenchLeaveGuardInput): Promise<BenchLeaveGuardResult>
   }
   ```

4. Decide how blocked leave renders.

   Options:
   - child surface shows its own conflict/save UI;
   - Bench parent shows one generic modal;
   - parent delegates to child-provided resolver UI.

5. Decide whether read-only surfaces implement a no-op lifecycle or omit
   lifecycle registration.

6. Decide how backend tools read protected editable state without parsing
   `metadata: string[]`.

   **Partial ship:** leave-block is a typed completion outcome. Remaining:
   snapshot-level dirty state for policy, not only leave-guard.

Recommended direction:

Create a typed lifecycle contract in the frontend route context and add typed
lifecycle state to the synchronized Bench snapshot. Keep Markdown as the first
implementation, but keep dirty/save/conflict status out of string metadata for
policy decisions.

### Scoped runtime keys for multi-window and split instances

Status: Open (tabs shipped; instance scope not).

**Code check:** no `benchInstanceID` in packages. Lifecycle, prompt flush, and
leave-guard registration remain directory-scoped
(`DirectoryWorkspaceLifecycleService` is one mounted directory workspace).
Backend context is directory + session, not Bench instance. This still blocks
independent multi-window or split-Bench views of the same directory.

Risk:

Several runtime registries are keyed by `directory`. That is valid while Buddy
has exactly one Bench instance per directory, but it blocks split Bench views,
multi-surface history, or multiple windows showing the same directory.

Current weak spots:

- Prompt flush registration is keyed by directory.
- Leave guard registration is keyed by directory.
- Auto-open suppression is keyed by directory and policy.
- Backend context registry is keyed by directory and session, but not by Bench
  instance.

Decision points to lock:

1. Decide what a Bench instance is.

   Options:
   - one instance per directory;
   - one instance per chat session;
   - one instance per route/tab;
   - one instance per window.

2. Decide whether Bench tabs are browser history, internal Bench state, or
   separate route state.

   **Shipped for tabs:** chat-owned ordered tab list; route owns selected target
   (`../tabs/system-design.md`). This decision is closed for the current tab
   model; keep the options as the record of what was considered.

3. Decide which Bench instance `bench_read_context` reads.

   Options:
   - active visible instance only;
   - instance tied to active chat session;
   - explicit instance id supplied by runtime, never by model.

4. Decide whether auto-open suppression is per directory, session, instance,
   target, or policy event.

5. Decide where instance ids live.

   Candidate:

   ```ts
   type BenchRuntimeScope = {
     directory: string
     sessionID: string
     benchInstanceID: string
   }
   ```

Recommended direction:

Keep the shipped tab model. Introduce a small runtime-scope helper that still
resolves to current directory/session behavior, then widen it for multi-window
or split instances instead of rewriting all maps.
