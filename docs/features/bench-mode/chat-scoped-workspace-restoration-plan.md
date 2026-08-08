# Restore the Right Workspace Per Chat

## Status

Implemented on 2026-07-24.

Amended in August 2026 for directory-owned artifact continuity. The current
ownership and command boundary remains authoritative in `current-architecture.md`.

## Product Decision

The right-workspace infrastructure remains directory-owned, while its visible presentation is
owned by the chat.

- `DirectoryWorkspaceProvider`, its controller, lifecycle service, and live registry remain keyed
  by canonical directory.
- Each durable chat stores its own workspace presentation slot.
- The directory's single draft stores one draft presentation slot and promotes it to the new
  session when the first prompt creates that session.
- A same-directory New Chat draft copies the currently visible directory-owned
  target and layout into an independent draft slot. The presentation stays
  visually continuous while later changes diverge independently.
- Selecting an existing chat restores that chat's slot automatically.
- Returning to a chat must not replay a drawer or workspace entrance animation.
- Explorer, Skills, and other drawer data remain directory-scoped. Only the drawer selection and
  visibility are chat-scoped.

Do not key `DirectoryWorkspaceProvider` by session. Do not keep an unbounded React subtree mounted
for every chat.

## Presentation Slot

Each slot contains only serializable presentation state:

- the active Bench route snapshot: closed, or target plus docked/floating mode;
- docked workspace visibility and selected drawer;
- the last drawer used by that chat.

Meaningful surface state belongs to the surface's existing chat-, object-, or file-scoped state
owner. A presentation slot does not serialize component instances.

Slot keys distinguish:

- durable sessions;
- the directory draft;
- transition-only placeholders, which are never persisted.

Persistence is directory-keyed and stores the slot map. The schema version is bumped; backward
compatibility is not required.

## Session Transition

All active-chat mutations continue through one application-global serialized coordinator.

For a same-directory transition:

1. Capture the outgoing route and projection in the outgoing chat's slot.
2. Run the current surface leave guard. A failed whiteboard save blocks the chat change.
3. Publish closed context for the outgoing chat and stage the destination projection. Existing
   chats restore only their saved slot; a New Chat draft may receive a value-copy of the outgoing
   visible directory-owned target and layout.
4. Mutate/select the chat.
5. Resolve the authoritative destination identity, including fallback or draft results.
6. Restore the destination slot atomically through the live directory controller.
7. Replace the URL with the destination slot's Bench route, or the chat route when the slot is
   closed.
8. Publish the restored projection for the destination chat.

For a cross-directory transition:

1. Capture and guard the mounted source workspace.
2. Read the destination chat slot from serialized directory persistence.
3. Mutate/select the destination chat.
4. Navigate directly to the destination slot's route.
5. Let the destination provider hydrate the same slot before displaying the workspace.

New drafts inherit the visible same-directory artifact presentation into an independent slot.
Promotion preserves that draft slot. Existing chats always restore their own slot. Forks and
durable sessions created without a promoted draft start closed unless a separate explicit policy
initializes them. Generic resource opening presents in the already active chat and cannot select a
destination chat; any future “Continue discussion” compound action must remain explicit.

## Controller and Store

Replace `prepare-session-change` with semantic chat-transition commands:

- prepare/capture an outgoing chat and stage the destination;
- restore an authoritative destination chat;
- promote a draft slot to a newly created durable session.

The controller remains the only owner of guarded route navigation and pending projection
arbitration. Store actions perform immutable slot updates and keep the active slot's `docked` and
`lastDrawer` projection synchronized.

The directory store must never derive one chat's targetless expanded workspace from another chat's
`lastDrawer`.

## Lifecycle

- Outgoing context is closed before chat selection changes.
- No staged route or drawer is published to the outgoing chat.
- The incoming chat receives only its restored visible slot.
- Drafts publish no server Bench context until they have a durable session ID.
- Draft promotion preserves the draft presentation without closing or remounting it.

## Rendering and Motion

- Restoration navigation disables browser view transitions.
- Workspace restoration does not run the ordinary drawer entrance animation.
- The entire directory layout is motionless while changing chats. Open-to-open, open-to-closed,
  closed-to-open, width, docked/floating, and compensating left-sidebar geometry all snap directly
  to the destination chat's saved presentation without interpolation.
- The inter-chat motion-suppression phase begins before source preparation and remains active
  through the destination's first painted frame, including cross-directory provider replacement.
- Direct user open, close, dock, float, and resize actions within the current chat keep their
  ordinary interaction animations.
- Same-directory chat switches shield outgoing content before replacing it with the destination
  presentation. The outgoing frame may remain as transition geometry, but it must never animate
  into the destination geometry.
- The directory provider remains mounted for same-directory chat switches.
- Heavy surfaces may remount when the restored target differs; their meaningful state must restore
  from their existing domain state rather than from an unbounded keep-alive cache.
- Cross-directory navigation necessarily remounts the directory workspace.

## Failure and Race Policy

- A blocked leave guard keeps the current chat and workspace unchanged.
- A failed selection leaves the outgoing slot captured and restores the authoritative selected
  chat, if any.
- Only the latest global transition may mutate final navigation or presentation.
- Missing-session fallback restores the fallback chat's slot, not the requested chat's slot.
- Stale transition placeholders and stale persistence writes are ignored.
- Storage failure must not show the outgoing chat's presentation in the destination chat; use a
  closed in-memory fallback.

## Entry Points

Use the coordinator for:

- sidebar, titlebar, thread-browser, and composer new/select actions;
- `/new`, fork, transcript fork, active archive fallback, and starter chats;
- Settings, notifications, Quick Chat, and cross-directory activation;
- an explicitly requested compound “Continue discussion” transition, if that
  product action is added; generic resource presentation never uses this
  coordinator.

Non-active archival does not transition workspace state.

## Tests

### Store and persistence

- Chat A and Chat B retain independent route, visibility, drawer, and `lastDrawer` slots.
- A New Chat draft copies the current visible directory-owned target and layout into an independent
  slot; a closed source remains closed.
- Draft promotion preserves its presentation.
- Persistence restores the selected chat's slot and cannot mix slots.
- Transition-only slots are not persisted.

### Controller and coordinator

- Files open in A → select New Chat draft B → B visibly retains the same file in an independent
  slot.
- Files open in A → select existing B with Skills open → B restores Skills.
- Returning to A restores Files automatically.
- No intermediate projection exposes A's target or drawer under B.
- A whiteboard save failure blocks selection.
- Successful whiteboard settlement captures A and restores B.
- Missing-session fallback restores the fallback slot.
- Cross-directory navigation targets the destination slot directly.
- Overlapping transitions allow only the newest restoration and navigation.
- Generic resource presentation preserves the already active chat and never restores a historical
  linked session.

### Lifecycle and rendering

- A closes before B publishes.
- Draft promotion does not close and reopen the same presentation.
- Restoration uses disabled view transitions and does not add drawer entrance classes.
- Every inter-chat layout pairing is instant: open/open with different widths, open/closed,
  closed/open, docked/floating, and left-sidebar compensation.
- Direct same-chat workspace toggle actions still use the ordinary layout animation.
- Same-session selection is a presentation no-op.

## Verification

Run affected `packages/web` tests, then from the repository root:

1. `bun lint`
2. `bun typecheck`

Run `bun fmt` only after implementation is complete and the user is satisfied.

## Acceptance Criteria

- A same-directory New Chat inherits the visible directory-owned target and layout by value, without
  sharing mutable workspace state.
- Each existing chat automatically restores its own right-workspace presentation.
- Returning to a chat does not require manually reopening its drawer or Bench target.
- Restoration does not replay the drawer entrance animation.
- No part of the directory layout interpolates between two chats' presentations.
- Opening or closing the right workspace directly inside one chat still animates.
- The provider/controller/lifecycle remain directory-owned.
- A whiteboard object never belongs to the chat. Target replacement or exit still uses its leave
  guard; a New Chat continuity transition that retains the same object does not reassign ownership.
- All chat-changing entry points use the same latest-wins transition.
- Cross-directory restoration navigates directly to the destination slot.
- Outgoing Bench context never leaks into the incoming chat.
