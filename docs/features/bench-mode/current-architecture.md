# Bench Mode Current Architecture

This document describes the post-refactor Bench architecture and is authoritative for current ownership and navigation behavior. `bench-refactor.md` remains useful implementation history, but any session-owned artifact or linked-resource navigation rules there are superseded by this document.

## Ownership Model

Bench has one writable owner per semantic concept:

- URL owns the active Bench target and docked/floating route mode.
- The directory-scoped workspace store owns independent per-chat presentation slots, committed docked visibility, active drawer, pending workspace intent, and transient layout state.
- Per-directory workspace persistence owns the bounded map of durable chat presentation slots.
- Global Bench preferences own width and target-family mode defaults.
- `DirectoryWorkspaceController` owns all user, UI, titlebar, file-open, and agent workspace commands.
- The TanStack router blocker is the only leave-guard boundary for target replacement or target exit.
- `DirectoryWorkspaceLifecycleService` owns surface registration, prompt flush, context publication, and client-action completion for one mounted directory workspace.
- The backend Bench client-action broker owns pending required actions, live best-effort actions, tombstones, expiry, and authoritative directory leases.

Derived values such as target key, parked state, effective drawer, rendered visibility, and layout projection are computed from those owners. They are not stored as separate writable state.

## Artifact And Chat Boundary

Resources, books, whiteboards, files, widgets, and media are directory-owned artifacts. A chat workspace contains a reference to the artifact; the artifact never owns or selects a chat.

- Opening a Bench target may change only the active chat's presentation slot.
- Presentation actions carry their originating session for stale-action validation, never as navigation authority.
- Resource usage history, tool origin, and message references are provenance. Presentation code cannot use them to activate a session.
- Whiteboard reads and mutations target a stable `objectID`. The same board may be opened and edited from multiple chats, with object-scoped locking and stale-write checks.
- Starting a new chat in the current directory copies the visible target, layout mode, and docked presentation into an independent draft slot. The backend/session context changes, but the book or board remains visually continuous. Later workspace changes diverge independently.
- Creating a board from the Boards drawer is a direct artifact operation: it creates an editable blank whiteboard and presents it without changing the chat or composer.
- Selecting an existing chat restores that chat's own slot. It does not inherit the outgoing chat unless an explicit transition policy says so.

Whiteboard tool presentation has two distinct lifecycles:

- A streamed `objectID: null` request may show a transient Bench preview scoped to the active tool part. The preview is not a `BenchTarget`: it writes no object, reservation, workspace route, or `.buddy` state and disappears on denial or failure. It shows the opening animation only until the first complete drawable element, then renders each later complete element progressively.
- A streamed request with a concrete `objectID` updates an existing board. It never installs the objectless preview or hides the populated canvas behind the opening animation. Streamed elements compose over the mounted object's fetched state.

After permission succeeds, tool execution creates or resolves the directory-owned object, publishes its stable target, and applies the final program. A new-board preview hands off to that real target; an existing-board update continues on the same real surface. The UI observes raw drawing input through targeted active-part subscriptions because `state.raw` changes are transient part-level events, not session-snapshot rerenders. Auto-open is settled only after the intended target is visibly committed; bounded retries may bridge a New Chat/workspace race, but an inactive action cannot activate its session. Session/message/part/call identifiers remain correlation and provenance only, and `part.id` must not be substituted for the backend `callID`.

## Routing And Rendering

The `/$directory` route is the stable owner of the chat shell, scoped workspace store, lifecycle service, controller, action ledger, and Bench host. The `/$directory/chat` child does not mount a second shell. The `/$directory/_bench/*` chain validates route parameters and provides the target outlet rendered by the single Bench host.

The directory workspace root is keyed by canonical decoded directory. A directory change creates a fresh store, controller, action lease, action ledger, lifecycle service, and registration scope.

Bench target identity is keyed by the full canonical `BenchTarget`, including object revision, item, and view. Docked/floating mode is excluded from the target key so mode switches do not remount the target.

`DirectoryWorkspaceRoot` renders one `DirectoryChatShell` for chat, docked Bench, parked Bench, and floating Bench. The shell contains one persistent content layout with one `DirectoryChatBenchConversationPane` and one `DirectoryChatRightWorkspace`. The right workspace owns the only Bench outlet occurrence. A target-keyed boundary and its `BenchRouteContextProvider` sit immediately around that outlet, so entering or replacing a target cannot remount chat, while visibility and mode changes cannot remount the current target.

Docked mode places the conversation on the left and the same right-workspace host at the derived workspace width. Floating mode suppresses the still-mounted shell chrome, expands that same right-workspace host to the content viewport, and positions the same conversation host with the floating rectangle. Parked and hydration-pending hosts stay mounted but inert, non-focusable, and visually suppressed. Floating mode does not render selector access.

Docked, floating, collapsed, and drawer states are visual consequences of the route snapshot plus committed store state. No semantic transition waits for a CSS transition event, DOM query, Motion callback, or timer.

## Command Boundary

All workspace changes go through `DirectoryWorkspaceController`:

- `present`
- `close`
- `set-mode`
- `reveal`
- `collapse`
- `open-drawer`
- `close-drawer`

Commands allocate a command ID. Commands that navigate also allocate a navigation attempt ID. Pending intent preserves a coherent projection while router and store commits settle, but it never invents an uncommitted target or mode.

The controller returns terminal outcomes:

- `committed`
- `blocked`
- `failed`
- `inactive`
- `superseded`

Terminal command results are returned directly to the caller. They are not copied
into a retained Zustand history; no production consumer requires such a ledger.

Newer commands supersede older commands. Async guard and navigation continuations recheck command and attempt identity before committing.

The blocker retains controller attempts until their route and workspace postconditions finish, even after a leave guard has allowed navigation. Registered, guarding, and router-loading attempts therefore remain independently supersedable. A newer command plans against the committed route plus any pending navigation expectation. For example, close issued while presentation is still loading performs a closing router transition instead of treating the old committed `/chat` route as a workspace-only close. A newer router transition cancels the stale load; only the winning command may commit workspace state.

`useOpenBench` does not calculate policy. It delegates to the controller and returns a terminal discriminated union. Only `outcome: "committed"` carries the controller's resolved open decision; `blocked`, `failed`, `inactive`, and `superseded` cannot carry an `action: "open"` value. Drawer and file-opening callers close or report success only for the committed variant.

The router blocker is the only unsaved-work protection boundary. It runs for target replacement and target exit, including Back, Forward, direct navigation, explicit close, and agent commands. It does not run for mode-only, reveal/collapse, or drawer-only changes.

## Drawers And Visibility

Bench and notebook drawers are no longer modeled as mutually exclusive durable surfaces.

The route owns the selected chat's active Bench target. Each chat slot owns its ordered logical tabs. The docked workspace may be expanded or collapsed, and a notebook drawer may cover the selected target. Selecting an item presents or focuses its tab, commits expanded visibility, and closes the drawer.

A no-target expanded workspace shows the active drawer or the last drawer. A drawer over a visible target is published to model-visible context as:

```ts
type BenchDrawerContext = {
  kind: "search" | "sources" | "practice" | "creations" | "boards" | "files" | "skills"
  presentation: "drawer"
}
```

## Client Actions

Agent-facing Bench commands use a typed Bench-specific client-action protocol over the existing `/api/event` SSE response. The transcript records outcomes; it is not a live command bus.

The shared action identity is:

```ts
type BenchClientActionV2 = {
  version: 2
  actionID: string
  directory: string
  sessionID: string
  messageID: string
  callID: string | null
  origin: "agent" | "auto-open"
  acknowledgement: "required" | "best-effort"
  expiresAt: number
  command:
    | { type: "present"; target: BenchTarget; autoOpen: BenchAutoOpenIdentity | null }
    | { type: "focus_tab"; tabKey: string; target: BenchTarget }
    | {
        type: "capture_bench_screenshot"
        tabKey: string
        target: BenchTarget
        drawer: BenchDrawerContext["kind"] | null
      }
    | { type: "close" }
}
```

The backend lease proves authoritative directory-client connection ownership only:

```ts
type BenchClientLease = {
  instanceID: string
  generation: number
  leaseEpoch: number
  directory: string
}
```

The backend does not mirror active chat-session truth into the lease. Required actions are delivered to the authoritative directory lease regardless of action session. The frontend action ledger checks the actual current active session immediately before execution. If the known active session differs, it completes `inactive_session`. If session state is temporarily unknown during hydration, reconnect, or selection churn, the action remains queued until session state is known or the broker expires it.

Required actions remain pending until terminal completion, tool abort, or the 30-second backend expiry. Unexpired required actions redeliver after reconnect. Completed and expired actions are tombstoned and never replayed as fresh work.

The frontend keeps at most 512 terminal action-ledger entries per directory.
Executing entries are never evicted. The backend keeps five-minute terminal broker
tombstones capped at 512 per directory/session.

Best-effort auto-open actions are live-only. They carry canonical policy/event identity, coalesce by
that identity and originating session, do not delay the producing tool, and do not send backend
completions.

OpenCode and Buddy events share one response stream without an eager upstream
pump. Downstream `pull` demand reads at most one transformed OpenCode chunk, so a
paused renderer applies Web Streams backpressure instead of accumulating the
entire upstream in the Buddy process.

## Context Protocol

The frontend publishes model-visible Bench context through sequenced, idempotent writes:

- `PUT /api/bench/session/:sessionID/context`
- `POST /api/bench/client-actions/:actionID/complete`

Both ordinary publication and successful required-action completion use the current authoritative lease and a monotonically increasing publication sequence. Successful action completion publishes the synchronized context with the action ID as the idempotency key before the waiting tool resolves.

Surface `getSnapshot` and route-fallback reads are synchronous. Ordinary
publication acquires its snapshot inside the serialized publication queue. A
committed client action instead captures route, visibility, drawer, and matching
surface context together when completion enters the lifecycle, before it waits
behind older publications. Later target or session changes therefore cannot be
combined with the settled controller observation.

The lifecycle inspects the completion endpoint's semantic response. `completed`,
`already_completed`, and `expired` are terminal. `conflict` is incomplete. If a
reconnect replaced the lease while the request was in flight, the captured
completion is retried with the new authoritative lease and sequence space; a
same-lease conflict remains pending for broker redelivery.

Visible targets publish the ordered tab summaries plus full context for only the selected target.
Parked targets publish their mode, selected tab key, and tab summaries without selected content.
This complete published tab set supports synchronization, validation, and persistence. The automatic
turn prelude and `bench_read_context` apply separate bounded model-facing projections; the read tool
can search the complete internal list without returning it wholesale. Model-visible summaries add
the tab's current one-based position for interpreting user references, while focus commands continue
to use the stable tab key.
Closed, hydration-pending, and no-session states publish closed context. When no matching surface
registration is ready, the route host supplies a loading fallback snapshot for the canonical target
so completion does not wait on a React registration effect.

Publication keys are semantic: directory, session, target key, effective visibility, drawer, and semantic revision. Registration ID and provider object identity are not semantic publication inputs.

Each resident directory/session context entry retains at most 512 idempotency
tombstones and 512 lease-sequence records. Oldest entries are pruned on accepted
writes without a recurring timer; the authoritative broker lease remains the
primary stale-lease gate.

## Persistence And Cleanup

Workspace persistence stores a bounded per-directory map of chat presentation slots. Each slot
contains its ordered logical tabs, selected Bench route, docked state, and last drawer. Draft slots
are promoted into their newly created session without sharing mutable slot state. Legacy
right-sidebar and old Bench persistence keys are discarded by versioned migration while unrelated
UI preferences are preserved.

Runtime-only state is not persisted:

- active drawer
- pending command or attempt
- action ledger
- lifecycle registrations
- hydration status
- animation state
- floating chat geometry

Hydration uses an explicit pending/ready/failed boundary. Chat mounts immediately, while the workspace remains inert and model-closed until hydration reaches a terminal state. Required actions queue while active session state is unknown. Best-effort auto-open actions coalesce during that gap and may be dropped without affecting their producing tools.

Persistence never writes while hydration is pending. Effect cleanup only unsubscribes from store changes; it does not flush defaults. A final state flush occurs only during confirmed directory-root disposal through StrictMode-deferred ownership. This prevents StrictMode replay—or a fast production unmount—from replacing persisted intent before the asynchronous read completes.

Directory lifecycle disposal immediately makes registrations and new work
inactive, then serializes a final closed context for the last authoritative
session before releasing the captured client lease. This ordering remains valid
when child React cleanup clears the active session before the keyed root disposes.

## Removed Legacy Paths

The final tree removes the old live command and sidebar paths:

- transcript-scanning `BenchAutoOpen`
- mutually exclusive `rightWorkspaceSurfaceByDirectory`
- legacy right-sidebar tab/components/panel builders
- invisible teaching editor and curriculum sidebar writers
- manual duplicate leave-guard callers
- module-global Bench lifecycle registries
- context-based backend unsaved-work and missing-context preflights in `bench_present`
- close-transition DOM queries and timers
- unused transition classifier labels and geometry directives

Reading state, whiteboard object state, model context history, and DevTools-owned diagnostics remain domain-owned and are not treated as sidebar presentation state. Resource/session provenance may support explicit history UI, but it cannot drive generic object opening or chat selection.
