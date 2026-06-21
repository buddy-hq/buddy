# Bench Workspace File Synchronization Plan

Date: 2026-06-22

Status: proposed; ready for implementation after the current Bench identity work is committed

## Purpose

This plan addresses one filesystem lifecycle bug shared by the Markdown Bench
and the Monaco-backed source-file Bench:

- a workspace file can be changed, deleted, or recreated outside the mounted
  editor;
- the editor owns an in-memory buffer and does not inherently observe the
  filesystem;
- the Bench can therefore continue displaying and publishing stale content.

The reproduced deletion case is:

1. An agent creates and opens `beta-switch-622.md` on Bench.
2. The agent removes the file with a shell command during cleanup.
3. The file is gone on disk, but the mounted Markdown surface continues showing
   the last in-memory document.
4. Without another signal, model-visible Bench context can also continue
   describing that removed file as ready.

This is not an MDXEditor-only bug. Monaco models and Lexical/MDXEditor state are
both in-memory. Filesystem observation and synchronization belong to Buddy's
workspace lifecycle, with small adapters applying synchronized state to each
editor.

## Goals

- Handle external change, deletion, and recreation for both Markdown and source
  files.
- Reuse the filesystem watcher already running in the OpenCode sidecar.
- Remove the source editor's two-second polling loop.
- Avoid transferring or applying file content when verification proves nothing
  changed.
- Never overwrite dirty in-memory edits because of an external event.
- Never publish stale clean content as ready after the file becomes unavailable.
- Make the next user prompt wait for authoritative file verification before
  publishing Bench context.
- Remain correct across missed watcher events, SSE reconnects, app focus changes,
  agent turn completion, atomic writes, and watcher degradation.
- Implement the same behavior on macOS and Windows.

## Non-goals

- Do not implement another OS filesystem watcher.
- Do not add Chokidar or use raw `fs.watch`.
- Do not patch `vendor/opencode`.
- Do not make MDXEditor, Lexical, or Monaco responsible for filesystem state.
- Do not automatically close Bench when its active file is deleted.
- Do not automatically recreate a deleted file from a stale buffer.
- Do not add a general multi-file cache or background indexer.
- Do not use hover, polling, or agent-tool metadata as the correctness mechanism.

## Verified Current Architecture

### A native watcher already exists

The Electron sidecar sets `OPENCODE_EXPERIMENTAL_FILEWATCHER=true` in
`packages/desktop-electron/src/main/cli.ts`.

The location-scoped OpenCode runtime installs
`vendor/opencode/packages/core/src/filesystem/watcher.ts`. It uses
`@parcel/watcher` and selects:

- FSEvents on macOS;
- `ReadDirectoryChangesW` through the `windows` backend on Windows;
- inotify on Linux.

The watcher recursively observes the workspace and publishes
`file.watcher.updated` events with:

```ts
type OpenCodeFileWatcherEvent = {
  file: string
  event: "add" | "change" | "unlink"
}
```

`@parcel/watcher` already coalesces large event bursts. OpenCode's `edit`,
`write`, and `apply_patch` tools also publish the same event explicitly, so a
single logical write can produce both an immediate tool event and a later OS
event.

The OpenCode `EventV2` bridge forwards watcher events through `/global/event`.
Buddy proxies that stream through `/api/event`, and `useChatSync` already
receives the event. The web client currently ignores the event because it has no
`file.watcher.updated` handler.

### Markdown currently has a narrow reload signal

`packages/web/src/components/bench/markdown-bench-page.tsx`:

- initializes React and MDXEditor state from route loader data;
- reloads only after recognized `edit`, `write`, or `apply_patch` tool metadata;
- does not detect arbitrary shell commands, external applications, deletion, or
  SSE reconnect gaps;
- uses `MDXEditorMethods.setMarkdown` correctly when Buddy supplies new content;
- already protects dirty saves with a content-hash version and conflict state.

The tool-part parser is a duplicate and incomplete change detector. It should be
removed after the watcher path is connected.

### Monaco currently polls but ignores deletion

`packages/web/src/components/bench/source-file-bench-view.tsx` passes a
two-second `externalReloadIntervalMs` to
`packages/web/src/components/editors/versioned-text-file-editor.tsx`.

The polling effect:

- calls the full editable-file read endpoint every two seconds;
- reloads clean content when the returned version changes;
- catches every background error and leaves the current model untouched;
- consequently treats a 404 deletion as a transient error forever.

The generic editor already tracks `exists`, version, dirty, saving, conflict,
and save-error state. That state can support deletion correctly once external
synchronization is explicit.

### The backend already has the authoritative version

`packages/buddy/src/project/project-file-editor-service.ts` computes the
editable-file version as SHA-256 of its UTF-8 content. Saves compare
`expectedVersion` against the current on-disk content version, so the version is
already the canonical optimistic-concurrency token.

The existing editable read endpoint returns `{ path, content, version }` and
returns 404 when the file is missing. A verification-only client should not need
the content body when the version is unchanged.

### Bench lifecycle already owns the required barrier

`DirectoryWorkspaceLifecycleService` owns surface registration, serialized
context publication, and `flushContextBeforePrompt`. The prompt submission path
already awaits `flushContextBeforePrompt` before posting the prompt.

The registration boundary is therefore the correct place to add an optional
surface synchronizer. The lifecycle can await it before reading and publishing
the surface snapshot without coupling prompt code to Markdown or Monaco.

## Architectural Decision

Build Buddy's synchronization policy, not a filesystem watcher.

```text
OpenCode @parcel/watcher
  -> file.watcher.updated over existing SSE
  -> Buddy event normalization and validation
  -> directory-scoped synchronization scheduler
  -> active file surface synchronize()
  -> verification-only status request
       -> unchanged: stop
       -> changed and clean: fetch and apply content
       -> missing: unavailable/deleted transition
       -> changed and dirty: conflict, preserve buffer
  -> semantic snapshot notification
  -> serialized Bench context publication
```

The watcher is a low-latency invalidation signal. The editable-file endpoint is
the authority. Lifecycle verification is the fallback and correctness barrier.

## Core Invariants

1. There is one OS watcher: OpenCode's existing `@parcel/watcher` instance.
2. A watcher event never directly replaces editor content.
3. An external event is coalesced, then verified against authoritative file
   status.
4. An unchanged verification performs no full content request, editor update,
   semantic revision increment, React state update, or context publication.
5. Clean local state may adopt newer authoritative content.
6. Dirty, saving, conflicted, or failed-save state is never overwritten by an
   external refresh.
7. Missing clean content is not published to the model as ready.
8. Missing dirty content remains recoverable and is clearly published as an
   unavailable/conflicted in-memory buffer.
9. Synchronization results apply only if registration identity and canonical
   target key still match when the request settles.
10. At most one synchronization request runs for a mounted surface. A signal
    received during that request schedules one follow-up pass.
11. Prompt flush and committed client-action completion capture context only
    after the selected surface's forced synchronization settles.
12. Synchronization failure cannot hang prompt submission indefinitely and
    cannot silently preserve a stale `ready` context.

## Proposed Contracts

### Verification-only API

Add a typed endpoint alongside the editable read endpoint:

```ts
type ProjectTextFileStatus =
  | {
      path: string
      exists: true
      version: string
    }
  | {
      path: string
      exists: false
      version: null
    }
```

Proposed route:

```text
GET /api/file/edit/status?path=<workspace-relative-path>
operationId: explorer.file.edit.status
```

Requirements:

- Use the same path normalization and containment checks as editable read/save.
- Return `200` with `exists: false` for a valid contained path that is absent.
- Preserve 403 for escaped paths and 415 for an existing unsupported file.
- Calculate `version` with the same helper used by editable read/save.
- Do not include content in the response.
- Regenerate `@buddy/sdk` and call the endpoint through `BuddyClient`.

This avoids a network content refetch when nothing changed. The backend still
reads and hashes the file to preserve exact optimistic-concurrency semantics.
That cost is acceptable because verification is event-driven and conservatively
scheduled rather than running every two seconds.

### Stable watcher-event adapter

Add a narrow adapter export in `packages/opencode-adapter`, for example:

```ts
type WorkspaceFileWatcherUpdate = {
  event: "add" | "change" | "unlink"
  absolutePath: string
}

function readWorkspaceFileWatcherUpdate(payload: unknown):
  | WorkspaceFileWatcherUpdate
  | undefined
```

The web package must not import `vendor/opencode` directly or repeat the vendor
event string and shape.

At Buddy's SSE transformation boundary, use Node path utilities and the event's
directory to add a normalized workspace-relative path. Reject events outside the
requested directory. This avoids browser-side Windows path inference and makes
matching exact on both platforms.

An event should invalidate the active target when its normalized path:

- exactly equals the target path; or
- is an ancestor directory of the target path, using separator-aware matching.

Ancestor matching covers recursive directory deletion/recreation events.

### Surface synchronization registration

Extend the existing surface registration with an optional synchronizer:

```ts
type BenchSurfaceSynchronizationReason =
  | "watcher"
  | "turn-complete"
  | "stream-reconnect"
  | "foreground"
  | "interaction"
  | "watchdog"
  | "context-flush"
  | "client-action-completion"

type BenchSurfaceSynchronizationResult = {
  changed: boolean
}

type BenchSurfaceRegistrationInput = {
  target: BenchTarget
  getSnapshot(): BenchSurfaceSnapshot
  subscribe(listener: () => void): () => void
  synchronize?: (
    reason: BenchSurfaceSynchronizationReason,
  ) => Promise<BenchSurfaceSynchronizationResult>
  guardLeave?: (...args) => BenchLeaveGuardResult | Promise<BenchLeaveGuardResult>
}
```

`useRegisterBenchContextProvider` should wrap `synchronize` so that a changed
result increments semantic revision and notifies registration listeners before
the returned promise resolves. An unchanged result must not notify listeners.

Each file provider's `read()` must read from a latest-state ref that the
synchronizer updates synchronously. This is required so lifecycle can:

1. await `synchronize()`;
2. immediately call `getSnapshot()`;
3. observe the synchronized state without waiting for a React effect or render.

React state remains the UI projection. It is not the synchronization barrier.

### Shared decision function

Put file-state decisions in a framework-independent web module rather than
duplicating them in Markdown and Monaco:

```ts
type WorkspaceFileLocalState = {
  exists: boolean
  version: string | null
  dirty: boolean
  saving: boolean
  conflict: boolean
  saveError: boolean
}

type WorkspaceFileSynchronizationDecision =
  | { type: "unchanged" }
  | { type: "defer" }
  | { type: "reload" }
  | { type: "unavailable" }
  | { type: "conflict"; reason: "changed" | "deleted" }
```

The Markdown and Monaco adapters apply the decision to their editor-specific
state, but the decision rules and concurrency behavior are shared and directly
unit tested.

## Scheduling Policy

### Primary signal: watcher SSE event

On `file.watcher.updated`:

1. Parse and validate through the adapter.
2. Normalize to a workspace-relative path at the backend SSE boundary.
3. Ignore unrelated paths.
4. Coalesce matching events for a short named atomic-write window.
5. Synchronize the active file surface.

Do not assume `unlink` means the final state. Atomic-save workflows often
produce delete/create sequences. After coalescing, status verification decides
whether the file is actually absent.

Tool-emitted and OS-emitted duplicates must collapse into the same in-flight or
pending synchronization pass.

### Agent turn completion

`useChatSync` already detects a parent session transition from working to idle.
At that exact transition, request synchronization of the active file surface.

This catches shell mutations made during a turn even if the watcher event was
lost or the native binding degraded. It replaces Markdown's tool-name-specific
reload heuristic.

### SSE reconnect

When the directory stream reconnects after a disconnect, force synchronization
of the active file. Events that occurred while the renderer was disconnected
are not replayed by the current stream.

No `@parcel/watcher` snapshot integration is needed for this single active-file
problem. A forced authoritative status check is simpler and bounded.

### Foreground and interaction revalidation

Reuse the existing window-focus and document-visibility listeners in
`useChatSync` to request foreground synchronization.

Add `pointerenter` and `focus` signaling at the shared Bench target boundary,
not inside either editor. Interaction synchronization is opportunistic and
uses a freshness cooldown. It is not a correctness mechanism.

### Conservative watchdog

Replace the two-second Monaco interval with a self-scheduling watchdog:

- only while a workspace-file surface is mounted;
- only while Bench is visible and the Electron window/document is foreground;
- only when the last completed verification is older than the named stale
  threshold;
- one request at a time;
- stop immediately when the target is parked, closed, replaced, unfocused, or
  disposed.

Initial proposed constants:

```ts
const WORKSPACE_FILE_EVENT_COALESCE_MS = 100
const WORKSPACE_FILE_INTERACTION_STALE_MS = 5_000
const WORKSPACE_FILE_WATCHDOG_STALE_MS = 30_000
const WORKSPACE_FILE_SYNCHRONIZATION_TIMEOUT_MS = 5_000
```

These values must be named, centralized, fake-clock tested, and easy to tune.
The watchdog is a fallback, not a permanent two-second poll.

### Model-context barriers

`flushContextBeforePrompt` must force and await synchronization before it reads
the publish snapshot. A recent hover or watcher verification does not remove
this correctness check. The request is status-only unless the version changed.

Committed client-action completion must do the same for its observed target:

1. synchronize the registration matching the observed target;
2. recheck registration/target identity;
3. capture the synchronized snapshot;
4. enqueue completion behind older publications.

This preserves the postmortem rule that the completion snapshot is captured
before waiting in the publication queue while preventing stale file content
from being captured.

## Synchronization State Machine

### Remote version unchanged

- Update only non-reactive freshness bookkeeping.
- Do not fetch content.
- Do not call `setMarkdown` or replace the Monaco model value.
- Do not update React state.
- Do not increment semantic revision.
- Do not publish Bench context.

### Remote version changed, local clean

- Fetch the full editable file once.
- Recheck request generation, registration identity, target key, and local clean
  state after the request settles.
- Apply content and version atomically to local/saved state.
- Clear prior unavailable/transient synchronization error state.
- Update MDXEditor through `setMarkdown`; update Monaco through its controlled
  value/model path.
- Emit one semantic revision and one context publication.

### Remote version changed, local dirty

- Do not fetch or apply remote content automatically.
- Preserve the complete in-memory buffer.
- Enter external-change conflict state.
- Keep the existing expected version so overwrite remains an explicit user
  action.
- Publish local content with conflict metadata and a warning that disk content
  changed.

### File missing, local clean

- Keep the route and Bench target mounted.
- Set `exists: false` and target status `unavailable`.
- Replace the editor presentation with a clear "File deleted" state.
- Keep last-known content only as private recovery data; do not publish it as
  current file content.
- Publish metadata including `exists: false` and the last-known version.
- Offer explicit `Check again` and, if retained, `Restore last content` actions.
- Never recreate the file automatically.

### File missing, local dirty

- Preserve the editor and all unsaved content.
- Mark unavailable/deleted conflict state.
- Stop autosave from repeatedly attempting to recreate the file.
- Publish target status `unavailable`, local dirty content, and an explicit hint
  that the content exists only in memory.
- Require an explicit overwrite/recreate or discard/reload decision.

### File recreated

- If local state is clean or unavailable without edits, load the recreated file.
- If local state is dirty, compare the recreated version with the last known
  version:
  - same version: clear deleted availability state and resume normal dirty save;
  - different version: remain conflicted and preserve the local buffer.
- Do not infer recreation from an `add` event alone; verify status.

### Synchronization failure or timeout

- Preserve dirty local content.
- A clean surface must stop claiming `ready`; publish status `error` with no
  stale file content.
- A dirty surface may publish its in-memory buffer with an explicit
  verification-error hint.
- Allow prompt submission after the bounded synchronization attempt; do not hang
  the chat indefinitely.
- Retry on the next watcher, turn, foreground, interaction, watchdog, or prompt
  signal.

### Save and watcher races

Own saves produce watcher events. While saving:

- record a pending synchronization generation;
- do not reload or create a conflict;
- after save settles, run one verification pass;
- if the verified version equals the save result, treat it as unchanged;
- if it differs, apply the normal clean/dirty conflict rules.

## Editor Integration

### Markdown Bench

Update `markdown-bench-page.tsx` to:

- add explicit `exists` and synchronization-error state;
- maintain a latest file-state ref used by context `read()` and synchronization;
- register a `synchronize` adapter;
- use the shared decision function;
- use `editorRef.current.setMarkdown()` only after an accepted clean reload;
- stop autosave while unavailable or externally conflicted;
- remove `FILE_EDIT_TOOL_NAMES`, tool metadata path matching, tool-part scanning,
  and the completed-tool reload effect;
- render clean deleted state separately from dirty deleted conflict state;
- publish `unavailable` instead of stale `ready` content.

MDXEditor/Lexical plugins remain unchanged. They only render and edit the
synchronized Markdown value.

### Source-file Bench / Monaco

Update `VersionedTextFileEditor` and `source-file-bench-view.tsx` to:

- remove `externalReloadIntervalMs` and its interval effect;
- remove or replace `shouldApplyVersionedTextFileExternalRefresh` with the shared
  synchronization decision helper;
- expose an imperative surface synchronization adapter or accept one shared
  controller callback;
- distinguish expected missing-file state from read/save failure;
- preserve dirty content on deletion or external change;
- prevent autosave while unavailable/conflicted;
- clear `unreadable` when a later readable file is accepted;
- render an explicit unavailable state when the source file is clean and gone;
- publish the same availability/conflict metadata contract as Markdown.

The generic non-Bench `MarkdownFileEditor` behavior must remain covered. If the
polling prop is removed from `VersionedTextFileEditor`, no current non-Bench
consumer needs replacement polling.

## Context Contract

The backend already accepts `target.status: "unavailable"`; no new Bench context
status is required.

Recommended file metadata:

```text
exists: true | false
version: <current version | unknown>
last_known_version: <version | none>
dirty: true | false
save_state: ready | saving | conflict | error
sync_state: ready | checking | unavailable | error
```

Content rules:

- ready/clean: current verified buffer;
- dirty: current in-memory buffer;
- changed/conflicted: current in-memory buffer plus conflict hint;
- missing/clean: explanatory unavailable message, never last-known file text;
- missing/dirty: current in-memory buffer plus in-memory-only warning;
- verification error/clean: explanatory error message, never unverified stale
  file text.

Freshness timestamps are diagnostics only. They must not enter the semantic
publication key because successful unchanged verification is not a model-visible
change.

## File-by-file Implementation Map

### Adapter and backend

- `packages/opencode-adapter/src/file-watcher.ts`
  - vendor event constant, type, and safe parser.
- `packages/opencode-adapter/package.json`
  - explicit subpath export.
- `packages/buddy/src/http/opencode-event-stream.ts`
  - normalize watcher absolute path to contained workspace-relative path.
- `packages/buddy/src/project/project-file-editor-service.ts`
  - shared status/version read and missing-file result.
- `packages/buddy/src/routes/compatibility.ts`
  - typed status endpoint and schema.
- `packages/sdk/src/gen/**`
  - regenerate; never edit manually.

### Web orchestration

- `packages/web/src/state/chat-actions.ts`
  - typed editable-file status action.
- `packages/web/src/lib/workspace-file-synchronization.ts`
  - reasons, decisions, scheduling constants, path relation, single-flight and
    cooldown policy, or split pure decision/scheduler modules if clearer.
- `packages/web/src/lib/directory-workspace-lifecycle.ts`
  - optional registration synchronizer, signal entry points, prompt and
    completion barriers.
- `packages/web/src/components/bench/bench-route-context.tsx`
  - registration wiring and synchronous semantic notification after changed
    synchronization.
- `packages/web/src/lib/directory-chat/use-chat-sync.ts`
  - watcher, parent-turn-idle, reconnect, and foreground callbacks.
- `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts`
  - connect sync callbacks to the directory lifecycle.
- `packages/web/src/components/directory-chat/directory-workspace-root.tsx`
  - shared Bench target pointer/focus opportunistic signal.

### Editor adapters

- `packages/web/src/components/bench/markdown-bench-page.tsx`
- `packages/web/src/components/bench/source-file-bench-view.tsx`
- `packages/web/src/components/editors/versioned-text-file-editor.tsx`

Do not edit vendored watcher files.

## Implementation Phases

### Phase 1: Authority and event boundary

1. Extract one canonical backend version/status helper.
2. Add the editable-file status route and regenerate the SDK.
3. Add the adapter watcher-event parser.
4. Normalize and test relative watcher paths at the Buddy SSE boundary,
   including Windows separators and out-of-root events.

### Phase 2: Shared synchronization core

1. Implement the pure state decision table.
2. Implement path matching, coalescing, single-flight, pending rerun, cooldown,
   timeout, and disposal behavior.
3. Extend lifecycle registration with optional `synchronize`.
4. Guarantee synchronous latest-state snapshot reads after synchronization.
5. Add forced prompt and committed-action barriers.

### Phase 3: Signal wiring

1. Consume watcher events from the existing SSE stream.
2. Signal on parent agent turn completion.
3. Signal on stream reconnect and foreground transition.
4. Add shared target-boundary pointer/focus revalidation.
5. Add the visible/foreground-only watchdog.

### Phase 4: Editor adapters

1. Migrate Markdown to the shared decision/scheduler contract.
2. Remove Markdown tool-metadata reload detection.
3. Migrate source/Monaco to the same contract.
4. Remove the two-second polling API and effect.
5. Implement unavailable/conflict UI and model-context states consistently.

### Phase 5: Verification and cleanup

1. Run focused backend and web tests listed below.
2. Run `bun lint`.
3. Run root `bun typecheck` once, after focused tests.
4. Perform runtime falsification for Markdown and Monaco on macOS.
5. Verify path normalization and behavior in Windows-targeted tests.
6. Run `bun fmt` only after the implementation is accepted.

## Test Plan

### Backend and adapter tests

- Status returns the same version as editable read without content.
- Status returns `exists: false` for a valid missing path.
- Status rejects escaped paths and unsupported existing files.
- Watcher parser accepts add/change/unlink and rejects malformed payloads.
- SSE normalization produces exact relative paths on POSIX and Windows.
- Out-of-workspace watcher events are ignored.
- Parent-directory events match a nested active target only on path boundaries.

### Shared scheduler tests

- Duplicate tool/OS signals coalesce.
- A signal during an in-flight request causes exactly one follow-up pass.
- Unchanged status causes no content read and no changed notification.
- Interaction inside cooldown causes no request.
- Forced context flush bypasses cooldown.
- Watchdog does not run parked, hidden, unfocused, or disposed.
- Target replacement invalidates late results.
- Timeout settles with error state and no stuck in-flight flag.

### State-decision tests

- Clean + same version -> unchanged.
- Clean + changed version -> reload.
- Dirty + changed version -> conflict without reload.
- Saving + event -> defer.
- Clean + missing -> unavailable without stale context.
- Dirty + missing -> unavailable conflict preserving content.
- Clean missing + recreated -> reload.
- Dirty missing + recreated same version -> resume dirty.
- Dirty missing + recreated different version -> remain conflicted.
- Own-save watcher event matching saved version -> unchanged.

### Lifecycle tests

- Prompt flush awaits synchronization before `getSnapshot` and publication.
- Committed client-action completion awaits synchronization before capture.
- An unchanged synchronization does not change semantic revision.
- A changed synchronization publishes exactly one new revision.
- Route replacement during synchronization cannot publish the old target under
  the new target key.
- Sync failure publishes error/unavailable context rather than stale ready
  content.

### Markdown integration tests

- External clean update applies through `setMarkdown`.
- External dirty update preserves local Markdown and shows conflict.
- Clean deletion replaces the document with unavailable UI and context.
- Dirty deletion preserves local Markdown and disables autosave.
- Recreation resolves according to version.
- Tool-part parsing is no longer needed for reload.

### Monaco integration tests

- External clean update changes the controlled Monaco content.
- External dirty update preserves local source and shows conflict.
- Clean deletion displays unavailable UI instead of silently swallowing 404.
- Dirty deletion preserves the model buffer.
- No two-second interval remains.
- Unchanged verification does not replace the Monaco value/model.

## Runtime Falsification Matrix

### Markdown deletion

1. Create and open a unique Markdown file.
2. Confirm `bench_read_context` contains its unique token.
3. Delete it using a shell command during the same agent turn.
4. Confirm the mounted Bench transitions to unavailable without navigation.
5. Confirm `bench_read_context` reports `status: unavailable`, `exists: false`,
   and does not contain the deleted clean file's token.

### Source/Monaco deletion

1. Create and open a unique `.txt` or `.ts` file in source view.
2. Confirm its content is visible and model-readable.
3. Delete it using a shell command.
4. Confirm the source editor transitions to unavailable rather than retaining
   the model indefinitely.
5. Confirm context does not publish stale clean source content.

### Dirty protection for both editors

1. Make an unsaved local edit.
2. Change or delete the same file externally.
3. Confirm the local edit remains byte-for-byte intact.
4. Confirm the surface reports conflict/unavailable.
5. Confirm no automatic overwrite or recreation occurs.

### Missed-signal barriers

Run with watcher event handling disabled in a test harness:

- agent turn completion still detects the change;
- focus/reconnect still detects the change;
- the next prompt forces verification before context publication;
- the visible foreground watchdog eventually detects the change;
- hover/focus revalidation respects its cooldown.

## Acceptance Criteria

- Markdown and source surfaces share one synchronization policy.
- The existing OpenCode watcher is reused; no second watcher dependency exists.
- No steady two-second file polling remains.
- Arbitrary shell deletion is detected while the file surface remains mounted.
- Clean deleted content is never returned as ready by `bench_read_context`.
- Dirty buffers survive external change/deletion without automatic overwrite.
- Unchanged verification does not fetch content or cause model/editor updates.
- Prompt submission awaits bounded authoritative verification.
- Watcher duplicates, atomic writes, reconnects, and save races are deterministic.
- macOS and Windows path behavior is covered.
- Focused tests, `bun lint`, and root `bun typecheck` pass.

## Explicitly Rejected Alternatives

### Build a Buddy watcher with `fs.watch`

Rejected because OpenCode already owns a maintained native recursive watcher and
packages its macOS and Windows bindings. A second watcher would duplicate native
resources and introduce another event-normalization implementation.

### Add Chokidar

Rejected because it would duplicate the already-running watcher. Its atomic and
write-finish conveniences do not remove the need for authoritative verification,
dirty-buffer policy, context barriers, or SSE reconnect recovery.

### Keep Monaco polling and add Markdown polling

Rejected because it transfers full content repeatedly, still needs deletion
semantics, wastes resources while nothing changes, and produces two independent
implementations.

### Use MDXEditor/Lexical or Monaco change listeners

Rejected because those listeners observe editor/model changes, not arbitrary
host filesystem deletion or replacement.

### Trust watcher events as authoritative state

Rejected because watcher streams can coalesce, duplicate, disconnect, degrade,
or report intermediate atomic-write states. Events invalidate; the file status
endpoint decides.
