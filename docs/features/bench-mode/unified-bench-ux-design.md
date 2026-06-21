# Unified Bench UX

> Historical note: this document is retained as product/background context. The current implementation no longer uses legacy right-sidebar ownership or transcript-scanned Bench presentation. For the active architecture and invariants, read `current-architecture.md`; for the authoritative refactor plan, read `bench-refactor.md`.

Status: Cut 1 implemented; Cut 2 UX and implementation contract locked.

This document sits beside `managed-objects-design.md`. That document defines
the managed-object primitive. This document defines how the product should use
that primitive to simplify navigation, file/object opening, and Bench
presentation.

## Design Frame: Divergence To Convergence

Buddy's current UI should be understood as the output of a divergence phase.
During divergence, multiple surfaces, states, viewers, panels, persistence
keys, and routing paths were allowed to exist so product behavior could be
explored quickly.

That does not make every existing surface a defined product decision. The
defined decisions are now the convergence primitives:

1. **Bench** is the first convergence layer: one model-visible presentation and
   interaction surface.
2. **Managed objects** are the second convergence layer: one app-owned identity
   and storage model for Buddy-created or Buddy-managed learner objects.
3. **Surface convergence** is the next layer: Explorer, Library, sidebars,
   promoted panels, file viewers, and tool presentations should converge onto
   Bench.

Bench and managed objects were created so many product decisions can now be
made quickly. When a divergent surface cleanly maps to those primitives, it
should be cut over directly and the old path should be removed instead of
preserved behind extra compatibility. Risk isolation is reserved for areas
where dependencies are still unclear, where a workflow has no Bench equivalent
yet, or where the blast radius includes persistence, dirty state, model
context, or cross-session behavior.

Existing state such as `mainPaneTab`, `rightSidebarTab`, file-panel tabs,
pending panel opens, and old side-panel object flows should be treated as
implementation history. They may remain only as temporary scaffolding for a
cut that has not landed yet. They are not architectural constraints, and they
should be deleted when Bench/object ownership covers the workflow.

## Problem Statement

Buddy currently has multiple places where user-visible content can open:

- Bench routes for managed objects, Markdown files, resource readers, whiteboard
  sessions, HTML widgets, Mermaid, figures, media presentations, flashcards,
  and question sets.
- A project Explorer file panel inside the right sidebar. This panel has its
  own local tab strip, text editor, Markdown preview, image preview, Foliate
  reader preview, and default-app fallbacks.
- Main-pane Library and promoted panels such as resources, diagrams,
  instructions, flashcards, and question sets.
- Special side-panel flows such as question-set selection.

The result is not predictable. Some content opens on Bench, some opens beside
Explorer, some opens from Library into Bench, some still targets a sidebar, and
some flows can appear to switch to an unrelated chat/session context.

The target UX is one content destination:

> Anything that is opened for viewing, reading, editing, or presentation opens
> on Bench.

Explorer, Library, and object shelves remain useful, but they become browsing
and selection surfaces. They should not own separate content viewers.

## Current Code Assessment

The current frontend already has the foundation for a unified Bench:

- `packages/web/src/lib/bench-targets.ts` defines `BenchTarget` as either a
  workspace file or a managed object.
- `packages/web/src/lib/bench-route-adapter.ts` maps Bench targets to routes:
  `/$directory/_bench/markdown`, `/$directory/_bench/file`, and
  `/$directory/_bench/objects/$kind/$objectID`.
- `packages/web/src/lib/use-open-bench.ts` centralizes Bench navigation,
  preference policy, replacement behavior, auto-open suppression, and leave
  guards.
- `packages/web/src/routes/$directory._bench.objects.$kind.$objectID.tsx`
  dispatches managed-object views by renderer.
- `packages/web/src/routes/$directory._bench.markdown.tsx` already opens
  Markdown through the first-class Markdown Bench editor.
- `packages/web/src/routes/$directory._bench.file.tsx` already previews
  non-Markdown workspace files on Bench.
- Bench context publishing is already tied to Bench routes, which is the right
  model-facing boundary.

The split behavior mainly comes from older UI surfaces and open policies:

- `packages/web/src/lib/workspace-file-open.ts` can choose
  `workspace-panel`, `markdown-bench`, `reading`, `default-app`, `reveal`, or
  `copy-path`.
- `packages/web/src/lib/use-workspace-file-open.ts` queues general file opens
  into `useWorkspaceFilePanelStore` when the user is not already on a Bench
  route.
- `packages/web/src/components/project-explorer/project-file-explorer-panel.tsx`
  owns a full local file viewer and local tabs. That implementation contains
  useful behavior to harvest, but the product surface should not survive as a
  second content destination.
- `packages/web/src/components/directory-chat/directory-chat-conversation-pane.tsx`
  still treats Library/resources/diagrams/instructions/flashcards/question sets
  as main-pane alternatives to chat.
- `packages/web/src/components/directory-chat/directory-chat-bench-page-layout.tsx`
  currently renders docked Bench as `Bench | Chat`. The desired default is
  `Chat | Bench`.

## Design Goals

1. **One destination for content.** Opening a file, object, reader, widget,
   diagram, flashcard deck, question set, whiteboard, or media presentation
   should route to Bench.

2. **Bench lives to the right of chat by default.** The convergence target is
   one fixed docked placement: `Chat | Bench`. Left-side placement, detachable
   placement, or drag-to-reposition are separate layout features and should not
   be mixed into this convergence cut.

3. **Explorer and Library are browsers, not viewers.** They help the user find
   files and objects, then open the selected target on Bench.

4. **Markdown uses the first-class Markdown Bench editor.** Agent files such as
   `AGENTS.md`, normal Markdown files, and generated Markdown should not open in
   a separate Markdown viewer/editor if they can open on Markdown Bench.

5. **Non-Markdown source files need a Bench editor surface.** Arbitrary text
   files cannot keep depending on the Explorer panel viewer. Bench needs a
   Monaco-backed or existing `VersionedTextFileEditor`-backed source view for
   editable text files.

6. **Managed objects stay object-first.** Managed-object identity, route
   targets, model context, and presentation descriptors should stay keyed by
   `objectID`, not paths or old artifact concepts.

7. **Opening from Library must stay in the correct notebook/session context.**
   Clicking an object from Library should open that object's directory on
   Bench, preserving the current or last active session for that directory. It
   should not land the user in an arbitrary chat.

8. **The model sees only the Bench surface the user can see.**
   `bench_read_context`, `bench_present`, auto-open, and close/replacement
   policy should operate against the visible Bench target. If a Bench target is
   kept mounted only to preserve UI state while the right workspace is
   collapsed, the published model context is `closed`.

## Target Information Architecture

The stable desktop layout should become:

```text
Left sidebar | Chat | Right workspace
```

The right workspace is the convergence successor to the current right sidebar.
Bench should be hosted in that right-side slot and share its open/collapse
control, but it should not be nested conceptually inside the old
`ChatRightSidebar` tab component. The old sidebar is a panel/tab surface. Bench
is a first-class route-backed, model-visible content primitive.

The product model is:

- one right workspace toggle;
- one right workspace width/collapse state;
- Bench as the primary content surface inside the right workspace;
- Explorer, Library, and object shelves as selectors inside the same right
  workspace;
- close/replace actions on the active Bench target, separate from collapsing
  the workspace.

Collapsing the right workspace hides the surface without inventing a separate
Bench toggle. Closing a Bench target clears the content target. Those are
different actions and should remain different in the UI.

The right workspace contains:

- the Bench content surface;
- an extreme-right rail for workspace actions and selectors;
- adaptive selector UI for Explorer, Library, and later object shelves;
- Bench controls for close, layout mode, and target actions.

The rail is the right-workspace navigation surface. Existing scattered
workspace shortcuts, such as Library/Instructions buttons in the titlebar and
prompt-level Bench shortcuts for reading/whiteboard, should move into this rail
for the Cut 1 path instead of remaining as duplicate primary entrypoints.

This does not require inventing a user-customizable pane system. The clean
layout cut is to change Bench's docked layout from `Bench | Chat` to
`Chat | Bench`, then route old right-sidebar file viewer opens into Bench
instead of the Explorer panel.

The floating mode is an invariant, not an optional follow-up. Its purpose is to
let the user see the whole Bench surface, such as a whiteboard or book, while
still being able to chat. The current Bench-first model, where Bench occupies
the main canvas and chat floats above it, matches that intent and should remain
part of the convergence target.

## Open Behavior Requirements

### Workspace Files

- Clicking a Markdown file opens `BenchTarget` with
  `{ type: "workspace-file", viewer: "markdown" }`.
- Clicking a readable resource file opens the reader view on Bench.
- Clicking an image, PDF, audio, video, or previewable binary opens
  `{ type: "workspace-file", viewer: "file" }` on Bench.
- Clicking an editable non-Markdown text/source file opens a Bench source
  editor view.
- Unsupported or oversized files should offer default-app and reveal actions
  without opening a second in-app viewer.
- The right-sidebar Explorer must not create or select local file-viewer tabs
  as the primary open behavior.

### Managed Objects

- Clicking any Library object opens the corresponding object Bench route.
- Question sets and flashcards should use Bench review/practice views, not
  special sidebar panels as the primary presentation.
- Mermaid, figures, media, and HTML widgets should continue using their
  managed-object Bench views.
- Whiteboard and resource objects should continue registering Bench context.

### Agent And Instruction Files

- Workspace `AGENTS.md` files should open through Markdown Bench.
- Global or app-managed instruction surfaces that do not have a workspace file
  path should either become managed objects or remain settings/editor surfaces.
  They should not add another Markdown content destination.

### Tool Presentation

- `bench_present` and object-producing tools should present into the single
  active Bench surface.
- Replacement, close, block, and auto-open behavior should keep using explicit
  typed presentation metadata.
- A tool should not need to know whether the target was originally selected
  from Explorer, Library, chat transcript, or a tool card.

## Tab View Assessment

There is already a local tab model in `ProjectFileExplorerPanel`, but it is
scoped to the Explorer file viewer. Keeping that as the product tab model would
recreate the split surface under a different name.

A proper Bench tab model is possible, but it is a separate Bench primitive.
It should not be inherited from Explorer and it should not block the current
surface convergence. If tabs are added in this cut, they need explicit product
and API decisions:

- How is a tab identified: `tabID`, target identity, route index, or active
  target only?
- Is the tab list global per notebook, per chat session, or per window?
- How many tabs are retained before overflow?
- Does `bench_present` replace the active tab, reuse a matching target tab, or
  open a new tab?
- What does `bench_read_context` return when multiple tabs exist: active tab
  only, selected tab, or all visible tabs?
- How do dirty editors and leave guards work per tab?
- How are tabs encoded in TanStack Router search params without making URLs
  fragile?
- Which tabs are restored after app restart?

Decision for the current convergence cut:

- Keep Bench single-target.
- Remove Explorer-owned content tabs from primary open behavior.
- Do not expose visible tabs until they are designed as a Bench-level primitive.
- A small recent-target history can exist internally if it simplifies routing,
  but it is not a user-facing tab model.

The likely future tab direction is a bounded Bench tab strip with the active
tab as the only model-facing context. `bench_present` should default to
replacing or reusing the active tab unless the tool contract is extended with an
explicit tab action.

## Implementation Direction

Each implementation cut should have a clear before/after boundary. Adjacent
clean cuts should be batched when the mapping is obvious.

- identify one divergent surface;
- decide whether it cleanly maps to Bench/object primitives now;
- if it does, route the behavior to Bench and delete the old destination in the
  same cut;
- if it does not, isolate the risk, add the missing Bench capability, then cut
  over;
- preserve the user workflow and model context throughout;
- keep compatibility only when a workflow still has no Bench equivalent or a
  known risk has not been retired yet.

### Cut 1: Right Workspace And Docked Bench Convergence

Status: locked for implementation.

Cut 1 changes the docked Bench experience from a separate `Bench | Chat` route
layout into a right-workspace layout:

```text
Left sidebar | Chat | Right workspace
```

The right workspace owns one collapse toggle, one width state, an extreme-right
rail, adaptive selector UI, and Bench content. Floating mode remains a
full-canvas Bench with floating/minimizable chat and no rail.

No backend, OpenAPI, SDK, or model-facing hidden context state is added in this
cut. Bench context remains binary: `open` or `closed`.

#### Locked UX Decisions

- The right workspace reuses the current right-sidebar placement, width, and
  open/collapse mechanics where useful, but Bench is not another old
  `ChatRightSidebar` tab.
- When a Bench target is visible, the workspace should not show residual
  Explorer/sidebar chrome unless the user explicitly opens a selector.
- The rail sits on the extreme right and is visible only while the right
  workspace is open.
- Rail order is contextual actions first, then selectors:
  Reading, Whiteboard, divider, Explorer, Library.
- Existing Library/Instructions/titlebar workspace shortcuts and prompt-level
  Bench shortcuts should move into the rail for this path. They should not
  remain as duplicate primary entrypoints once the rail is present.
- Rail-driven and selector-driven opens are right-workspace actions, so they
  open targets in docked mode. Floating remains available only through explicit
  floating-mode flows.
- Explorer and Library open from the rail as selectors, not as content viewers.
- Selector UI is adaptive: a side pane beside Bench when workspace width allows,
  otherwise an overlay drawer over Bench.
- The pane-vs-drawer choice is width-derived. Use existing right-sidebar width
  constants and keep Bench above a useful minimum width.
- Selectors close after item selection by default.
- While a selector is temporarily open over or beside a visible Bench target,
  Bench context remains `open`.
- Opening the right workspace with no parked Bench target restores the last
  selector for that directory, falling back to Explorer.
- Collapsing the workspace with Bench visible parks the target in frontend UI
  state, keeps the route/component mounted when useful for local state, hides
  the workspace, and publishes `closed` Bench context.
- Reopening the workspace restores the parked target and republishes `open`
  Bench context.
- Explicit Bench close clears the target, publishes `closed`, navigates back to
  chat if needed, collapses the workspace, and makes the next workspace open
  show the last/default selector.
- `bench_present` open actions must reopen the workspace even if the same Bench
  route target is already mounted but parked.
- `bench_present` close actions should clear the target and collapse the
  workspace after route close.
- The titlebar should look like normal chat while Bench is parked/hidden. The
  right-workspace toggle may show a subtle parked-target indicator.
- Floating Bench mode keeps its current full-canvas behavior and shows no rail.

#### Deliberated And Rejected Cut 1 Directions

The selected design above came from explicitly rejecting the following
alternatives. These are not fallback implementation options:

- Rejected treating Bench as another tab inside the old `ChatRightSidebar` or
  showing residual Explorer/sidebar chrome whenever Bench is visible.
- Rejected keeping an explicitly closed Bench workspace open as a large empty
  surface. Explicit target close collapses the workspace.
- Rejected equating a mounted route with user-visible or model-visible Bench
  state. A parked component may remain mounted, but the user cannot see it and
  model context is `closed`.
- Rejected adding a model-facing `hidden` or `parked` Bench context state. The
  public model remains binary: `open` or `closed`.
- Rejected a Bench-only workspace with no selector access while a target is
  open because it makes switching files and objects harder.
- Rejected placing the rail on the left of the workspace. It belongs on the
  extreme right and the workspace composes from right to left.
- Rejected swapping the entire content area from Bench to Explorer/Library as
  the primary switching interaction because changing files would require an
  unnecessary return step.
- Rejected permanently showing three columns at every width. Selector and
  Bench may sit beside each other only when width allows; constrained layouts
  use an overlay drawer.
- Rejected keeping the selector open after selection merely because the window
  is wide. Progressive disclosure closes it by default at every width.
- Rejected closing or hiding Bench model context while a temporary selector is
  open. The visible Bench remains the model-facing surface.
- Rejected independent selector sizing, new workspace animation language, and
  a floating-mode rail. Cut 1 reuses existing width and motion behavior and
  keeps floating Bench full-canvas.
- Rejected showing the Bench back-to-chat control while parked. The titlebar
  looks like normal chat, with only a subtle parked-target indicator on the
  workspace toggle.

#### Implementation Checklist

- Add a `RightWorkspace` controller/state layer before component polish:
  open/collapsed state, width state, visible Bench target, parked target,
  active selector, selector mode, and `lastSelectorByDirectory`.
- Create `RightWorkspaceShell`, `RightWorkspaceRail`, and adaptive
  selector pane/drawer components.
- Refactor docked Bench through `DirectoryChatShell` or an equivalent shared
  shell so chat remains the stable main pane and Bench renders in the right
  workspace.
- Preserve the existing floating-mode Bench implementation.
- Update root/titlebar routing so parked Bench routes look like normal chat and
  the Bench back-to-chat affordance is hidden while parked.
- Add a frontend-only visibility flag to `BenchRouteContextProvider`.
  When visibility is false, publish and flush `{ status: "closed" }` while
  keeping leave guards registered.
- Centralize closed-context publication for parked Bench routes instead of
  relying on `BenchClosedContextPublisher` being mounted only on non-Bench
  routes.
- Update `useOpenBench` and `BenchAutoOpen` so parked same-target opens reopen
  the right workspace before policy can return `already-open`.
- Gate or clear `activeReadingResource` prompt context while the reading Bench
  is parked/hidden.
- Preserve dirty-state leave guards: collapse/park should not guard, but
  explicit close and target replacement should continue to guard.
- Extract selector-only Explorer and Library components with `onSelectTarget`
  callbacks and close-on-select behavior.
- Replace old primary workspace file-panel opening paths for Cut 1 so file
  selection opens or replaces Bench instead of opening the old right-sidebar
  local viewer.

#### Cut 1 Acceptance Criteria

- Docked Bench appears to the right of chat inside the right workspace.
- Floating Bench remains full-canvas with floating/minimizable chat and no rail.
- The rail is on the extreme right, actions first, selectors after a divider.
- Existing titlebar/prompt workspace shortcuts are moved into the rail for the
  Cut 1 path and are not duplicated as primary entrypoints.
- Explorer and Library rail actions open selector UI, not old content viewers.
- Selector UI opens as a pane when width allows and as an overlay drawer when
  constrained.
- Selector UI closes after item selection.
- Collapsing visible Bench parks the target, hides the workspace, and causes
  `bench_read_context` to report `closed`.
- Reopening restores the parked Bench target and causes context to report
  `open`.
- `bench_present` can reopen a parked same-target Bench instead of no-oping.
- Explicit Bench close clears the target, collapses the workspace, and makes
  the next open show the last/default selector.

#### Cut 1 Verification

- Run `bun lint`.
- Do not run root `bun typecheck` for documentation-only edits. Run root
  `bun typecheck` before completing the implementation cut.
- Manual smoke:
  - open Markdown, resource, whiteboard, and managed object targets in docked
    mode;
  - collapse and reopen with Bench visible;
  - call `bench_present` for the same parked target and a different target;
  - explicitly close Bench;
  - open Explorer and Library from the rail at wide and narrow widths;
  - verify floating mode remains unchanged.

### Cut 2: Complete Surface Convergence Onto Bench

Status: locked for implementation. This cut replaces the previous staged Cuts
2-5. The decisions below are the implementation contract. Rejected options are
recorded so implementation does not reopen them or make ad hoc substitutions.

Cut 2 completes the move from divergent file, Library, object, and navigation
surfaces to Bench as the only primary content destination. Explorer and
Library remain browsing and selection surfaces. File viewing, source editing,
managed-object presentation, transcript/tool-card opens, and tool presentation
all converge on Bench.

#### Locked Product Boundary

- The center workspace contains Chat and Skills only.
- Library is current-notebook scoped and the right rail is its only primary
  entrypoint. The left-sidebar button, app-level/all-notebooks Library shell,
  and old center-column Library/promoted pages are removed.
- Explorer and Library remain selectors. They do not own content viewers.
- Rail-driven Explorer, Library, Instructions, Reading, and Whiteboard actions
  open docked Bench. Existing transcript/tool-card policy-mode behavior remains
  unchanged.
- Floating Bench remains the Cut 1 full-canvas focused mode with no rail. To
  reach Explorer or Library, the user docks first. Rejected adding duplicate
  floating toolbar selectors or an action that auto-docks and opens one.
- Bench remains single-target. Visible tabs, Explorer-tab migration, tab
  overflow, and tab-aware `bench_present` semantics remain out of scope.
- Cross-notebook Library behavior is out of scope because the app-level Library
  primitive is removed.
- No backend, OpenAPI, or SDK contract change is required or permitted for this
  cut.

#### Locked File Routing Matrix

The existing workspace-file Bench target remains the only non-Markdown file
target:

```ts
{ type: "workspace-file", path, viewer: "file" }
```

A dedicated source route/target was considered and rejected. The existing file
Bench route selects its renderer in this order:

1. Markdown opens in the first-class Markdown Bench/MDX editor.
2. PDF and EPUB open in the Bench reader.
3. Previewable images, including SVG, plus audio and video open in media
   preview.
4. Other readable UTF-8 non-Markdown text opens in Monaco.
5. Binary, unreadable, unsupported, presentation, document, archive, and other
   non-previewable files use default-app, Reveal, and Copy path fallbacks.

Additional routing decisions:

- Preview wins when a file is both text and directly previewable. SVG therefore
  opens visually by default. Rejected making source win and rejected adding a
  view/source toggle in this cut.
- Reader support is deliberately limited to the currently integrated PDF and
  EPUB formats. Rejected expanding Cut 2 to AZW, AZW3, CBZ, FB2, FBZ, or MOBI;
  rejected routing PDF away from the reader while keeping only EPUB.
- CSV, TSV, JSON, HTML, XML, source files, extensionless text, and similar
  valid text use Monaco even if older media classification called them a
  spreadsheet or generic file.
- Source editing supports UTF-8 with or without a BOM and preserves the BOM on
  save. Rejected plain UTF-8-only behavior and rejected adding UTF-16 LE/BE or
  legacy encoding support in this cut.
- Unknown file size is resolved before the soft-limit decision. Text decoding
  and actual byte size, not an extension-only allowlist, determine source
  eligibility.
- Missing files do not create a second viewer. They retain only the actions
  that are actually possible, such as Copy path.

#### Locked Large-File UX

- `1_000_000` bytes is a soft threshold, not a hard editor cap. Files at or
  below the threshold open normally; files above it require explicit approval.
- The same threshold applies to Markdown and non-Markdown source files.
  Rejected opening all Markdown directly without warning and rejected sending
  large Markdown to Monaco instead of Markdown Bench.
- Direct user selection shows a choice dialog with file size, primary
  **Open anyway**, and secondary **Open in default app** when available.
  Reveal and Copy path remain file actions.
- Rejected making the default app primary, giving both dialog actions equal
  emphasis, opening a Bench warning for direct user selection, and hiding
  **Open anyway** only in a menu.
- `bench_present` and direct route loads show an explicit Bench warning surface
  with **Open anyway** and available external actions. Rejected immediately
  showing the same modal and rejected bypassing the warning for tool opens.
- **Open anyway** approval lasts only for the current opening. Reopening or
  refreshing warns again. Rejected session-level and per-file persisted
  approval.
- There is no hard cap after the user approves. This consciously accepts the
  Monaco, network, autosave, and latest-snapshot cost. Existing tool-output
  truncation remains the model-side boundary; no new context truncation policy
  is added here.

#### Locked Source Editor UX

- Monaco renders in the standard file Bench shell, with filename/path chrome,
  a full-height editor, and inline conflict/error UI. Rejected a Markdown-like
  rich toolbar and rejected a nearly chrome-free Monaco surface.
- Monaco follows Buddy's active light/dark theme. Rejected always-dark Monaco
  and rejected an independent editor-theme preference.
- Source lines do not wrap by default. Rejected retaining always-on wrapping
  and rejected adding a wrap toggle in this cut.
- The minimap remains disabled.
- Save state appears only when relevant: Dirty and Saving are compact, Saved is
  brief, and Conflict/Save failed remain visible until resolved. Rejected an
  always-visible state pill and rejected errors-only feedback.
- Preserve existing autosave, Cmd/Ctrl-S, retry, reload, and explicit overwrite
  behavior. On conflict, the choices remain Reload and Overwrite. Rejected
  removing overwrite and rejected adding a merge editor in this cut.
- When an agent/tool finishes editing the open file, reload automatically only
  if the local editor is clean. Dirty local text is preserved and the normal
  version conflict is surfaced on save. Rejected manual-only refresh and
  rejected unconditional reload that can discard local edits.
- Source Bench context contains the entire in-memory editor buffer, including
  unsaved edits. "Visible text" means the full buffer, not only Monaco's
  viewport. Metadata includes version, dirty state, save state, and encoding.
- `VersionedTextFileEditor` must expose a typed live snapshot sufficient for
  Bench chrome, context, and guards: buffer, version, loading, saving, dirty,
  conflict, save error, and flush outcome.

#### Locked Guard And Selector Behavior

- Source state guards destructive exits: target replacement, explicit Bench
  close, directory navigation, and app/window close.
- Collapse/parking is not guarded because the mounted editor and its local
  state remain intact while published Bench context becomes `closed`.
- Before a destructive exit, pending edits may flush; saving, unresolved
  conflict, or failed flush/save blocks the exit. Rejected guarding every hide
  and rejected treating every non-destructive visibility change as an exit.
- Explorer and Library selectors close only after navigation succeeds or a
  same-target focus succeeds. They remain visible when a leave guard blocks or
  opening fails. Rejected always closing and rejected closing specifically on
  guard block.

#### Locked Reader And Resource Processing UX

- Reader-first means PDF/EPUB opens immediately even when it is unprocessed.
  Unprocessed resources route by workspace path because they do not yet have an
  `objectID`.
- Processing is optional. Rejected asking before first open and rejected
  automatically processing on first open because processing creates managed
  resource/model context the user may not want.
- The reader shows a dismissible inline banner, not a header action and not a
  Library-only action. Its CTA is **Process for Buddy**.
- Banner dismissal lasts for the current opening only. Rejected a
  non-dismissible banner and rejected persisted per-file dismissal.
- Processing never replaces or closes the visible reader. The user keeps
  reading while progress is shown. Rejected the preparing cover/screen and
  rejected returning to chat.
- A processing failure leaves the reader usable and shows concise inline error
  text with Retry and dismiss actions. Rejected toast-only failure and rejected
  an expanded diagnostics panel.
- Resource preparation status and reader capability are separate. Preparing,
  unsupported extraction, or extraction error does not block raw PDF/EPUB
  reading when the reader itself can render the file.
- When processing succeeds, the active file-path reader seamlessly replaces
  its route with the managed resource object route. Rejected staying on the
  file route until the next open and rejected asking the user to switch.
- The route upgrade preserves all durable reader state: current location,
  bookmarks, annotations, and reader preferences. Transient menus, dialogs,
  and search UI may close. Rejected preserving only location and rejected
  requiring exact transient UI preservation.
- If the PDF reader itself cannot initialize, keep an inline error with **Open
  preview**, **Open in default app**, Reveal, and Copy path. Rejected silently
  switching to iframe preview and rejected external-only fallback. EPUB has no
  iframe preview and uses the applicable external actions.

#### Locked Library And Object Opening UX

- Every primary Library row/card delegates to one typed asynchronous open
  callback. Resource, flashcard, question-set, widget, diagram, and media cards
  do not navigate internally or own selector-closing behavior.
- Managed objects open docked Bench by `objectID`. Unprocessed PDF/EPUB entries
  are the deliberate exception and open their reader by file path until
  processing creates an object.
- Re-selecting an object already visible or parked focuses/reopens it; it never
  toggle-closes.
- For Library identity, matching `objectID` means the same item. Preserve the
  current revision, item, and view when focusing it. Rejected resetting to the
  Library default view and rejected resolving/opening the latest revision.
- Same-target focus restores a parked docked workspace and closes the selector.
- All listed Library kinds become primary-click openable, including objects
  whose current review/practice view may show an empty state.
- Removing Library and promoted destinations also removes old question-set
  side-panel open/store paths and center-column resources, diagrams,
  instructions, flashcards, and question-set destinations.
- Existing transcript and tool cards continue to use Bench policy mode rather
  than being globally forced to docked mode.

#### Locked Instructions UX

- The rail Instructions item becomes a direct action, not an `AgentsMdPanel`
  selector.
- It reads notebook `AGENTS.md`; if missing, it creates the file with the exact
  existing default:

  ```md
  # AGENTS.md

  Add notebook-specific instructions for Buddy here.
  ```

- Creation uses `expectedVersion: null`. A create race re-reads the winning
  file instead of overwriting it. Failure keeps the current selector/workspace
  state and reports the error.
- Success opens Markdown Bench docked. Clicking Instructions while the same
  `AGENTS.md` target is visible focuses/restores it; it does not close or force
  reload. Rejected toggle-close and rejected reload-on-click.
- Global/app-managed instruction and settings surfaces remain unchanged.

#### Locked Labels And File Actions

- **Open file** labels only the in-Buddy Bench action. Rejected applying the
  same ambiguous label to default-app opening and rejected limiting the label
  to a row while leaving the corresponding menu action inconsistent.
- **Open in default app**, platform-specific Reveal, and **Copy path** retain
  their explicit meanings.
- Applicable default-app, Reveal, and Copy path actions live in a quiet file
  Bench overflow menu. Rejected showing all actions as persistent header icons
  and rejected making them available only from Explorer/Library context menus.

#### Locked Persistence And Cleanup Decisions

- Persisted UI cleanup uses a targeted versioned migration. Removed
  center/right destinations map to Chat or the default Explorer selector while
  unrelated widths, collapse state, Bench preferences, and layout preferences
  survive.
- Rejected resetting every UI preference and rejected leaving stale serialized
  destination keys indefinitely.
- Remove Explorer local viewer tabs/editor paths, stale file-panel queue/store
  state, obsolete object-detail panel state, and callers after their Bench
  replacements exist.
- The Bench route target becomes the source of truth for visible opened
  content. Remaining UI preferences describe visibility, dimensions,
  remembered selectors, and layout rather than alternate content destinations.

#### Explicitly Out Of Scope And Preserved

- Teaching workspace editor migration is completely out of Cut 2. Do not add a
  teaching Bench target, redesign teaching UX, disable teaching entrypoints, or
  delete teaching editor/runtime primitives as part of general cleanup.
- Cut 1 already stopped rendering the legacy teaching sidebar in the normal
  right workspace while teaching state still attempts to select it. Record
  this as a pre-existing known functional gap for a dedicated teaching Bench
  renderer plan; do not misrepresent the teaching flow as unchanged.
- Visible Bench tabs and tab-aware model/tool contracts remain future work.
- Cross-notebook Library and app-level Library migration remain out because the
  app-level Library is removed rather than adapted.
- Additional reader formats, UTF-16/legacy source encoding, a source merge
  editor, and an independent Monaco preference surface remain out of scope.

#### Cut 2 Implementation Contract

- Centralize Library selection and return explicit opened, focused, blocked,
  or failed outcomes so selector lifecycle follows the locked behavior.
- Extend the file Bench renderer and `VersionedTextFileEditor` state contract
  without adding a new Bench target.
- Implement the complete file-routing and fallback matrix in one shared policy;
  remove old `workspace-panel` vocabulary and duplicated character/byte checks.
- Add the soft-limit dialog, route warning state, source context publisher,
  source leave guard, file action menu, and external-edit refresh behavior.
- Add optional reader processing UI, non-blocking processing states, and the
  file-to-object route/state handoff.
- Replace Instructions selector behavior with the shared ensure-and-open flow.
- Remove the divergent file, Library, promoted-page, and question-side-panel
  destinations covered by Bench.
- Add the targeted `buddy.ui.v1` migration before deleting obsolete persisted
  fields.
- Preserve Cut 1 parked/open/closed context behavior and floating-mode layout.

#### Cut 2 Verification

- Add focused tests for the file-routing matrix, labels, UTF-8 BOM round trip,
  soft-limit dialog/warning behavior, and per-opening approval.
- Test source editor state/context, autosave, reload/overwrite conflicts,
  external edits, destructive-exit guards, parking, and app/window close.
- Test centralized Library outcomes, same-object identity, selector retention
  on block/failure, every object kind, and explicit docked Library opens.
- Test unprocessed reader opens, optional processing, failure/retry, seamless
  object-route upgrade, and durable reader-state preservation.
- Test `AGENTS.md` creation, create races, failure, docked open, and same-target
  focus.
- Test the targeted UI preference migration and deletion of obsolete state.
- Run affected `packages/web` tests, root `bun lint`, and root `bun typecheck`.
- Manually smoke Markdown, AGENTS.md, small and large source files, media, PDF,
  EPUB, unsupported/binary files, Library objects, selector blocks, parking,
  floating mode, `bench_present`, and `bench_read_context`.

## Risks And Constraints

- The current Bench route owns a different page layout from the normal chat
  route. Moving Bench to the right is easy mechanically, but collapsing the
  normal right sidebar and Bench conceptually requires careful state cleanup.
- The Explorer panel currently contains valuable editor, Markdown preview,
  Foliate reader, image preview, local tab, and default-app fallback behavior.
  The implementation should reuse the valuable parts but not keep the panel as
  a second destination.
- Dirty editor state must block target replacement and Bench close.
- Resource reader state and linked reading sessions must survive the move.
- Tool-driven auto-open should not fight user-driven Bench replacement.
- On narrow windows, the width-derived selector pane/drawer policy must protect
  both chat and Bench from becoming unusably narrow.

## Overall Convergence Acceptance Criteria

- From the user's perspective, there is one place where opened content appears:
  Bench.
- Docked Bench appears to the right of chat.
- Explorer and Library selections open Bench targets instead of local content
  viewers.
- Markdown files, including workspace instruction files, use the first-class
  Markdown Bench editor.
- Non-Markdown editable text files have an in-Bench editing path.
- Managed objects open by `objectID` on Bench from Library, transcript cards,
  and tool output.
- Opening a Library object does not switch to an unrelated chat session.
- `bench_read_context` describes the visible Bench target.
- `bench_present` operates on the same visible Bench target and preserves close,
  block, and replacement semantics.
- No primary user workflow depends on the old right-sidebar file viewer after
  the refactor.
