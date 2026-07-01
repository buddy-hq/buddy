# Bench Mode Known Issues

> Historical note: this file predates the ownership refactor. Some open issues below were resolved or replaced by the architecture in `current-architecture.md` and the authoritative plan in `bench-refactor.md`. Keep the historical analysis, but verify any issue against the current scoped workspace, typed client-action, and directory-owned lifecycle implementation before acting on it.

This document tracks architecture issues that are not blocking Bench mode v1, but should be resolved before Bench becomes the foundation for richer editable surfaces, tabs, multi-surface history, or stronger agent control.

## Resolved In Current Pass

### Split `bench-navigation.ts`

Status: Resolved.

The original `bench-navigation.ts` mixed target contracts, preferences, layout policy, open policy, route parsing, transition classification, route construction, and React navigation. That made future changes too coupled.

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

`bench-navigation.ts` remains as a compatibility barrel so existing imports do not churn.

## Open Architecture Issues

### Renderer Readiness Is Not Yet A First-Class Tool Outcome

Status: Open.

Risk:

`bench_present` can report that a target was presented after the client commits the Bench route and publishes context, even if the mounted renderer later discovers that the file is unsupported or fails to load. This makes agent-visible state weaker than user-visible state: the user can see a renderer error while the model only sees a successful presentation result.

Recent example:

- A PDF-to-text conversion produced a valid UTF-8 `.txt` file containing form-feed (`\f`) page separators.
- The source editor path initially treated form-feed as unreadable control content and showed a “not readable UTF-8” error, even though the bytes were valid UTF-8.
- The narrow text-policy fix is to accept form-feed and validate actual UTF-8 bytes before decoding, but the broader Bench issue remains: renderer terminal readiness is not part of the required action completion contract.

Current weak spots:

- Bench action completion mostly proves navigation/context synchronization, not renderer readiness.
- Renderer failures are visible in the UI but are not always reflected back into the `bench_present` tool result.
- Text-file rendering is UTF-8-only. UTF-16, Latin-1, and other legacy encodings are not part of the editable source-file contract.
- Error copy can conflate byte-level encoding failure with renderer policy failure unless every layer uses structured reason codes.

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
   - complete on route commit but immediately follow with a renderer failure event.

3. Decide the editable text encoding contract.

   Options:
   - UTF-8 only, with explicit unsupported errors for other encodings;
   - detect UTF-16 BOM and read-only render it;
   - detect/transcode multiple encodings and preserve original encoding on save.

4. Decide whether non-UTF-8 text files are editable, read-only, or external-only.

Recommended direction:

Keep the source editor UTF-8-only until an encoding-preservation design exists. Add renderer terminal status to Bench context/action completion so required agent presentations can return a renderer error instead of a false success. If UTF-16 is added, start with BOM-detected read-only rendering, then only allow editing once save can preserve the original encoding safely.

### Typed Editable-Surface Lifecycle

Status: Open.

Risk:

Markdown currently owns its own dirty/save/conflict/leave behavior. That is acceptable for one editable surface, but it becomes a duplication trap when whiteboard edits, code editors, slides, HTML editors, or future artifact editors need the same lifecycle guarantees.

Current weak spots:

- Markdown has custom `leaveGuard` logic.
- Backend `bench_present` still infers protected Markdown state from model-readable metadata strings.
- Route blocking can block navigation, but there is no shared typed resolver UI contract.
- Page/window exits are not fully designed for every future editable surface.

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

2. Decide whether the Bench parent calls `save()` or each child surface owns all save attempts.

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

5. Decide whether read-only surfaces implement a no-op lifecycle or omit lifecycle registration.

6. Decide how backend tools read protected editable state without parsing `metadata: string[]`.

Recommended direction:

Create a typed lifecycle contract in the frontend route context and add typed lifecycle state to the synchronized Bench snapshot. Keep Markdown as the first implementation, but move dirty/save/conflict status out of string metadata for policy decisions.

### Typed Client Action/Event Channel For Agent Bench Control

Status: Open.

Risk:

`bench_present` currently returns a tool result, then the frontend scans completed chat tool parts to discover presentation actions. That works for v1, but the transcript is a weak control bus.

Current weak spots:

- UI action execution depends on transcript retention and parsing.
- Reconnect/replay behavior is easy to get wrong.
- Retries can double-execute unless every event has stable dedupe keys.
- Future artifact presentation or richer agent control would add more parsers.

Decision points to lock:

1. Choose the event transport.

   Options:
   - existing chat stream plus structured client-action parts;
   - backend route/action queue polled by frontend;
   - local client event bus fed by tool execution results;
   - websocket/server-sent event channel.

2. Decide whether actions are persisted or ephemeral.

3. Decide replay semantics after reload/reconnect.

   Questions:
   - Should a completed `bench_present` replay open Bench after app reload?
   - Should only not-yet-acknowledged actions replay?
   - Where is the ack stored?

4. Define action scope.

   Candidate:

   ```ts
   type ClientActionScope = {
     directory: string
     sessionID: string
     actionID: string
   }
   ```

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

6. Decide whether `bench_present` returns only model-readable output, or output plus a separate non-transcript client action.

Recommended direction:

Introduce a typed client-action channel where transcript rendering observes what happened but does not drive the UI. Keep `bench_present` output model-readable, and emit a separate deduped `bench.present` action for the frontend to execute.

### Scoped Runtime Keys For Future Tabs

Status: Open, but not required for v1.

Risk:

Several runtime registries are keyed by `directory`. That is valid while Buddy has exactly one Bench instance per directory, but it blocks future tabs, split Bench views, multi-surface history, or multiple windows showing the same directory.

Current weak spots:

- Prompt flush registration is keyed by directory.
- Leave guard registration is keyed by directory.
- Auto-open suppression is keyed by directory and policy.
- Backend context registry is keyed by directory and session, but not by Bench instance.

Decision points to lock:

1. Decide what a Bench instance is.

   Options:
   - one instance per directory;
   - one instance per chat session;
   - one instance per route/tab;
   - one instance per window.

2. Decide whether future Bench tabs are browser history, internal Bench state, or separate route state.

3. Decide which Bench instance `bench_read_context` reads.

   Options:
   - active visible instance only;
   - instance tied to active chat session;
   - explicit instance id supplied by runtime, never by model.

4. Decide whether auto-open suppression is per directory, session, instance, target, or policy event.

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

Do not implement tabs yet. First introduce a small runtime-scope helper that still resolves to the current v1 directory/session behavior. When tabs are designed, widen that helper instead of rewriting all maps.
