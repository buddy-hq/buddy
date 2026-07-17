# Buddy Managed Objects

> Historical note: this document contains managed-object design background that predates the final Bench ownership refactor. Managed-object domain concepts may still be relevant, but stale Bench presentation details such as `BenchAutoOpen` policy wiring should be checked against `current-architecture.md` and the authoritative `bench-refactor.md` plan before implementation.

This is the working design source for consolidating Buddy resources,
artifacts, whiteboards, media presentations, HTML widgets, and other
app-managed learner objects.

The document intentionally includes the problem statement because the API and
storage decisions only make sense against those problems.

## Implementation Note

This document is the implementation source of truth for the managed-objects
cut. The architecture, invariants, storage ownership, model-facing tool shapes,
and frontend/backend API shapes are the parts to preserve. Exact prose wording,
example strings, and helper names are not sacred when implementation reveals a
better local fit.

The litmus test is: after the cut, every supported workflow must still work for
newly-created objects without user-facing or behavioral regressions. Old object
data does not need to keep working. This should be a clean design cut, not a
compatibility layer between old resources/artifacts and new managed objects.
Remove old code paths, old prompt instructions, old metadata parsers, old route
assumptions, and old storage conventions in the same vertical slice that
replaces them. Do not leave a pile of compatibility shims that makes future
work reason through both architectures.

This no-regression heuristic comes from the review issues that remained after
the structural architecture stabilized:

- `whiteboard_read_context` looked "read-only" in prose, but current behavior
  persists `modelContext` and continuation safety depends on it.
- Whiteboard start-of-tool auto-open needs an object target early enough to
  preserve the current progressive Bench-opening UX.
- Resource storage cannot move without moving prompt inventory, active-resource
  prelude, resource chips, reading skills, and `ingest_full_text` terminology.
- Resource preparation needs objectID-scoped generation/locking so stale
  background builds cannot write after delete, rename, or rebuild.
- `bench_present` close/block/open behavior must survive the removal of the old
  JSON-output parser through explicit typed metadata.
- Mermaid repair must preserve the existing repair state machine while changing
  the durable target from replacement artifact to replacement revision.

During implementation, use
`docs/guides/buddy-http-curl-smoke.md` to smoke the creation and presentation
paths, especially the high-risk paths above: resource prepare/ingest/present,
HTML widget adopt/edit/present, whiteboard create/read/edit/Bench-open, Mermaid
repair, media presentation, question sets, flashcards, and `bench_present`
close/block/present flows. Prefer prompt-driven smoke cases where the risk is
model/tool behavior, not just direct route calls.

Before considering the cut complete, run an explicit `rg`/grep audit for prompt
drift, old vocabulary, stale paths, and compatibility shims. The audit should
look for terms such as old artifact/result metadata names, `artifactID` in
model-facing object workflows, `resources/<alias>/processed`,
`.buddy/artifacts`, old resource `id` as primary identity, JSON-output parsing
for `bench_present`, and dual old/new frontend parsers. Investigate every hit:
either remove/update it, justify it as intentionally unrelated, or record a
logged divergence/blocker. This audit is in addition to lint, typecheck, tests,
SDK generation, and smoke flows.

For newly-created managed objects, do not preserve old vocabulary merely inside
private payload files or route response field names. New object payloads,
object state, object routes, tool metadata, and frontend object consumers must
use `objectID`/`revisionID` terms instead of `artifactID` or other legacy
identity names. Existing old routes may keep old vocabulary only while they
remain old-route compatibility surfaces for pre-cut artifact data; they must
not be the storage or API contract for new managed objects.

The no-old-vocabulary rule also applies to new or touched function names, type
names, filenames, route module names, query keys, test fixtures, helper names,
comments, and docs. Do not hide legacy terms behind private code paths. While
implementing, run a focused `rg`/grep pass over changed files regularly for
legacy vocabulary such as `artifact`, `artifactID`, `.buddy/artifacts`,
`resources/<alias>/processed`, old resource `id` identity, and dual-parser
language. Treat unexpected hits in changed files like typecheck failures:
remove or rename them before continuing, unless the hit is in an intentionally
old compatibility surface that is still being deleted in the same end-to-end
cut. Whenever typecheck is used as an implementation checkpoint, run this
focused changed-file vocabulary audit alongside it instead of deferring the
audit to the final pass.

This includes old vocabulary embedded in implementation names: function names,
type aliases, route filenames, test filenames, fixture names, helper names, and
frontend query/cache identifiers should not retain the old architecture's terms
after they are touched for this cut. A typecheck checkpoint is incomplete unless
the changed-file grep check has also run and the hits have been removed,
renamed, or explicitly logged as still-pending deletion work.

Execute this cut end to end. Internal sequencing by dependency order is fine,
but do not treat a narrow slice as complete while supported workflows remain on
the old architecture. If a true blocker prevents end-to-end completion, record
the blocker and the exact unfinished contracts rather than stopping at a
partial milestone.

Use subagents only for concrete implementation work with clear, disjoint write
ownership. Do not use subagents for read-only exploration, architecture mapping,
or general codebase reconnaissance. Choose their model and reasoning level based
on the implementation task: use stronger reasoning for architecture-sensitive
storage/tool/API changes, and smaller agents for isolated mechanical edits.
Subagents do not own correctness. The main implementation agent remains
responsible for reading their results critically, integrating the work, running
the relevant checks, and ensuring the final system matches this architecture.

Do not edit this design source of truth without explicit user permission. If
implementation reveals that the map is not the territory and a local deviation
is required, do not silently rewrite the design to match the code. Record the
deviation in the implementation log under an explicit `Divergences` section,
including the reason, impact, and whether follow-up design approval is needed.
Expect some implementation dead ends to become visible only after running the
actual code, checks, tests, generated SDK, or smoke flows. When that happens,
adapt pragmatically while staying faithful to the architecture's intent:
coherent object identity, Buddy-owned storage, explicit typed metadata, no
parallel old/new contracts for newly-created objects, and preserved learner
workflow behavior. Smart local divergence is allowed when it is discovered by
implementation reality, but it must be logged instead of hidden.

Maintain an implementation decision log while coding, for example
`docs/features/bench-mode/managed-objects-implementation-log.md`. Update it
after each logical set of edits with what changed, what was intentionally
removed, what contracts were preserved, and any local deviations from this
design. The log must always include a clearly labeled `Divergences` section,
even when there are no divergences yet. When context is summarized or compacted,
the implementation agent must reread this architecture document before
continuing and then reconcile the decision log against it.

## Objective

Buddy needs one coherent model for things the app creates, imports, processes,
edits, renders, shows inline, shows on Bench, lists in Library, and returns to
the model as stable references.

The target concept is:

> A Buddy-managed object is anything Buddy registers as app-managed local state,
> regardless of whether it began as user input, model output, app processing, or
> live UI state.

Raw workspace files remain raw workspace files until Buddy registers them as
managed objects.

The managed-object model must cover prepared resources, Mermaid diagrams,
figures, media presentations, HTML widgets, question sets, flashcard decks, and
whiteboards. Raw workspace files and Markdown files remain valid non-object
Bench targets.

## Problems

### Identity Is Fragmented

Today "show the thing Buddy made or processed" may require an artifact kind plus
artifact ID, resource ID, alias, source path, processed pack path, whiteboard
session state, route search params, feature-specific frontend metadata, or prose
inside a tool result.

Every new object kind wires those crossings manually.

### Source And Presentation Are Mixed

A file path locates bytes; it does not define a learner-facing surface.

Examples:

- an HTML file can be editable source or a rendered widget;
- a PDF can be raw file preview or prepared reading resource;
- an SVG can be a raw file, figure, or media item;
- a media file can be standalone or one item inside a media presentation.

The current HTML snapshot flow exposed this: the model writes a file, calls
`present_html_widget`, Buddy snapshots it under `.buddy/artifacts`, and later
edits to the original file do not update the shown card. The separation is real,
but the architecture does not make source identity and presentation identity
explicit enough.

### Buddy Lets The Agent Choose Too Much Storage Shape

For ordinary code and documents, the agent should use normal file tools.

For Buddy-managed learner objects, Buddy must own canonical placement, IDs,
manifests, source roots, revisions, derived outputs, and mutable state. The
agent should not invent where managed HTML, generated apps, processed resources,
or whiteboard state live.

### Tool Outputs Do Not Share A Contract

Current object-producing tools return feature-specific metadata:

- `present_media`: `PresentedMediaOutput`;
- `present_html_widget`: `PresentHtmlWidgetOutput`;
- `render_mermaid`: `RenderMermaidOutput`;
- `render_figure`: `RenderFigureOutput`;
- `save_question_set`: `SaveQuestionSetOutput`;
- `save_flashcard_deck`: `SaveFlashcardDeckOutput`;
- `prepare_resource`: XML-ish text plus resource metadata;
- `whiteboard_create_view`: continuation and board metadata.

The frontend parses these feature-by-feature. The model learns them
feature-by-feature. Bench auto-open and Library logic get more fragile as new
kinds are added.

### Presentation Logic Is Too Tool-Specific

Bench and transcript presentation currently depend on a mix of routes, artifact
kinds, resource fields, whiteboard special cases, and metadata tags. The
frontend should consume one shared object-result metadata contract and then
dispatch to the correct object view.

### Extension Cost Grows With Every Object Kind

Each new family currently adds bespoke rules for storage, model identity,
inline rendering, Bench rendering, Library rows, context reads, updates,
versions, repair, and re-presentation.

The target architecture should make new kinds boring: add a kind, a payload
layout, views, and context behavior while reusing identity, listing,
presentation descriptors, and tool result plumbing.

## Design Decisions

1. **What counts as a Buddy-managed object?**

   **Status: Locked**

   **Locked decision:** Resources, generated artifacts, whiteboards, widgets,
   media presentations, question sets, and flashcard decks are all
   Buddy-managed objects once registered by Buddy. Raw workspace files remain
   raw workspace files until Buddy registers them.

2. **Where do managed objects live?**

   **Status: Locked**

   **Locked decision:** New managed object writes go under
   `.buddy/objects/v1/<kind>/<objectID>/`.

   **Locked API:**

   ```text
   .buddy/objects/v1/_index/
     objects.json

   .buddy/objects/v1/<kind>/<objectID>/
     object.json
     source/
     revisions/
     derived/
     state/
   ```

3. **What is the public handle?**

   **Status: Locked**

   **Locked decision:** `objectID` is the model-visible and frontend-visible
   managed-object identity. Aliases, paths, route params, and whiteboard session
   IDs are metadata or domain refs, not storage identity.

   **Locked ID contract:** `objectID` is a path-safe ULID using the same
   26-character Crockford alphabet contract as current `artifactID`. It is not
   an arbitrary non-empty string.

   **Locked model-facing rule:** `objectID` is the only object identifier the
   model should need to copy into generic presentation tools. `kind`,
   `revisionID`, `itemID`, and `viewID` are internal/UI/API reference fields.
   Tools may print those fields for debugging or hydration, but model-facing
   tool inputs should not require the model to assemble them.

4. **What stays kind-specific?**

   **Status: Locked**

   **Locked decision:** Managed object core is the evolution/replacement path
   for the current workspace artifact core, not a second parallel catalog.
   Object core owns identity, storage envelope, listing, load-error shaping,
   tombstones, shared object result schemas, and kind resolver registration.
   Kind modules own payload layout, creation/update behavior, render data,
   Library rows, Bench resolution, context reads, and domain actions.

   **Locked tool boundary:** `prepare_resource`, `whiteboard_create_view`,
   `render_mermaid`, `save_question_set`, and similar tools keep domain inputs.
   Buddy does not introduce one generic object database tool or one generic
   mega-tool. `present_media` and `bench_present` stay separate for this pass.

5. **How do source and presentation relate?**

   **Status: Locked**

   **Locked decision:** Buddy-managed objects explicitly separate source,
   revisions, derived outputs, mutable state, and presentation views. The agent
   can author ordinary files with normal file tools, but Buddy owns managed
   source roots and presentation identity.

6. **What is the HTML widget contract?**

   **Status: Locked**

   **Locked decision:** HTML authoring uses normal file tools. There is no
   model-facing `sourceHtml` argument and no
   `create_html_widget({ sourceHtml })` style API. The first presentation
   adopts the path into managed storage with move semantics and returns the
   authoritative `sourceRoot` and `editPath` for later edits.

   **Locked presentation semantics:** HTML widgets are live-current by default.
   `present_html_widget` does not snapshot every presentation. All transcript
   cards for the same widget show the current object runtime.

   **Locked source-of-truth rule:** After a successful `present_path`, the
   original path is consumed and is no longer authoritative. The model must edit
   only the returned managed `editPath` or files under the returned
   `sourceRoot`.

   **Future-only:** Explicit frozen snapshots can be added later as a separate
   product operation.

7. **How do tools report created or presented objects?**

   **Status: Locked**

   **Locked decision:** Object-producing or object-presenting tools return
   structured object metadata under `metadata.buddyObjectResult`. The
   model-visible output remains concise text, but transcript, Bench, Library,
   and backend flows consume the shared object result.

8. **How does Bench consume objects?**

   **Status: Locked**

   **Locked decision:** The public frontend/backend Bench target contract
   collapses to `workspace-file` targets and `object` targets. Object targets
   carry `BuddyObjectRef` plus `viewID` internally and resolve through the
   object-view registry. The model-facing `bench_present` tool does not expose
   that internal reference shape.

   **Locked frontend target:** `BenchTarget` is `workspace-file | object`.

   **Locked backend context target:** Published Bench context uses the same
   identity: workspace file path for files, `BuddyObjectRef + viewID` for
   managed objects.

   **Locked equality:** workspace-file targets compare by path and viewer;
   object targets compare by `kind`, `objectID`, `revisionID`, `itemID`, and
   `viewID`.

   **Locked model-facing focus rule:** generic Bench presentation opens the
   object's default Bench view from `object_id` only. Child item focus, pinned
   revision focus, and source/runtime view switches are UI/API concerns for this
   design, not model-facing `bench_present` inputs.

   **Locked mode preferences:** `resource` maps to `reading`, `whiteboard` maps
   to `whiteboard`, and artifact-like object kinds map to `artifact:<kind>`.

9. **How do live objects fit?**

   **Status: Locked**

   **Locked decision:** The whiteboard object-store scope implements current
   functionality only. Whiteboard is a live object kind with one current board
   per chat session. It does not introduce durable checkpoint history,
   `revisions/`, or restoreable snapshots.

   **Locked identity:** Buddy mints one whiteboard object per session on first
   whiteboard write. A session-to-objectID index resolves the current session
   whiteboard. The model does not pass a whiteboard object ID for the current
   board.

   **Locked listing rule:** Whiteboard objects may be present in the global
   object index for resolution, but they do not expose a Library view in this
   design. Library filters by `hasLibraryView` or `surfaces`, not by hard-coded
   kind exclusions.

   **Locked empty-board rule:** `present_whiteboard`, whiteboard UI routes, and
   `whiteboard_create_view` lazily create the current session whiteboard object
   when none exists yet. This preserves today's ability to open an empty
   whiteboard before the model has drawn on it. `whiteboard_read_context` does
   not mint objects or mutate boards; when no board exists, it returns the
   current no-board context.

   **Locked context-read side effect:** `whiteboard_read_context` may refresh
   and persist `modelContext` for the current board. That is part of today's
   stale-anchor protection: later continuation writes compare touched anchors
   against the model context the agent last inspected. This is not checkpointing
   and does not create or modify `currentBoard` or `previousBoard`.

   **Current whiteboard status quo:** Buddy is not checkpointing whiteboards
   today. The current store keeps one `currentBoard`, one `previousBoard`, and
   optional `modelContext` in `.buddy/whiteboards-v1/<sessionID>.json`.
   `checkpointId: "current"` is only a continuation handle. It is not a durable
   checkpoint, revision, or restore point.

10. **What object HTTP API is required?**

    **Status: Locked**

    **Locked decision:** Mirror the current Hono/OpenAPI shape: one shared
    object index/read/view/delete route family, plus kind-owned routes for
    source, runtime, raw bytes, resource rebuilds, learner edits, render
    reports, and share links. Do not introduce a generic object action endpoint.
    This route set is part of the frontend/backend contract because Buddy uses
    the generated OpenAPI SDK.

11. **What exact whiteboard payload layout is needed?**

    **Status: Locked**

   **Locked decision:** Store today's `WhiteboardSessionState` shape in the
   object store: `currentBoard`, `previousBoard`, and `modelContext`. Render
   reports remain attached to `currentBoard`, matching the current write and
   polling behavior. Do not add checkpoint history.

    **Locked empty-object status:** A lazily-created whiteboard object with no
    `currentBoard` is a live object with `status: "ready"` and an empty current
    view. It exists so Bench can open and whiteboard tools can stream work into
    a stable object target.

12. **Should explicit snapshots exist?**

    **Status: Locked**

    **Locked decision:** No automatic snapshots and no explicit snapshot API in
    this design. Snapshotting remains a future additive product operation.

13. **How do transcript cards render managed objects?**

    **Status: Locked**

    **Current status quo:** Transcript cards mostly render from tool metadata
    today. HTML widgets, media presentations, figures, Mermaid, and question
    sets each have feature-specific metadata contracts.

    **Locked decision:** Managed-object tool results should include typed
    `presentations[].data` for immediate transcript rendering, and the object
    view API should return the same typed payload for later hydration. This
    preserves the current no-waterfall UX while replacing ad hoc
    `metadata.artifact/value` contracts.

    **Locked hydration rule:** Transcript cards identify managed content by
    object ref and view. For live-current kinds such as HTML widgets, every card
    for the same object hydrates the current view, not the historical bytes from
    the original tool call.

14. **How are resource aliases resolved?**

    **Status: Locked**

    **Current status quo:** Resource alias is the storage folder key today:
    `.buddy/resources/<alias>/`. The durable `resourceID` is stored inside
    `.buddy-resource.json`. Resource tools and routes often accept alias or ID;
    for example `ingest_full_text` resolves `params.resource` by alias or ID.

    **Locked decision:** Object storage should use `objectID`, but resources
    should keep alias as mutable metadata and as a model/user-facing lookup key.
    Maintain a single alias-to-objectID index at
    `.buddy/objects/v1/resource/_index/aliases.json`, and let
    resource-specific tools accept `resourceKey` that resolves by objectID first
    and alias second. Generic object APIs should use objectID.

    **Locked alias-index rule:** Alias index entries are rebuildable from
    resource object manifests. Create, rename, delete, and rebuild operations
    write the index atomically, enforce unique normalized aliases, remove
    tombstoned resources, and recover from a missing or corrupt index by
    scanning manifests. If a key could be both a ULID-shaped alias and an
    objectID, objectID wins.

15. **How does resource prompting survive the storage move?**

    **Status: Locked**

    **Current status quo:** The prompt pipeline builds a resource inventory from
    `listRegisteredResources` in `learning/prompt/context.ts`. The resources
    runtime section tells the model that resources live under
    `resources/<alias>/` and that prepared text lives under
    `resources/<alias>/processed/`. The active reading resource prelude also
    reports resource `id`, `alias`, `status`, title, and path.

    **Locked decision:** Resource object implementation must update the prompt
    pipeline in the same implementation slice as storage. The model-facing
    inventory should continue to expose `alias`, `object_id`, `status`, title,
    reader path, full-text path, token estimates, and warnings, but it must no
    longer instruct the model to inspect old `resources/<alias>/processed/`
    paths after the resource pack moves under the object directory. If a
    resource prompt field names a path, that path must be produced by the
    resource object resolver and must match the new store.

    **Locked resolver boundary:** `prepare_resource`, resource-pack building,
    `ingest_full_text`, Bench resource presentation, prompt inventory,
    active-resource prelude, resource skills, and frontend reader routes must
    consume the same resource object resolver. No path should be hand-built from
    `resources/<alias>/processed/` after the cut.

16. **How does Buddy resolve object IDs without model-provided kind?**

    **Status: Locked**

    **Locked decision:** Object manifests and tombstones are durable truth.
    Object core owns a rebuildable central resolver cache at
    `.buddy/objects/v1/_index/objects.json`. It maps each `objectID` to the
    owning kind, status, title, and object directory for fast lookup. Generic
    presentation and lookup flows resolve `objectID` through this cache first;
    on a miss, stale entry, or corrupt cache, they scan manifests/tombstones,
    rebuild the cache, and retry. The model does not provide object kind to
    generic presentation tools.

17. **Who chooses the default Bench view for an object?**

    **Status: Locked**

    **Locked decision:** The kind resolver chooses the default Bench view.
    Manifests list available views; model-facing tools pass only `object_id`.
    `bench_present` resolves objectID to kind, asks the kind resolver for the
    default Bench view, and opens that view. View selection is not a
    model-facing tool input in this design.

18. **Can HTML widget adoption start from external paths?**

    **Status: Updated**

    **Deprecated locked decision:** `present_html_widget` accepts only workspace-relative
    source paths for adoption. Absolute paths, home-relative paths, and
    `file://` URLs are rejected for HTML widget adoption in this design. If the
    model needs to present external HTML, it must first create or move the
    source into the workspace using normal file tools, then call
    `present_html_widget`.

    **Update:** Restore the pre-cut `present_html_widget` source path behavior:
    `present_path` accepts workspace-relative paths, absolute paths, `file://`
    URLs, and `~/` home-relative paths when, and only when, they resolve inside
    the current workspace. The service canonicalizes all accepted inputs to a
    workspace-relative source ref before writing object metadata. Paths outside
    the workspace remain rejected.

    **Reason:** Dogfooding showed that the workspace-relative-only narrowing
    was a behavioral regression from the previous tool contract and made the
    model repeatedly fail with otherwise valid local file references. Restoring
    the old accepted input forms preserves the learner workflow while keeping
    the managed-object safety invariant: no external source is adopted unless
    its resolved path is contained by the workspace.

19. **How long do tombstones live?**

    **Status: Locked**

    **Locked decision:** Tombstones are retained indefinitely for this design.
    They are hidden from normal list results but read/resolve routes return a
    compact unavailable result for deleted object IDs. There is no pruning,
    reference tracking, or time-based retention policy in this design.

    **Locked media-retention rule:** Managed media-presentation objects are not
    implicitly pruned. If an external media file disappears, the object remains
    addressable and its item availability becomes `missing` or `unavailable`.

20. **Which lifecycle values are active?**

    **Status: Locked**

    **Locked decision:** Lifecycle is assigned by kind:

    | Lifecycle | Kinds |
    | --- | --- |
    | `live` | `html-widget`, `whiteboard` |
    | `imported` | `resource` |
    | `external-reference` | `media-presentation` |
    | `revisioned` | `mermaid`, `figure`, `freeform-figure`, `question-set`, `flashcard-deck` |

## Design Constraints

These are not separate product choices. They are constraints the decisions above
must satisfy.

### Breaking Cut

This design is a breaking cut. Existing artifact/resource/whiteboard storage,
old transcript cards, old Bench routes, old Library entries, and old tool
metadata are allowed to stop working.

The implementation should not build migration shims, dual writes, old/new
frontend parsers, route redirects, compatibility catalogs, or one-time import
paths merely to keep pre-cut data working.

This does not forbid reusing current artifact-core code. The desired end state
is one object core that carries the good artifact-core behavior forward, not old
artifact storage beside new object storage forever.

### Tool Schema Constraints

Model-facing tool inputs must use a root object schema, avoid root or nested
discriminated unions, prefer flat fields plus `action` and nullable values, keep
nesting shallow, and keep dynamic IDs/paths as data fields.

Output and backend read models may use discriminated unions. The no-union
constraint applies to model-facing tool inputs.

### View And Route Constraints

Routes are not persisted in `object.json`. Object views are resolved to routes
or Bench targets at runtime.

Persisted view descriptors store only route-free render params and semantic
view identity. URLs such as `runtimeUrl`, `sourceUrl`, media raw-byte URLs, and
routes are derived by the view resolver for `objects.view`, tool
`presentations[].data`, list responses, or transient frontend state. They are
never stored in `object.json`.

Derived route strings may exist in transient frontend state or the published
Bench context target, but they must be rebuildable from `BuddyObjectRef`,
`viewID`, directory, and current route definitions.

Raw workspace files remain valid non-object Bench targets. A raw file is not a
managed object unless Buddy registers it.

Missing/deleted object references render as a compact `Unavailable` state, not a
large explanation card.

### Artifact-Core Carry-Forward Constraints

The managed object core must preserve these properties from the current
workspace artifact system:

- path-safe ULID object IDs and path sanitization before filesystem access;
- staged directory writes where payload files are written before the manifest
  commit record becomes visible;
- update writes preserve unrelated sidecars and state by default;
- list operations are read-only and failure-isolated;
- invalid directory names and missing manifests are ignored;
- corrupt current-format manifests become load errors instead of breaking the
  whole list;
- orphan and staging-directory cleanup is explicit, not a side effect of list;
- generated OpenAPI SDK routes are the frontend/backend contract;
- raw-byte URLs are used only for actual byte delivery.

For create/update operations, the durable object record is committed before
rebuildable indexes are updated. If an index update fails, the object remains
discoverable by directory scan and the next read/list/resolve can rebuild the
index.

State preservation is a core invariant. Updating `object.json`, `revisions/`,
or `derived/` must not delete `state/attempts`, `state/reviews`, whiteboard live
state, or other kind-owned mutable state unless the kind explicitly performs a
state operation.

### Origin Constraints

Manifest origin must stay typed. Markdown-origin objects need `partID` and
`segmentIndex` so inline markdown-created Mermaid diagrams and future
markdown-created objects can dedupe and repair correctly.

### Source Path Constraints

Source refs must distinguish at least:

- `path`: canonical path used by Buddy for storage or serving;
- `displayPath`: human/model-facing path text;
- `workspacePath`: workspace-relative path when one exists;
- mutability;
- whether Buddy copied/adopted the bytes;
- current availability.

Workspace-relative paths, absolute paths, `file://` URLs, home-relative paths,
managed source paths, and Windows drive paths must normalize through shared
source-ref helpers before becoming object metadata.

### HTML Adoption Constraints

`present_html_widget` uses normal file authoring, then adopts source into
managed storage on first `present_path`. Adoption must be transactional:

1. validate the source file or folder and entry path;
2. create a staged object directory under `.buddy/objects/v1/html-widget/`;
3. move/adopt source into staged `source/`;
4. verify the managed source and write `object.json` only after adoption
   succeeds;
5. if adoption fails after the source has moved, restore the source to the
   validated original path before deleting staged managed files;
6. return `blocked` or `error` if Buddy cannot avoid two authoritative sources.

Rollback must never delete staged source files without first restoring the
original path. `original_path_status` values are `moved`, `restored`,
`missing`, and `error`.

Live-current HTML runtime routes must not use immutable cache semantics unless
the URL includes a cache-busting object version. Updating managed source must
invalidate or version the runtime view so all transcript cards for that object
show the current widget.

Folder adoption must preserve the entry path and serve relative assets from the
managed `source/` root. A widget folder is not flattened into one HTML file.
Runtime URLs include the current source version, for example
`/api/objects/html-widget/<objectID>/runtime?directory=<path>&version=<sourceVersion>`.
Cards store the object ref and view, then hydrate the current runtime URL.
`sourceVersion` is computed by the HTML widget service from managed source
state. It is not model-supplied. The locked algorithm is a deterministic
recursive source-tree hash over the managed `source/` directory, including file
paths and file bytes, excluding ignored transient files. It is computed at view
or runtime resolution so normal file-tool edits under `sourceRoot` update the
runtime URL without requiring the model to call a separate publish/checkpoint
tool. Versioned runtime URLs may use immutable caching. Unversioned live-current
URLs must not use immutable cache headers.

Hashing limits are part of the contract: the HTML widget service owns a fixed
ignore list for transient files such as `.DS_Store`, `.git/`, `node_modules/`,
`.turbo/`, `dist/`, build caches, and log files; it enforces max files, max
total bytes, and max directory depth before hashing. The computed value is
cached in `state/source-version.json` with file count, total bytes, and
mtime/size fingerprints. If hashing exceeds limits or fails, the view becomes
`stale` or `error` and Buddy must not serve that live runtime with immutable
cache headers.

Deprecated: HTML widget adoption accepts workspace-relative sources only.
Absolute paths, home-relative paths, and `file://` URLs are blocked for this
tool; the model must first place the source inside the workspace with normal
file tools.

Update: HTML widget adoption accepts workspace-relative paths, absolute paths,
`file://` URLs, and `~/` home-relative paths if they resolve inside the current
workspace. The accepted source ref written into `object.json` remains canonical
and workspace-relative. This keeps the source-ref normalization and containment
constraints while restoring the pre-cut tool behavior that models and users
already relied on.

## Storage Contract

### Folder Semantics

`object.json` is the shared commit record: identity, lifecycle, status, origin,
title, source refs, view descriptors, and typed per-kind summary. It must not
store frontend routes or untyped blobs.

`objectID` directory names are generated by Buddy and validated as ULIDs before
path construction. Object paths are never built from arbitrary model-visible
strings.

`.buddy/objects/v1/_index/objects.json` is a rebuildable objectID resolver
cache. It is not the durable source of truth. `object.json` manifests and
tombstones are durable truth. Object core updates the cache when creating,
deleting, or changing the status/title/kind record for an object, but all
generic presentation and read flows must tolerate missing, stale, or corrupt
cache contents by scanning manifests/tombstones, rebuilding the cache, and
retrying the lookup.

Object index shape:

```json
{
  "01KG1A0KH77HJ9QGAQ5QK0N4BD": {
    "kind": "html-widget",
    "status": "ready",
    "title": "Derivative Explorer",
    "objectPath": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD"
  },
  "01VJZXX7V44QGQGXHH2TH68F0P": {
    "kind": "resource",
    "status": "ready",
    "title": "Calculus",
    "objectPath": ".buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P"
  }
}
```

Index writes are atomic temp-file replacements. Mutations that change both a
manifest and an index entry are serialized per workspace. A failed index write
must not corrupt the object directory; the next lookup/list can rebuild the
cache from manifests and tombstones.

Serialization is a core object-store responsibility, not a kind concern.
`_index/objects.json` updates use a per-workspace async write queue or mutex
around the full read/modify/write cycle. Atomic temp-file replacement is still
required, but it is not sufficient by itself because concurrent writers can
otherwise read the same base index and lose one update. Kind modules must call
the shared object-index writer instead of writing the cache directly.

Create/update write order is:

1. write source/revision/derived/state payloads;
2. commit `object.json`;
3. update rebuildable secondary indexes.

Delete write order is:

1. write `<kind>/<objectID>/tombstone.json`;
2. remove or ignore `object.json`;
3. remove lookup-cache entries.

On an objectID cache miss, generic resolve scans kind directories for either
`object.json` or `tombstone.json`. A tombstone returns `unavailable`; no record
returns `not_found`.

If both `object.json` and `tombstone.json` exist for the same object directory,
the tombstone wins for read, list, resolve, and index rebuild. The manifest is
treated as stale sidecar data until explicit repair removes the tombstone.

If two non-tombstoned object manifests claim the same `objectID`, object core
emits deterministic load errors for all duplicates and does not present any of
them until repaired. A duplicate live object ID must never resolve by
filesystem iteration order.

`source/` contains Buddy-owned editable or adopted/imported source: resource
source, HTML widget source, Mermaid source if file-backed.

`revisions/` contains durable versions when a kind needs pinned history:
Mermaid render revisions, question-set payload revisions, and flashcard deck
payload revisions.

`derived/` contains rebuildable outputs: resource packs, thumbnails, render
reports, browser render records, and app builds.

`state/` contains mutable app, learner, or session state: whiteboard current
state, question attempts, flashcard scheduling/reviews, and availability caches.

### Kind Layouts

```text
.buddy/objects/v1/_index/
  objects.json

.buddy/objects/v1/resource/<objectID>/
  object.json
  source/<source-file>
  derived/pack/{00-resource.md,10-toc.md,20-full-text-est-tokens-*-chars-*.md,chunks/,pages/}

.buddy/objects/v1/html-widget/<objectID>/
  object.json
  source/index.html
  state/

.buddy/objects/v1/whiteboard/<objectID>/
  object.json
  state/session.json

.buddy/objects/v1/whiteboard/_index/
  sessions.json

.buddy/objects/v1/question-set/<objectID>/
  object.json
  revisions/<revisionID>/question-set.json
  state/attempts/*.json

.buddy/objects/v1/flashcard-deck/<objectID>/
  object.json
  revisions/<revisionID>/deck.json
  state/pending-review.json
  state/reviews/*.json
```

Media presentations may reference external bytes instead of copying them. The
object still owns item IDs, source refs, availability policy, and raw-byte
serving identity.

Resource pack filenames reuse the current resource-pack constants.

Resource aliases are mutable metadata backed by this alias index:

```text
.buddy/objects/v1/resource/_index/aliases.json
```

Example:

```json
{
  "calculus": "01VJZXX7V44QGQGXHH2TH68F0P",
  "ap-physics": "013ACFP40R1E33KRBK79BCPWYF"
}
```

The index maps normalized aliases to object IDs and is maintained by resource
create, rename, delete, and rebuild operations. Object APIs use object IDs.
Resource-specific tools may accept `resourceKey`, which resolves by objectID
first and alias second.

Alias index writes are atomic temp-file replacements. The index is rebuilt by
scanning resource manifests when it is missing, corrupt, or stale. Rename
validates the target alias before changing the manifest or index. Delete writes
a tombstone and removes the alias entry. Tombstoned and unavailable resources do
not claim aliases. ULID-shaped aliases are allowed only as aliases in metadata;
when resolving a `resourceKey`, an existing objectID match wins before alias
lookup.

Resource rename writes the alias field in `object.json` first, then updates
`aliases.json`. Because `aliases.json` is a rebuildable lookup cache, a failed
alias-index update is recovered by scanning manifests. Alias uniqueness is
validated before the manifest write, but concurrent rename/create races are
handled as deterministic load errors. If multiple live resources claim the same
normalized alias, objectID lookup still works, but alias lookup returns an
ambiguous-resource error until one alias is changed or one object is deleted.
The alias index must not silently choose newest-wins for duplicate aliases.

Examples:

```json
{
  "resourceKey": "01VJZXX7V44QGQGXHH2TH68F0P"
}
```

```json
{
  "resourceKey": "calculus"
}
```

`prepare_resource` should return both:

```text
Prepared resource calculus.
object_kind=resource
object_id=01VJZXX7V44QGQGXHH2TH68F0P
alias=calculus
```

Whiteboard session identity is also indexed, but the index is recoverable:

```text
.buddy/objects/v1/whiteboard/_index/sessions.json
```

Each whiteboard manifest stores the owning `sessionID` in its typed summary.
`sessions.json` maps session IDs to object IDs for fast current-board lookup.
If it is missing or stale, Buddy rebuilds it by scanning whiteboard manifests.
Writes to the current board and session index are serialized per session. If
two live whiteboard objects claim the same session, session resolution is
blocked with a deterministic load error until repaired. Buddy must not choose
newest-wins for whiteboard sessions, because learner edits, render reports, and
share links are session-scoped.

First whiteboard write order is:

1. write `<objectID>/state/session.json` with the session ID and current board;
2. commit `<objectID>/object.json`;
3. update `whiteboard/_index/sessions.json`;
4. update `_index/objects.json`.

Both indexes are caches. If either write fails, Buddy can recover by scanning
whiteboard manifests and `state/session.json`.

`present_whiteboard`, whiteboard UI routes, and `whiteboard_create_view` may
lazily create the current session whiteboard object. `whiteboard_read_context`
does not mint objects or mutate boards: when no board exists, it returns the
current no-board context. When a current board exists, it may persist refreshed
`modelContext` for stale-anchor validation.

### Resource Object Resolver Contract

Resource storage changes are only safe if every resource-aware feature asks one
resolver for identity, paths, and presentation data. The resolver is the
replacement for hand-building paths from alias folders.

Required resolver API shape:

```ts
type ResourceObjectKey = {
  directory: string
  resourceKey: string
}

type ResourceObjectResolved = {
  objectID: BuddyObjectID
  alias: string
  title: string | null
  status: BuddyObjectStatus
  managedSourceRef: BuddyObjectSourceRef
  originalSourceRef: BuddyObjectSourceRef | null
  objectPath: string
  entrypointPath: string | null
  tocPath: string | null
  packPath: string | null
  fullTextPath: string | null
  fullTextEstimatedTokens: number | null
  fullTextCharacters: number | null
  readerPath: string | null
  warnings: string[]
}

async function resolveResourceObjectByKey(
  input: ResourceObjectKey,
): Promise<ResourceObjectResolved>

async function resolveResourceObjectByID(input: {
  directory: string
  objectID: BuddyObjectID
}): Promise<ResourceObjectResolved>

async function listResolvedResourceObjects(input: {
  directory: string
}): Promise<ResourceObjectResolved[]>

async function resolveResourcePackPaths(input: {
  directory: string
  objectID: BuddyObjectID
}): Promise<{
  packRoot: string
  resourceMarkdownPath: string | null
  tocPath: string | null
  fullTextPath: string | null
}>
```

Resource pack writes must also go through an object-owned build contract. The
pack builder must not derive output roots from alias, source path, or
`resources/<alias>/processed`.

Required build API shape:

```ts
type ResourceObjectPackBuildInput = {
  directory: string
  objectID: BuddyObjectID
  generationID: string
  alias: string
  sourcePath: string
  derivedPackRoot: string
  metadataPath: string
  entrypointPath: string
  tocPath: string
  fullTextPath: string
  chunksDirPath: string
  pagesDirPath: string
}

async function buildResourceObjectPack(
  input: ResourceObjectPackBuildInput,
): Promise<ResourceObjectResolved>
```

`resource-packs/paths.ts`, resource-pack storage, full-text metadata lookup,
resource preparation, rebuild, prompt inventory, resource-reference expansion,
and `ingest_full_text` must consume this contract. `packKey` and alias-derived
processed roots do not survive as storage identity after the cut.

`ResourceObjectResolved.managedSourceRef` is the Buddy-managed payload source
ref and is the source of `managed_source=` in prompts/tool results.
`originalSourceRef` is nullable and exists for origin-first reader resolution
and user-facing provenance. Callers must not choose a source ref by scanning
`manifest.sourceRefs[]`; the resolver makes that selection.

`listResolvedResourceObjects` is the inventory source for resource prompt
sections, active-resource preludes, and resource-aware delegation prompts. It
may internally compose object listing plus `resolveResourceObjectByID`, but
callers must not rebuild `entrypoint`, `toc`, `pack`, `full_text`, reader, or
managed-source paths by joining folder names.

Resource preparation is an object lifecycle operation. Preparation, rebuild,
rename, and delete are coordinated by objectID, not alias. Each preparation run
receives a `generationID`, writes derived output into a staging directory, and
commits only if the resource manifest is still live and the generation is still
current. Delete writes the tombstone and invalidates active generations. Rename
updates manifest alias metadata and the alias index, but does not let an older
build commit under a stale alias. Rebuild either waits for the active build or
invalidates it before starting a new generation.

Resolution order for `resourceKey` is objectID first, then normalized alias. The
same resolver feeds:

- `prepare_resource` output;
- resource-pack creation and rebuild;
- `ingest_full_text`;
- `bench_present` with `present_resource`;
- active reading resource state;
- prompt inventory and active-resource prelude;
- resource-reference prompt parts/chips;
- resource-aware skills/subagent prompts; and
- frontend resource reader/API responses.

If a resource path appears in a prompt, tool result, route response, or Bench
target, it must come from this resolver.

Bench reader path resolution preserves the current origin-first behavior:

1. prefer the `role: "original"` source ref when it has a workspace-relative
   `.pdf` or `.epub` `workspacePath` that still exists inside the workspace;
2. otherwise try the managed source ref with the same extension and workspace
   containment checks;
3. otherwise return `readerPath: null` and emit `bench_reader=none`.

The resolver must not blindly open `.buddy/objects/.../source` as the reader
path when the original inspectable workspace resource is still available.
`present_resource` and the resource kind's default `present_object` Bench view
must both consume `ResourceObjectResolved.readerPath`; there must not be a
second, divergent Bench-reader guard.

Resource pack metadata and generated pack frontmatter use `object_id` as the
stable identity. Alias may appear as display metadata, for example
`alias_at_build`, but prompt inventory and active reader state should use the
live alias from the manifest/resolver. If alias is persisted into derived pack
metadata for display, alias rename must either rewrite that metadata or treat
the persisted value as historical display-only data.

### Resource Prompt Inventory Contract

Resource object implementation must update the model prompt inventory at the same
time as the filesystem layout. Today the resource prompt path flows through:

- `packages/buddy/src/learning/prompt/context.ts`, which calls
  `listRegisteredResources`, resolves full-text metadata, resolves Bench reader
  paths, and builds `PromptResource[]`;
- `packages/buddy/src/learning/prompt/runtime-context/resource-context/resources-section.ts`,
  which renders the resource inventory;
- `packages/buddy/src/learning/prompt/runtime-context/resource-context/about-section.t.md`,
  which currently tells the model to inspect `resources/<alias>/processed/`;
- `packages/buddy/src/learning/prompt/runtime-context/resource-context/active-resource-section.ts`,
  which renders the active reading resource; and
- resource-aware skill/tool prompts that mention `prepare_resource`,
  `ingest_full_text`, `resourceKey`, alias/objectID lookup, or prepared
  full-text paths.

The managed-object resource inventory should expose these model-facing fields:

```text
- object_id=<objectID> | alias=<alias> | name=<title-or-derived-name> | format=<format> | status=<status> | managed_source=<managedSourceRef.displayPath> | bench_reader=<reader-path-or-none> | pack=<derived-pack-root> | full_text=<full-text-path> | full_text_est_tokens=<tokens> | full_text_chars=<chars> | note=<warning>
```

Rules:

- `alias` stays the human/model-friendly lookup key.
- `object_id` is the stable Buddy-managed identity.
- `managed_source`, `bench_reader`, `pack`, and `full_text` must come from the
  resource object resolver. `managed_source` is Buddy-owned and read-only for
  the model; the model should use `pack` and `full_text` for reading and
  grounding. Pack and full-text paths point at the managed object store, for
  example
  `.buddy/objects/v1/resource/<objectID>/derived/pack/20-full-text-est-tokens-*-chars-*.md`.
- Active-resource prelude uses `object_id`, `alias`, `status`, title, and the
  resolver-produced reader/path fields. It must not keep emitting the old
  resource `id` as the primary identity after resource moves to object storage.
- Truncated inventory may still list aliases only, but the truncation hint must
  not tell the model to inspect old `resources/` paths.
- `ingest_full_text`, `bench_present` with `present_resource`, active-resource
  prelude, resource skills, and subagent delegation prompts must accept and
  describe the same `resourceKey` contract: objectID first, alias second.
- `packages/buddy/src/learning/features/reading/skills/reading/SKILL.md`,
  `prepare-resource.md`, and `ingest-full-text.md` must use the same
  `resourceKey`, `object_id`, `alias`, `pack`, and `full_text` terms. Do not
  leave "alias or ID" wording where "objectID or alias" is meant.

The resource about-section template must be replaced in the same cut:

```text
<about_resources>
- Resources are Buddy-managed parsed documents.
- Each inventory line lists `object_id=<stable-id>`, `alias=<lookup-key>`,
  `pack=<managed-pack-root>`, and, when available,
  `full_text=<managed-full-text-path>`.
- Use the exact `pack` and `full_text` paths from the inventory with normal file
  tools. Do not infer `resources/<alias>/` or `resources/<alias>/processed/`.
- When resource evidence is relevant, start from the resource's `pack` root:
  `00-resource.md`, then `10-toc.md` if present, then `chunks/`, `pages/`, and
  `20-full-text-est-tokens-*-chars-*.md`.
- Only resources with `bench_reader=<pdf-or-epub-path>` can be opened on Bench
  with `bench_present`; do not call `bench_present` for `bench_reader=none`.
</about_resources>
```

`prepare-resource.md` must also be rewritten to say the tool stores source and
derived output in Buddy-managed object storage, returns stable `object_id`,
mutable `alias`, status, warnings, `managed_source`, `pack`, and `full_text`,
and accepts normal resource source formats. It must not mention
`resources/<alias>/`.

`ingest-full-text.md` must use `resourceKey` terminology and say the tool
resolves objectID first and alias second, checks live context headroom, and
ingests only when enough post-ingestion reserve remains.

Resource reference prompt parts and composer/resource chips must resolve through
the same resource object resolver. They attach the resource entrypoint and TOC
from the managed `pack` path. They must not call an alias-rooted
`resolveResourceReference` that returns `resources/<alias>/processed` paths.

### Revision And State Semantics

Each kind must define whether a write creates a new object, a new revision, or a
state update:

| Kind | Default write semantics |
| --- | --- |
| `resource` | same object; source/derived rebuild updates object status and derived files |
| `html-widget` | same object; source edits update current runtime, no per-present snapshot |
| `mermaid` | new object by default; `repairOfObjectID` creates a new current revision on the same object |
| `figure` / `freeform-figure` | new object per model call in this pass; `revisions/` stores the initial payload, and future edit/repair tools may add revisions |
| `media-presentation` | same object for availability refresh; new presentation creates new object |
| `question-set` | new object per model call in this pass; attempts stay in `state/`, and future edit/UI flows may add revisions |
| `flashcard-deck` | new object per model call in this pass; scheduling/reviews stay in `state/`, and future edit/UI flows may add revisions |
| `whiteboard` | same object; writes update `state/session.json` with current board, previous board, model context, and current-board render report |

Repair lineage fields, current revision pointers, stale revision rendering, and
pinned revision reads are kind-specific, but the object core owns the reference
shape and path-safe revision directory helpers.

Revisioned kinds use this baseline payload layout:

| Kind | Revision payload | Current pointer |
| --- | --- | --- |
| `mermaid` | `revisions/<revisionID>/source.mmd`, `revisions/<revisionID>/render.json`, optional `derived/<revisionID>/` render cache | `object.json.currentRevisionID` |
| `figure` | `revisions/<revisionID>/spec.json`, `revisions/<revisionID>/render.json`, optional `derived/<revisionID>/figure.svg` | `object.json.currentRevisionID` |
| `freeform-figure` | `revisions/<revisionID>/source.svg`, `revisions/<revisionID>/render.json` | `object.json.currentRevisionID` |
| `question-set` | `revisions/<revisionID>/question-set.json` | `object.json.currentRevisionID` |
| `flashcard-deck` | `revisions/<revisionID>/deck.json` | `object.json.currentRevisionID` |

Only Mermaid has a model-reachable repair revision in this pass. Other
revisioned kinds use revision directories as payload storage with one current
revision. Do not add model-facing `repairOfObjectID` to figure, freeform
figure, question-set, or flashcard-deck until a concrete edit/repair workflow
is designed for that kind.

Repair or edit tools that do exist should accept semantic repair inputs such as
`repairOfObjectID`, not model-provided revision IDs. The kind service chooses
whether the repair supersedes the current revision, creates a new object, or
returns an error. Stale revision reads are API/UI concerns and may use
`revisionID`; they are not generic model-facing presentation inputs.

Mermaid repair is the only model-reachable revision repair in this pass. The
current artifact implementation creates a replacement artifact and marks the
old artifact's auto-repair state as succeeded. Managed Mermaid keeps the same
state machine but changes the target from artifact-to-artifact to
revision-to-revision:

- `repairOfObjectID` targets the current revision of that Mermaid object.
- The new revision record stores `supersedesRevisionID`, not
  `supersedesArtifactID`.
- Repair request records reference `{ objectID, revisionID }`.
- Auto-repair state is stored in the Mermaid object summary or current-revision
  metadata, with a `replacementRevisionID` when repair succeeds.
- Render records and derived render cache are revision-scoped under
  `revisions/<revisionID>/` and `derived/<revisionID>/`.

For model-initiated `present_object`, the backend resolves `object_id` to the
current concrete revision before comparing Bench targets. If a repair changes
`currentRevisionID`, the resolved Bench target is different and replaces the
old one. There is no model-facing "current revision" sentinel in this design.

Whiteboard is excluded from revision semantics in this design. Today's
whiteboard tool returns `checkpointId: "current"`, but that is a continuation
handle, not a durable checkpoint ID. Managed whiteboard tool results should use
`revisionID: null` and model-visible `continuation_handle=current`.
`whiteboard_create_view.metadata.checkpointId` is removed and replaced with
`metadata.continuationHandle`, matching `whiteboard_read_context`.

### Tombstones

Deleting a managed object should leave a compact tombstone when new transcript
or Bench references may still point at it.

Tombstone record:

```ts
type BuddyObjectTombstone = {
  version: 1
  kind: BuddyObjectKind
  objectID: BuddyObjectID
  deletedAt: string
  title?: string
  reason?: "user_deleted" | "source_unavailable"
}
```

List APIs hide tombstones by default, but read/resolve routes return
`status: "unavailable"` with enough data for compact unavailable transcript and
Bench states. Tombstones are retained indefinitely.

Tombstones live at `.buddy/objects/v1/<kind>/<objectID>/tombstone.json`; the
object directory is retained. Generic resolve distinguishes `unavailable` from
`not_found` by scanning for tombstones on cache miss. Explicit delete should
remove payload directories (`source/`, `revisions/`, `derived/`, and `state/`)
after the tombstone is committed, retaining only compact tombstone data needed
for transcript, Bench, and resolver unavailable states. If payload removal
fails, the tombstone still wins and the object remains unavailable.

Managed object cleanup must not silently prune transcript-addressable objects.
For media presentations, missing external files update per-item availability;
they do not delete the media-presentation object. If a user deletes a managed
object, Buddy writes a tombstone so old object refs still resolve to compact
`Unavailable`.

The current media-presentation `MAX_PRESENTED_MEDIA_ARTIFACTS` pruning behavior
must not be carried forward. Managed media-presentation objects are removed only
by explicit delete, which writes a tombstone. If Buddy later adds storage GC, it
must be an explicit object-level GC that preserves tombstone resolution, not
silent directory deletion during presentation creation.

### Core Versus Kind Modules

Object core owns:

- kind and ID validation;
- object path construction;
- the rebuildable central objectID resolver cache;
- staged writes for common records, including sidecar/state preservation;
- manifest parsing and load-error shaping;
- listing;
- deletion and tombstone semantics;
- source-ref and revision-ref helpers;
- shared object result schemas and validation helpers;
- kind resolver registration.

Object core should reuse or refactor the current artifact core rather than
reimplementing a second weaker version of path validation, staged writes,
listing, and load-error behavior.

Kind modules own:

- payload layout inside `source/`, `revisions/`, `derived/`, and `state/`;
- per-kind summary schema;
- creation, update, rebuild, repair, and delete behavior;
- inline render data;
- Library rows;
- object-to-Bench resolution;
- context reads;
- domain actions such as flashcard review, resource rebuild, or whiteboard edit.

## Shared Types

```ts
type BuddyObjectKind =
  | "resource"
  | "whiteboard"
  | "html-widget"
  | "mermaid"
  | "figure"
  | "freeform-figure"
  | "media-presentation"
  | "question-set"
  | "flashcard-deck"

type BuddyObjectID = string

type BuddyObjectRef = {
  kind: BuddyObjectKind
  objectID: BuddyObjectID
  revisionID: string | null
  itemID: string | null
}

type BuddyObjectLifecycle =
  | "revisioned"
  | "live"
  | "imported"
  | "external-reference"

type BuddyObjectStatus =
  | "ready"
  | "preparing"
  | "stale"
  | "unsupported"
  | "error"
  | "unavailable"

type BuddyObjectSourceRef = {
  role: "original" | "authoring" | "payload" | "external"
  path: string
  displayPath?: string
  workspacePath?: string | null
  mutable: boolean
  copied: boolean
  availability: "available" | "missing" | "error"
  exists?: boolean
  contentHash?: string
  sizeBytes?: number
  modifiedAt?: string
}

type BuddyObjectOrigin =
  | {
      kind: "tool"
      sessionID: string
      messageID: string
      callID: string
      subagent?: string
    }
  | {
      kind: "markdown"
      sessionID: string
      messageID: string
      partID: string
      segmentIndex: number
    }
  | {
      kind: "import"
      sourcePath: string
    }
  | {
      kind: "app"
      reason: string
    }

type BuddyObjectManifest = {
  version: 1
  kind: BuddyObjectKind
  objectID: BuddyObjectID
  title: string
  description?: string
  status: BuddyObjectStatus
  lifecycle: BuddyObjectLifecycle
  currentRevisionID?: string
  createdAt: string
  updatedAt: string
  origin?: BuddyObjectOrigin
  sourceRefs: BuddyObjectSourceRef[]
  views: BuddyObjectViewDescriptor[]
  summary: BuddyObjectSummary
}

type BuddyObjectSummary =
  | ResourceObjectSummary
  | WhiteboardObjectSummary
  | HtmlWidgetObjectSummary
  | MermaidObjectSummary
  | FigureObjectSummary
  | FreeformFigureObjectSummary
  | MediaPresentationObjectSummary
  | QuestionSetObjectSummary
  | FlashcardDeckObjectSummary
```

`summary` and inline view data are typed unions in backend/frontend models, not
`unknown`.

Lifecycle assignment:

| Lifecycle | Kinds |
| --- | --- |
| `live` | `html-widget`, `whiteboard` |
| `imported` | `resource` |
| `external-reference` | `media-presentation` |
| `revisioned` | `mermaid`, `figure`, `freeform-figure`, `question-set`, `flashcard-deck` |

`revisionID`, `itemID`, and `viewID` are internal reference fields:

- `revisionID` identifies a durable payload version for revisioned kinds such as
  question sets, flashcard decks, Mermaid diagrams, and figures.
- `itemID` identifies a child item inside an object, such as one file inside a
  media presentation.
- `viewID` identifies a renderer/view offered by the object, such as runtime,
  source, reader, or library row.

These fields are current with the frontend/API architecture, but they are not
model-facing presentation inputs. Generic tools should accept `object_id` and
let the object registry resolve kind, default view, current revision, item focus,
and route.

ObjectID-only lookup is a backend/model-facing convenience. Frontend object
targets, transcript metadata, object routes, and view responses carry
`BuddyObjectRef` with `kind` and `objectID` once the backend has resolved the
object. The frontend should not guess kind from objectID.

```ts
type BuddyObjectSurface =
  | "inline"
  | "bench"
  | "library"
  | "context"
  | "source"

type BuddyObjectViewDescriptor = {
  viewID: string
  label: string
  surfaces: BuddyObjectSurface[]
  availability: {
    status: "available" | "unavailable" | "stale" | "error"
    reason?: string
  }
  inline?: BuddyInlineViewDescriptor
  bench?: BuddyBenchViewDescriptor
  library?: BuddyLibraryViewDescriptor
  context?: BuddyContextViewDescriptor
  source?: BuddySourceViewDescriptor
}

type BuddyInlineRenderer =
  | "html-widget"
  | "media-gallery"
  | "mermaid"
  | "figure"
  | "question-set"
  | "flashcard-deck"

type BuddyInlineViewParams =
  | HtmlWidgetInlineViewParams
  | MediaGalleryInlineViewParams
  | MermaidInlineViewParams
  | FigureInlineViewParams
  | QuestionSetInlineViewParams
  | FlashcardDeckInlineViewParams

type BuddyInlineViewData =
  | HtmlWidgetInlineData
  | MediaGalleryInlineData
  | MermaidInlineData
  | FigureInlineData
  | QuestionSetInlineData
  | FlashcardDeckInlineData

type BuddySourceViewData = {
  renderer: "source"
  sourceRoot: string
  entryPath: string | null
  files: Array<{
    path: string
    kind: "file" | "directory"
    sizeBytes?: number
    modifiedAt?: string
  }>
  content: {
    path: string
    text: string
    language: string | null
  } | null
}

type BuddyContextViewData = {
  renderer: "context"
  content: string
  refs: Array<{
    label: string
    value: string
  }>
}

type BuddyLibraryViewData = {
  renderer: "library"
  title: string
  subtitle: string | null
  badge: string | null
  thumbnailUrl: string | null
  metrics: Array<{
    label: string
    value: string | number | boolean | null
  }>
}

type BuddyObjectViewData =
  | BuddyInlineViewData
  | BuddySourceViewData
  | BuddyContextViewData
  | BuddyLibraryViewData

type BuddyInlineViewDescriptor = {
  renderer: BuddyInlineRenderer
  params: BuddyInlineViewParams
}

type BuddyBenchViewDescriptor = {
  resolver: "object-view"
}

type BuddyLibraryViewDescriptor = {
  section:
    | "resources"
    | "widgets"
    | "media"
    | "diagrams"
    | "practice"
    | "flashcards"
}

type BuddyContextViewDescriptor = {
  toolID: string
  refs: Array<{
    label: string
    value: string
  }>
}

type BuddySourceViewDescriptor = {
  sourceRoot: string
  entryPath?: string
}

type BuddyObjectIndexItem = {
  kind: BuddyObjectKind
  objectID: BuddyObjectID
  title: string
  status: BuddyObjectStatus
  lifecycle: BuddyObjectLifecycle
  sourceRoot: string | null
  primaryViewID: string | null
  surfaces: BuddyObjectSurface[]
  hasLibraryView: boolean
  updatedAt: string
}

type BuddyObjectLoadError = {
  kind: BuddyObjectKind | null
  objectID: BuddyObjectID | null
  path: string
  message: string
}

type BuddyObjectReadResponse =
  | {
      status: "ready"
      manifest: BuddyObjectManifest
    }
  | {
      status: "unavailable"
      tombstone: BuddyObjectTombstone
    }
  | {
      status: "error"
      loadError: BuddyObjectLoadError
    }

type BuddyObjectViewResponse = {
  ref: BuddyObjectRef
  viewID: string
  title: string
  data: BuddyObjectViewData
}
```

`BuddyInlineViewDescriptor.params` is persisted in `object.json` and must be
route-free. `BuddyPresentationDescriptor.data` is an inline presentation
payload only. It may include derived URLs for the current workspace/session and
matches the inline view payload returned by `objects.view` for the same
`ref/viewID`. `context` and `source` surfaces are read through `objects.view`,
not emitted in tool-result presentation descriptors.

`BuddyBenchViewDescriptor` does not carry default mode. Bench mode remains
centralized in `resolveBenchSurfaceDefaults(target)`, using
`objectBenchModePreferenceKey(ref)` for object targets.

## Tool Result Contract

`createBuddyTool` validates tool inputs. It should gain one explicit,
non-generative output contract option for managed-object tools:

```ts
produces: {
  buddyObjectResult: true,
}
```

This option does not create objects, format model text, choose metadata, or hide
tool-specific fields. `runBuddyTool` validates it after `execute` returns
successfully, meaning a normal non-throwing tool return. If `execute` throws,
this validation does not run. For opted-in tools, every non-throwing return,
including `status: "blocked"` and `status: "error"` object results, must include
`metadata.buddyObjectResult` matching `BuddyObjectResultSchema`. Tools still
build their own return objects and keep transient metadata explicit.

The tool's visible `BuddyObjectResultSchema.parse(...)` before return remains
the primary authoring-time validation. The `produces` option is a defensive
runtime guardrail so an opted-in tool cannot accidentally return without the
shared metadata contract.

Implementation should add a TypeScript type or overload for opted-in tools so
object-producing tools get static pressure to return
`metadata.buddyObjectResult`.

Mixed-action tools such as `bench_present`, where `close` and raw file
presentation are valid non-object successes, should not set this option unless
`createBuddyTool` later supports action-conditional output contracts.

```ts
const nonEmptyString = z.string().trim().min(1)
const BuddyObjectIDSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/u)

const BuddyObjectKindSchema = z.enum([
  "resource",
  "whiteboard",
  "html-widget",
  "mermaid",
  "figure",
  "freeform-figure",
  "media-presentation",
  "question-set",
  "flashcard-deck",
])

const BenchAutoOpenPolicyIDSchema = z.enum([
  "whiteboard",
  "fullscreen-html-widget",
])

const BuddyObjectRefSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    revisionID: nonEmptyString.nullable(),
    itemID: nonEmptyString.nullable(),
  })
  .strict()

const BuddyPresentationDataSchema = z.discriminatedUnion("renderer", [
  HtmlWidgetInlineDataSchema,
  MediaGalleryInlineDataSchema,
  MermaidInlineDataSchema,
  FigureInlineDataSchema,
  QuestionSetInlineDataSchema,
  FlashcardDeckInlineDataSchema,
])

const BuddyPresentationDescriptorSchema = z
  .object({
    ref: BuddyObjectRefSchema,
    viewID: nonEmptyString,
    surface: z.enum(["inline", "bench", "library"]),
    data: BuddyPresentationDataSchema.nullable(),
    autoOpen: z
      .object({
        policyID: BenchAutoOpenPolicyIDSchema,
        eventKey: nonEmptyString,
      })
      .strict()
      .nullable(),
  })
  .strict()

const BuddyObjectSummaryBaseSchema = z
  .object({
    kind: BuddyObjectKindSchema,
    objectID: BuddyObjectIDSchema,
    title: nonEmptyString,
    status: z.enum([
      "ready",
      "preparing",
      "stale",
      "unsupported",
      "error",
      "unavailable",
    ]),
    lifecycle: z.enum([
      "revisioned",
      "live",
      "imported",
      "external-reference",
    ]),
    sourceRoot: nonEmptyString.nullable(),
  })
  .strict()

const BuddyObjectResultSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["ok", "blocked", "error"]),
    reason: nonEmptyString.nullable(),
    message: nonEmptyString,
    primaryRef: BuddyObjectRefSchema.nullable(),
    objects: z.array(BuddyObjectSummaryBaseSchema),
    presentations: z.array(BuddyPresentationDescriptorSchema),
  })
  .strict()

type BuddyObjectResult = z.infer<typeof BuddyObjectResultSchema>

type BuddyObjectToolMetadata = {
  buddyObjectResult: BuddyObjectResult
} & Record<string, unknown>
```

Kind-specific services may validate richer summaries before building
`BuddyObjectResult`. The shared result above is the minimum structured contract
transcript, Bench, Library, and backend object flows can rely on.

`presentations[]` has one entry per `(objectID, viewID, surface)` tuple. A
media presentation with multiple files emits one `media-gallery` presentation
whose `data.items[]` contains the media items; it does not emit one presentation
per media item.

Inline presentations require non-null typed `data` unless the frontend is
explicitly written to hydrate `ref + viewID` before rendering that card. Bench
and Library presentations may use `data: null` only when their consumer has an
explicit loading, hydration, unavailable, or error state. A null inline payload
must never render as a blank card.

`MediaGalleryInlineDataSchema` is the resolved gallery payload: renderer,
layout, and `items[]` with stable item IDs, source refs, availability, and
derived raw-byte URLs. Those raw-byte URLs are response data, not persisted
manifest data.

There is no shared tool-result envelope helper that creates the return value.
Object-producing tools return a normal `Tool.ExecuteResult` and keep title,
model-visible output, and transient metadata explicit in the tool. The hard
invariant is the visible parse before return:

```ts
const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
const primaryRef = buddyObjectResult.primaryRef

return {
  title: "Presented HTML widget",
  output: [
    buddyObjectResult.message,
    primaryRef ? `object_kind=${primaryRef.kind}` : null,
    primaryRef ? `object_id=${primaryRef.objectID}` : null,
    "source_root=.buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source",
    "edit_path=.buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source/index.html",
  ]
    .filter((line): line is string => line !== null)
    .join("\n"),
  metadata: {
    buddyObjectResult,
    sourceRoot,
    editPath,
  },
}
```

Additional metadata such as `sourceRoot`, `editPath`, `layoutDiagnostics`,
`warnings`, `waitUntilReady`, or `timedOut` stays tool-owned and explicit. It
must not become a second durable object contract. Durable object facts belong in
`object.json`, view descriptors, source refs, revision refs, derived files, or
kind-specific state.

`presentations[].data` is an inline typed view payload for immediate rendering
on the surface named by that presentation. It is not a second identity contract.
For `surface: "inline"`, it should match the inline renderer payload that
`objects.view` would return for that same object/view. Source, context, Library,
and Bench-only view payloads live in `objects.view`; they are not required in
tool-result presentation metadata.

Small pure helpers are allowed for schema parsing and canonical model-visible
reference lines, for example `formatBuddyObjectRefLines(ref)`. They must not own
the full return envelope, hide transient metadata, or decide tool-specific
instructions.

Feature-specific tool metadata must not become the durable contract for a
managed kind.

### Transcript Rendering Status Quo

Current transcript rendering is not one uniform pattern:

- `present_html_widget` returns `metadata.artifact = "PresentHtmlWidgetOutput"`
  and a full `metadata.value` payload with `artifactID`, viewport, runtime URL,
  source URL, source hash, source path, and warnings. The transcript card parses
  that payload and renders immediately.
- `present_media` returns `metadata.artifact = "PresentedMediaOutput"` and a
  full media payload with `artifactID`, layout, and item records. The transcript
  renders immediately, then refreshes item availability through SDK queries.
- `render_figure` and `render_freeform_figure` return metadata with
  `artifactID`, SVG URL, alt text, caption, and repair attempts. The transcript
  renders from that metadata.
- `render_mermaid` parses metadata for `artifactID` and source. It can render
  from the source, but it also hydrates persisted artifact data for repair,
  supersession, and render-cache flows.
- `save_question_set` may include a public question-set payload in metadata; if
  absent, the transcript fetches the artifact through the SDK.

Managed object tool results include typed
`presentations[].data` for immediate transcript render, and the object view API
returns the same payload for later hydration. That preserves the fast
current UX without making ad hoc `metadata.artifact/value` the durable contract.

Transcript dispatcher contract:

1. read `metadata.buddyObjectResult` and validate it with
   `BuddyObjectResultSchema`;
2. filter `presentations[]` to `surface: "inline"`;
3. if `presentation.data` is present, dispatch by `data.renderer` to the
   corresponding inline component (`html-widget`, `media-gallery`, `mermaid`,
   `figure`, `question-set`, or `flashcard-deck`);
4. if `presentation.data` is null, render a compact loading/unavailable state
   and hydrate by calling `objects.view` with `presentation.ref` and
   `presentation.viewID`;
5. never render a blank card for a null inline payload.

## Tool Contracts

These are the proposed model-facing tool contracts. `execute` bodies show the
return-boundary pattern only; the important parts are `id`, `description`,
`parameters`, model-visible `output`, and `metadata.buddyObjectResult`.

Every object-producing or object-presenting tool feeds this model-visible text
shape back to the model:

```text
<message>
object_id=<objectID>
object_kind=<kind>
```

Tools may append stable kind-specific instruction lines when the model needs
them for the next action. For example, HTML widget creation must include
`source_root`, `entry_path`, and `edit_path`.

For object-producing or object-presenting success paths, the structured
UI/backend payload includes:

```ts
metadata: {
  buddyObjectResult: BuddyObjectResult
  // plus explicit tool-owned transient fields when needed
}
```

Tools may return non-object results for actions that do not produce or present a
managed object, such as closing Bench or presenting a raw workspace file. An
approved external file is represented by a managed external-reference object so
the object route can resolve it without exposing an arbitrary-path endpoint.

Presentation descriptors never carry Bench mode. Frontend opening uses
`resolveBenchSurfaceDefaults` and `useOpenBench` with `mode: "policy"`.

### `bench_present`

`bench_present` is a mixed-action tool, so it has its own explicit metadata
contract in addition to `buddyObjectResult` on object paths:

```ts
type BenchPresentAction =
  | "present_object"
  | "present_file"
  | "present_resource"
  | "present_whiteboard"
  | "close"

type BenchPresentStatus =
  | "presented"
  | "already_presenting"
  | "closed"
  | "blocked"
  | "error"

type BenchPresentReason =
  | "presented_file"
  | "presented_resource"
  | "presented_object"
  | "presented_whiteboard"
  | "already_showing_target"
  | "closed_by_request"
  | "file_not_found"
  | "resource_not_found"
  | "object_not_found"
  | "object_unavailable"
  | "unsupported_target"
  | "blocked_by_unsaved_work"
  | "sync_error"

type BenchPresentToolMetadata = {
  benchAction: BenchPresentAction
  benchStatus: BenchPresentStatus
  reason: BenchPresentReason | null
  benchTarget: BenchTarget | null
  buddyObjectResult?: BuddyObjectResult
}

const BenchPresentToolMetadataSchema = z
  .object({
    benchAction: z.enum([
      "present_object",
      "present_file",
      "present_resource",
      "present_whiteboard",
      "close",
    ]),
    benchStatus: z.enum([
      "presented",
      "already_presenting",
      "closed",
      "blocked",
      "error",
    ]),
    reason: z
      .enum([
        "presented_file",
        "presented_resource",
        "presented_object",
        "presented_whiteboard",
        "already_showing_target",
        "closed_by_request",
        "file_not_found",
        "resource_not_found",
        "object_not_found",
        "object_unavailable",
        "unsupported_target",
        "blocked_by_unsaved_work",
        "sync_error",
      ])
      .nullable(),
    benchTarget: BenchTargetSchema.nullable(),
    buddyObjectResult: BuddyObjectResultSchema.optional(),
  })
  .strict()
```

The frontend reads `benchAction === "close"` and
`benchStatus === "closed"` as the close signal. `benchTarget: null` alone is
not enough, because blocked and errored presentations also have no target.

Implementation must define `BenchPresentToolMetadataSchema` and parse this
metadata on both sides of the runtime boundary. The backend parses before
returning the tool result; the frontend parses before dispatching open/close.
Do not recover Bench actions by JSON-parsing `state.output`.

```ts
const benchPresentTool = createBuddyTool({
  id: "bench_present",
  description: [
    "Present an existing stable target on Bench, or close Bench.",
    "",
    "Use this tool when the learner asks to focus an existing local file, prepared resource, existing Buddy object, or the current whiteboard on Bench. Files inside the workspace open directly. Paths that resolve outside it request external-folder permission and then open through a Bench-resolvable Buddy object.",
    "",
    "For Buddy objects, pass only objectID copied from a prior tool result. Do not pass object kind, revision id, item id, view id, routes, layout pixels, or user preferences.",
    "",
    "This tool does not author or modify content. For an approved external file it creates only a managed reference needed by Bench. Do not use it to render media inline, create an HTML widget, edit a whiteboard, choose layout pixels, change user preferences, or build routes.",
  ].join("\n"),
  parameters: z
    .object({
      action: z.enum([
        "present_object",
        "present_file",
        "present_resource",
        "present_whiteboard",
        "close",
      ]),
      path: nonEmptyString.nullable(),
      resourceKey: nonEmptyString.nullable(),
      objectID: BuddyObjectIDSchema.nullable(),
    })
    .strict()
    .superRefine(validateBenchPresentInput),
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Presenting on Bench",
      idle: "Presented on Bench",
    },
  },
  async execute(params, ctx) {
    const result = await presentManagedTargetOnBench({ params, ctx })
    if (result.objectResult === null) {
      return {
        title: "Bench Presentation",
        output: result.message,
        metadata: result.metadata,
      }
    }

    const buddyObjectResult = BuddyObjectResultSchema.parse(result.objectResult)
    return {
      title: "Bench Presentation",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        benchAction: result.benchAction,
        benchStatus: result.benchStatus,
        reason: result.reason,
        buddyObjectResult,
        benchTarget: result.benchTarget,
      },
    }
  },
})
```

This managed-objects contract supersedes the older `bench_present` schema in
`docs/features/bench-mode/design.md`. The old contract had no `present_object`
action. This one keeps the model-facing shape shallow but uses explicit
nullable fields instead of one overloaded `target` string.

Validation:

- `present_file` requires `path` as a workspace-relative or absolute local path;
  `file://` and `~/` forms are also accepted. `resourceKey` and `objectID` must
  be null.
- `present_resource` requires `resourceKey` as a resource alias or resource
  `object_id`; `path` and `objectID` must be null.
- `present_object` requires `objectID` copied from a prior tool
  result. The backend resolves kind, current/default revision, item focus,
  default Bench view, and route. `path` and `resourceKey` must be null.
- `present_whiteboard` and `close` require `path`, `resourceKey`, and
  `objectID` to be null.
- unsupported field combinations fail validation before routing.

Runtime mapping:

- `present_file`: canonicalize the local path before use. A file inside the
  workspace opens on the Markdown or file Bench surface. A path resolving
  outside the workspace first requires `external_directory`; after approval,
  Buddy stores the canonical path in a `media-presentation` external-reference
  object and opens its registered gallery view. Rejection must create no object
  and dispatch no Bench action. Raw `.html` and `.htm` files remain rejected;
  use `present_html_widget` so HTML source and rendered widget presentation stay
  under managed object control.
- `present_resource`: resolve `resourceKey` through the resource object
  resolver by objectID first and alias second, then open the reader surface.
- `present_object`: resolve `objectID` through the object registry, choose the
  object's default Bench view, and open that view.
- Every `BuddyObjectKind` must be registered by its owning feature and provide a
  default Bench view; startup/test coverage must fail when a kind is missing.
- When `present_object` resolves to a resource, the resource kind's default
  Bench view must enforce the same `bench_reader=none` guard as
  `present_resource`.
- `present_whiteboard`: lazily create or resolve the current session whiteboard
  object and open its current view.
- `close`: leave Bench without deleting content.

Model-call examples:

```json
{
  "action": "present_object",
  "path": null,
  "resourceKey": null,
  "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD"
}
```

```json
{
  "action": "present_file",
  "path": "notes/derivatives.md",
  "resourceKey": null,
  "objectID": null
}
```

An external file uses the same action and shape with an absolute `path`; Buddy
requests external-folder permission before creating its managed reference.

```json
{
  "action": "present_resource",
  "path": null,
  "resourceKey": "calculus",
  "objectID": null
}
```

```json
{
  "action": "present_whiteboard",
  "path": null,
  "resourceKey": null,
  "objectID": null
}
```

```json
{
  "action": "close",
  "path": null,
  "resourceKey": null,
  "objectID": null
}
```

Model-visible output example:

```text
Presented HTML widget on Bench.
object_id=01KG1A0KH77HJ9QGAQ5QK0N4BD
object_kind=html-widget
```

### `present_media`

```ts
const presentMediaTool = createBuddyTool({
  id: "present_media",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Present one or more existing local files inline in Buddy's conversation UI.",
    "",
    "Use this tool after creating or finding learner-facing files that should be shown in chat now.",
    "",
    "Do not use this tool for HTML widgets or app source; use present_html_widget for interactive HTML. Do not use this tool to focus Bench.",
  ].join("\n"),
  parameters: z
    .object({
      items: z
        .array(
          z
            .object({
              path: nonEmptyString.describe(
                "Local file path. May be workspace-relative, absolute, file://, or ~/ home-relative.",
              ),
            })
            .strict(),
        )
        .min(1)
        .max(12),
    })
    .strict(),
  async execute(params, ctx) {
    const result = await createMediaPresentationObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Presented media",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        itemCount: result.itemCount,
      },
    }
  },
})
```

Model-call examples:

```json
{
  "items": [
    {
      "path": "outputs/sine-wave.png"
    }
  ]
}
```

```json
{
  "items": [
    {
      "path": "outputs/front-view.png"
    },
    {
      "path": "outputs/side-view.png"
    }
  ]
}
```

Model-visible output example:

```text
Presented 2 media items.
object_kind=media-presentation
object_id=013ACFP40R1E33KRBK79BCPWYF
```

### `present_html_widget`

```ts
const HtmlWidgetViewportPresetSchema = z.enum([
  "compact_4_3",
  "standard_16_10",
  "wide_16_9",
  "square",
  "tall_mobile",
])

const presentHtmlWidgetTool = createBuddyTool({
  id: "present_html_widget",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Present an interactive HTML teaching widget inline in Buddy.",
    "",
    "Use this tool after writing or editing widget source with normal file tools and the learner should see the widget in chat.",
    "",
    "For the first presentation, use action=present_path with a local .html/.htm file or a folder plus entryPath. Buddy adopts that source into a managed html-widget object, consumes the original path, and returns the object ID, sourceRoot, and editPath for future edits.",
    "",
    "For later presentations, edit only files under the returned sourceRoot, then use action=present_object with the objectID. Buddy returns sourceRoot and editPath again. Do not edit or present the original path again. Do not pass HTML, CSS, or JavaScript source code as tool arguments.",
  ].join("\n"),
  parameters: z
    .object({
      action: z.enum(["present_path", "present_object"]),
      path: nonEmptyString.nullable(),
      objectID: BuddyObjectIDSchema.nullable(),
      entryPath: nonEmptyString.nullable(),
      title: nonEmptyString.nullable(),
      description: nonEmptyString.nullable(),
      viewportPreset: HtmlWidgetViewportPresetSchema.nullable(),
    })
    .strict()
    .superRefine(validatePresentHtmlWidgetInput),
  async execute(params, ctx) {
    const result = await presentHtmlWidgetObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Presented HTML widget",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        result.sourceRoot ? `source_root=${result.sourceRoot}` : null,
        result.entryPath ? `entry_path=${result.entryPath}` : null,
        result.editPath ? `edit_path=${result.editPath}` : null,
        result.originalPath ? `original_path=${result.originalPath}` : null,
        result.originalPathStatus
          ? `original_path_status=${result.originalPathStatus}`
          : null,
        result.editPath
          ? [
              "<buddy_system_reminder>",
              "The HTML widget source has been adopted into Buddy-managed storage. Edit only edit_path or files under source_root. Do not edit or present original_path again.",
              "</buddy_system_reminder>",
            ].join("\n")
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        sourceRoot: result.sourceRoot,
        entryPath: result.entryPath,
        editPath: result.editPath,
        originalPath: result.originalPath,
        originalPathStatus: result.originalPathStatus,
      },
    }
  },
})
```

Validation:

- `present_path` requires `path`, `title`, and `viewportPreset`; `objectID`
  must be null.
- If `path` is a folder, `entryPath` is required at runtime.
- A successful `present_path` adopts the source with move semantics. The
  original path is consumed. If Buddy cannot complete adoption without leaving a
  second authoritative source behind, the tool should return `blocked` or
  `error` rather than silently copying.
- `present_object` requires `objectID`; `path`, `entryPath`, `title`,
  `description`, and `viewportPreset` must be null.
- A successful `present_object` must re-read the object manifest and return
  `source_root`, `entry_path`, and `edit_path`. This is the model's recovery
  path after context loss; the model must not derive managed paths from
  `object_id`.

Model-call examples:

```json
{
  "action": "present_path",
  "path": "widgets/fraction-builder.html",
  "objectID": null,
  "entryPath": null,
  "title": "Fraction Builder",
  "description": "Drag pieces to compare equivalent fractions.",
  "viewportPreset": "standard_16_10"
}
```

```json
{
  "action": "present_path",
  "path": "widgets/projectile-sim",
  "objectID": null,
  "entryPath": "index.html",
  "title": "Projectile Motion Simulator",
  "description": null,
  "viewportPreset": "wide_16_9"
}
```

```json
{
  "action": "present_object",
  "path": null,
  "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD",
  "entryPath": null,
  "title": null,
  "description": null,
  "viewportPreset": null
}
```

Model-visible output example:

```text
Presented HTML widget Fraction Builder.
object_kind=html-widget
object_id=01KG1A0KH77HJ9QGAQ5QK0N4BD
source_root=.buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source
entry_path=index.html
edit_path=.buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source/index.html
original_path=widgets/fraction-builder.html
original_path_status=moved
<buddy_system_reminder>
The HTML widget source has been adopted into Buddy-managed storage. Edit only edit_path or files under source_root. Do not edit or present original_path again.
</buddy_system_reminder>
```

### `prepare_resource`

```ts
const prepareResourceTool = createBuddyTool({
  id: "prepare_resource",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Register and prepare a local learning resource for Buddy reading and context tools.",
    "",
    "Use this tool when the learner gives a PDF, EPUB, text file, or other supported source that Buddy should ingest as a reusable resource.",
    "",
    "The returned objectID is stable identity. The alias is mutable metadata for human-friendly lookup.",
  ].join("\n"),
  parameters: z
    .object({
      sourcePath: nonEmptyString,
      alias: nonEmptyString.optional(),
      waitUntilReady: z.boolean().default(true).optional(),
      maxWaitMs: z.number().int().min(500).max(600_000).optional(),
    })
    .strict(),
  async execute(params, ctx) {
    const result = await prepareResourceObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Prepared resource",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        result.alias ? `alias=${result.alias}` : null,
        result.status ? `status=${result.status}` : null,
        result.format ? `format=${result.format}` : null,
        result.managedSourcePath ? `managed_source=${result.managedSourcePath}` : null,
        result.benchReaderPath ? `bench_reader=${result.benchReaderPath}` : null,
        result.packPath ? `pack=${result.packPath}` : null,
        result.fullTextPath ? `full_text=${result.fullTextPath}` : null,
        result.warnings ? `warnings=${result.warnings.join(" | ") || "none"}` : null,
        result.timedOut ? "timed_out=true" : null,
        result.nextStep ? `next_step=${result.nextStep}` : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        alias: result.alias,
        status: result.status,
        format: result.format,
        managedSourcePath: result.managedSourcePath,
        benchReaderPath: result.benchReaderPath,
        packPath: result.packPath,
        fullTextPath: result.fullTextPath,
        warnings: result.warnings,
        nextStep: result.nextStep,
        waitUntilReady: params.waitUntilReady ?? true,
        maxWaitMs: params.maxWaitMs ?? null,
        timedOut: result.timedOut,
      },
    }
  },
})
```

Model-call example:

```json
{
  "sourcePath": "resources/calculus.pdf",
  "alias": "calculus",
  "waitUntilReady": true,
  "maxWaitMs": 120000
}
```

Model-visible output example:

```text
Prepared resource calculus.
object_kind=resource
object_id=01VJZXX7V44QGQGXHH2TH68F0P
alias=calculus
status=ready
format=pdf
managed_source=.buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P/source/calculus.pdf
bench_reader=resources/calculus.pdf
pack=.buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P/derived/pack
full_text=.buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P/derived/pack/20-full-text-est-tokens-42000-chars-180000.md
warnings=none
next_step=resource_ready_use_alias_or_object_id_in_followup_tools
```

### `ingest_full_text`

`ingest_full_text` reads an existing resource object. It does not set
`produces: { buddyObjectResult: true }`.

```ts
const ingestFullTextTool = createBuddyTool({
  id: "ingest_full_text",
  description: [
    "Ingest the prepared full text for one ready resource into the live model context.",
    "",
    "Use this tool only when the learner's task needs the whole prepared text in context and scoped reading is not enough.",
    "",
    "Pass resourceKey as the resource objectID or alias. Buddy resolves objectID first and alias second, then reads the resource object's managed full-text pack.",
  ].join("\n"),
  parameters: z
    .object({
      resourceKey: nonEmptyString,
    })
    .strict(),
  output: {
    maxLines: FULL_TEXT_TOOL_MAX_OUTPUT_LINES,
    maxBytes: FULL_TEXT_TOOL_MAX_OUTPUT_BYTES,
  },
  async execute(params, ctx) {
    await ctx.ask({
      permission: "ingest_full_text",
      patterns: [params.resourceKey],
      always: [params.resourceKey],
      metadata: {},
    })

    const resource = await resolveResourceObjectByKey({
      directory: ctx.directory,
      resourceKey: params.resourceKey,
    })
    const fullText = await readResourceObjectFullText({
      directory: ctx.directory,
      objectID: resource.objectID,
    })
    const budget = await resolveIngestFullTextBudgetOrThrow({
      messages: ctx.messages,
      extra: ctx.extra,
      fullTextTokens: fullText.estTokens,
      resourceAlias: resource.alias,
    })

    return {
      title: "Ingested resource full text",
      output: [
        `<resource_full_text_ingestion resource="${resource.alias}" completed="true">`,
        `object_kind=resource`,
        `object_id=${resource.objectID}`,
        `alias=${resource.alias}`,
        `full_text=${fullText.path}`,
        `full_text_est_tokens=${fullText.estTokens}`,
        `input_window=${budget.inputWindow}`,
        `context_window=${budget.contextWindow}`,
        `live_usage_estimate=${budget.liveUsageEstimate}`,
        `required_reserve_after_ingestion=${budget.reserve}`,
        `remaining_after_ingestion=${budget.remainingAfterIngestion}`,
        "<full_text>",
        fullText.content,
        "</full_text>",
        "<buddy_system_reminder>",
        "Now that you have the full text in context, answer from it directly. Keep the next response concise unless the learner explicitly asks for a long answer.",
        "</buddy_system_reminder>",
        "</resource_full_text_ingestion>",
      ].join("\n"),
      metadata: {
        objectID: resource.objectID,
        alias: resource.alias,
        fullTextPath: fullText.path,
        fullTextEstimatedTokens: fullText.estTokens,
        inputWindow: budget.inputWindow,
        contextWindow: budget.contextWindow,
        liveUsageEstimate: budget.liveUsageEstimate,
        reserve: budget.reserve,
        remainingAfterIngestion: budget.remainingAfterIngestion,
      },
    }
  },
})
```

The budget behavior from the current tool is part of the contract:

- resolve the active model and its input/context limits;
- estimate live message-history usage;
- compare full-text tokens against the required post-ingestion reserve;
- throw the detailed budget-failure message when the session is too full; and
- append the long-response caution system reminder on success.

Model-call example:

```json
{
  "resourceKey": "calculus"
}
```

Model-visible output shape:

```text
<resource_full_text_ingestion resource="calculus" completed="true">
object_kind=resource
object_id=01VJZXX7V44QGQGXHH2TH68F0P
alias=calculus
full_text=.buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P/derived/pack/20-full-text-est-tokens-42000-chars-180000.md
full_text_est_tokens=42000
input_window=200000
context_window=200000
live_usage_estimate=18000
required_reserve_after_ingestion=100000
remaining_after_ingestion=140000
<full_text>
...
</full_text>
<buddy_system_reminder>
Now that you have the full text in context, answer from it directly. Keep the next response concise unless the learner explicitly asks for a long answer.
</buddy_system_reminder>
</resource_full_text_ingestion>
```

### `whiteboard_create_view`

```ts
const createWhiteboardViewTool = createBuddyTool({
  id: "whiteboard_create_view",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Create or update the current whiteboard with Excalidraw elements.",
    "",
    "Use continue_current_board for the first board, normal appends, repairs, learner-preserving edits, and new zones beside or below existing work.",
    "",
    "Use destructively_replace_current_board only when the learner explicitly asks to clear, discard, overwrite, or replace the entire current board.",
    "",
    "Do not pass a whiteboard object ID. Buddy resolves the current session whiteboard.",
  ].join("\n"),
  parameters: z
    .object({
      boardAction: z.enum([
        "continue_current_board",
        "destructively_replace_current_board",
      ]),
      elements: z.string().trim().min(2),
    })
    .strict(),
  ui: {
    presentation: "hidden-summary",
    labels: {
      running: "Updating Whiteboard",
      idle: "Updated Whiteboard",
    },
  },
  async execute(params, ctx) {
    const result = await createOrUpdateCurrentWhiteboardObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Updated Whiteboard",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        result.continuationHandle
          ? `continuation_handle=${result.continuationHandle}`
          : null,
        "If you need to edit this board again, first call whiteboard_read_context for precise edits, then call whiteboard_create_view with boardAction='continue_current_board'.",
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        continuationHandle: result.continuationHandle,
        boardID: result.boardID,
        saved: result.saved,
        boardAction: params.boardAction,
        warnings: result.warnings,
        layoutDiagnostics: result.layoutDiagnostics,
      },
    }
  },
})
```

Model-call examples:

```json
{
  "boardAction": "continue_current_board",
  "elements": "[{\"type\":\"text\",\"id\":\"title\",\"x\":0,\"y\":0,\"text\":\"Slope as rate of change\"}]"
}
```

```json
{
  "boardAction": "destructively_replace_current_board",
  "elements": "[{\"type\":\"text\",\"id\":\"new-title\",\"x\":0,\"y\":0,\"text\":\"New board\"}]"
}
```

Model-visible output example:

```text
Whiteboard updated.
object_kind=whiteboard
object_id=01NKMQSG9DGMHV18PQX2E53JF5
continuation_handle=current
```

### `render_mermaid`

```ts
const renderMermaidTool = createBuddyTool({
  id: "render_mermaid",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Render a Mermaid diagram for the learner.",
    "",
    "Use this tool for Mermaid diagrams, including repairs of a previous Mermaid object.",
    "",
    "For a repair, copy repairOfObjectID from the failed or stale Mermaid object. Omit repair fields for a new diagram. Never invent IDs.",
  ].join("\n"),
  parameters: z
    .object({
      alt: nonEmptyString,
      caption: nonEmptyString.optional(),
      source: nonEmptyString,
      repairOfObjectID: BuddyObjectIDSchema.nullable(),
    })
    .strict(),
  async execute(params, ctx) {
    const result = await renderMermaidObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Rendered Mermaid diagram",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        renderStatus: result.renderStatus,
      },
    }
  },
})
```

Model-call examples:

```json
{
  "alt": "Flowchart of the photosynthesis process",
  "caption": "Photosynthesis converts light energy into stored chemical energy.",
  "source": "flowchart LR\n  light[Light] --> chloroplast\n  water[Water] --> chloroplast\n  co2[CO2] --> chloroplast\n  chloroplast --> glucose[Glucose]\n  chloroplast --> oxygen[Oxygen]",
  "repairOfObjectID": null
}
```

```json
{
  "alt": "Corrected flowchart of the photosynthesis process",
  "caption": null,
  "source": "flowchart LR\n  light[Light] --> chloroplast[Chloroplast]\n  water[Water] --> chloroplast\n  carbon[Carbon dioxide] --> chloroplast\n  chloroplast --> glucose[Glucose]\n  chloroplast --> oxygen[Oxygen]",
  "repairOfObjectID": "017GKR7280CQRRVAMFKF746FJT"
}
```

Model-visible output example:

```text
Rendered Mermaid diagram.
object_id=017GKR7280CQRRVAMFKF746FJT
object_kind=mermaid
```

### `render_figure`

```ts
const renderFigureTool = createBuddyTool({
  id: "render_figure",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Render a precise geometric figure for the learner.",
    "",
    "Use this tool when the figure is naturally described by Buddy's geometry figure spec.",
  ].join("\n"),
  parameters: z
    .object({
      caption: nonEmptyString.optional(),
      spec: GeometryFigureSpecSchema,
    })
    .strict(),
  async execute(params, ctx) {
    const result = await renderFigureObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Rendered figure",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        renderStatus: result.renderStatus,
      },
    }
  },
})
```

Model-call example:

```json
{
  "caption": "Right triangle with legs 3 and 4 and hypotenuse 5.",
  "spec": {
    "kind": "geometry.v1",
    "elements": []
  }
}
```

Model-visible output example:

```text
Rendered figure.
object_id=01ET53K0HJ3Y1EQAFH3XDBJ8YA
object_kind=figure
```

### `render_freeform_figure`

```ts
const renderFreeformFigureTool = createBuddyTool({
  id: "render_freeform_figure",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Render a freeform SVG-style teaching figure for the learner.",
    "",
    "Use this tool for figures that are not naturally represented by the geometry figure spec.",
  ].join("\n"),
  parameters: z
    .object({
      caption: nonEmptyString.optional(),
      source: nonEmptyString,
    })
    .strict(),
  async execute(params, ctx) {
    const result = await renderFreeformFigureObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Rendered freeform figure",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        renderStatus: result.renderStatus,
      },
    }
  },
})
```

Model-call example:

```json
{
  "caption": "A labeled cell membrane diagram.",
  "source": "<svg viewBox=\"0 0 600 300\"><text x=\"40\" y=\"40\">Cell membrane</text></svg>"
}
```

Model-visible output example:

```text
Rendered freeform figure.
object_id=01X19DEMKAEX5MPCVAK35C63XK
object_kind=freeform-figure
```

### `save_question_set`

```ts
const GroupTypeSchema = z.enum(["quiz", "practice", "assessment"])

const SavedMcqChoiceSchema = z
  .object({
    id: nonEmptyString,
    content: nonEmptyString,
    correct: z.boolean(),
    rationale: nonEmptyString.optional(),
    isNoneOfTheAbove: z.boolean().optional(),
  })
  .strict()

const SavedMcqPayloadSchema = z
  .object({
    multipleSelect: z.boolean(),
    countChoices: z.boolean().optional(),
    numCorrect: z.number().int().positive().optional(),
    hasNoneOfTheAbove: z.boolean().optional(),
    randomize: z.boolean().optional(),
    choices: z.array(SavedMcqChoiceSchema).min(2),
  })
  .strict()

const SavedQuestionSchema = z
  .object({
    id: nonEmptyString,
    type: z.literal("mcq"),
    prompt: nonEmptyString,
    goalIds: z.array(nonEmptyString).min(1),
    explanation: nonEmptyString.optional(),
    payload: SavedMcqPayloadSchema,
  })
  .strict()

const saveQuestionSetTool = createBuddyTool({
  id: "save_question_set",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Save a learner-facing question set as a reusable Buddy object.",
    "",
    "Use this tool after composing complete questions. Do not use it to present arbitrary media, flashcards, or whiteboard content.",
  ].join("\n"),
  parameters: z
    .object({
      groupType: GroupTypeSchema.optional(),
      title: nonEmptyString,
      instructions: nonEmptyString.optional(),
      contextSummary: nonEmptyString.optional(),
      questions: z.array(SavedQuestionSchema).min(1),
    })
    .strict(),
  async execute(params, ctx) {
    const result = await saveQuestionSetObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Saved question set",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        questionCount: result.questionCount,
      },
    }
  },
})
```

Model-call example:

```json
{
  "groupType": "practice",
  "title": "Derivative Rules Check",
  "instructions": "Choose the best answer.",
  "contextSummary": "Covers power rule and constant multiple rule.",
  "questions": [
    {
      "id": "q1",
      "type": "mcq",
      "prompt": "What is the derivative of x^3?",
      "goalIds": ["power-rule"],
      "explanation": "Use d/dx x^n = n x^(n-1).",
      "payload": {
        "multipleSelect": false,
        "choices": [
          {
            "id": "a",
            "content": "3x^2",
            "correct": true
          },
          {
            "id": "b",
            "content": "x^2",
            "correct": false
          }
        ]
      }
    }
  ]
}
```

Model-visible output example:

```text
Saved question set Derivative Rules Check.
object_id=010WYMDEA3W9G0W080A4PY190R
object_kind=question-set
```

### `save_flashcard_deck`

The current nested `fields` union should be flattened because nested unions are
bad tool inputs for models.

```ts
const SaveFlashcardNoteInputSchema = z
  .object({
    type: z.enum(["basic", "cloze"]),
    front: nonEmptyString.nullable(),
    back: nonEmptyString.nullable(),
    text: nonEmptyString.nullable(),
    tags: z.array(nonEmptyString).default([]),
    source: nonEmptyString.nullable(),
  })
  .strict()
  .superRefine(validateFlashcardNoteInput)

const saveFlashcardDeckTool = createBuddyTool({
  id: "save_flashcard_deck",
  produces: {
    buddyObjectResult: true,
  },
  description: [
    "Save a learner-facing flashcard deck as a reusable Buddy object.",
    "",
    "Use this tool after composing complete notes. Do not use it for quizzes, arbitrary media, or whiteboard content.",
  ].join("\n"),
  parameters: z
    .object({
      title: nonEmptyString,
      notes: z.array(SaveFlashcardNoteInputSchema).min(1),
      source: nonEmptyString.optional(),
    })
    .strict(),
  async execute(params, ctx) {
    const result = await saveFlashcardDeckObject({ params, ctx })
    const buddyObjectResult = BuddyObjectResultSchema.parse(result.buddyObjectResult)
    return {
      title: "Saved flashcard deck",
      output: [
        buddyObjectResult.message,
        buddyObjectResult.primaryRef
          ? `object_id=${buddyObjectResult.primaryRef.objectID}`
          : null,
        buddyObjectResult.primaryRef
          ? `object_kind=${buddyObjectResult.primaryRef.kind}`
          : null,
      ]
        .filter((line): line is string => line !== null)
        .join("\n"),
      metadata: {
        buddyObjectResult,
        noteCount: result.noteCount,
      },
    }
  },
})
```

Validation:

- `basic` notes require `front` and `back`; `text` must be null.
- `cloze` notes require `text`; `front` and `back` must be null.

Model-call examples:

```json
{
  "title": "Biology Basics",
  "notes": [
    {
      "type": "basic",
      "front": "What organelle produces ATP?",
      "back": "The mitochondrion.",
      "text": null,
      "tags": ["cell-biology"],
      "source": null
    }
  ],
  "source": "cell respiration lesson"
}
```

```json
{
  "title": "Calculus Cloze",
  "notes": [
    {
      "type": "cloze",
      "front": null,
      "back": null,
      "text": "The derivative of {{c1::x^n}} is {{c2::n x^(n-1)}}.",
      "tags": ["calculus"],
      "source": null
    }
  ],
  "source": null
}
```

Model-visible output example:

```text
Saved flashcard deck Biology Basics.
object_id=01G8BST0DFX4EFN4VNAY5Z65XH
object_kind=flashcard-deck
```

## Frontend And Bench Contract

Bench has two contracts that both need redesign: the frontend route target and
the backend published context target used by `bench_present` and
`bench_read_context`.

Frontend Bench targets collapse to raw workspace targets plus object targets:

```ts
type BenchTarget =
  | {
      type: "workspace-file"
      path: string
      viewer: "markdown" | "file"
    }
  | {
      type: "object"
      ref: BuddyObjectRef
      viewID: string
    }
```

```ts
const BenchTargetSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("workspace-file"),
      path: z.string().trim().min(1),
      viewer: z.enum(["markdown", "file"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("object"),
      ref: BuddyObjectRefSchema,
      viewID: z.string().trim().min(1),
    })
    .strict(),
])
```

Object targets resolve through the object-view registry. React renderers can
stay kind-specific internally.

When a model-facing tool provides only `object_id`, the backend resolves kind
through `.buddy/objects/v1/_index/objects.json`, loads the object manifest, and
asks the kind resolver for the default Bench view. The model does not choose
`viewID`, `revisionID`, `itemID`, route, or mode.

The backend published context target must make the same move. It should publish
object refs instead of artifact/resource/session-specific ID fields:

This managed-objects design supersedes the locked flat `BenchContextTarget`
shape in `docs/features/bench-mode/design.md` for the implementation cut that
introduces managed objects. The old `artifactID`, `resourceID`, and
artifact-kind required-field contracts are replaced by `BuddyObjectRef +
viewID`. Surface-specific context readers may still expose semantic refs in
`refs[]`, but the published target identity is object-based.
`bench_read_context` must update its output schema to use this target shape in
the same cut.

```ts
type PublishedBenchContextTarget =
  | {
      type: "workspace-file"
      title: string
      workspaceRoot: string
      path: string
      absolutePath: string
      route: string
      status: "ready" | "loading" | "dirty" | "error" | "unavailable"
    }
  | {
      type: "object"
      title: string
      workspaceRoot: string
      ref: BuddyObjectRef
      viewID: string
      route: string
      status: "ready" | "loading" | "dirty" | "error" | "unavailable"
    }
```

```ts
const PublishedWorkspaceFileBenchContextTargetSchema = z
  .object({
    type: z.literal("workspace-file"),
    title: z.string(),
    workspaceRoot: z.string(),
    path: z.string(),
    absolutePath: z.string(),
    route: z.string(),
    status: z.enum(["ready", "loading", "dirty", "error", "unavailable"]),
  })
  .strict()

const PublishedObjectBenchContextTargetSchema = z
  .object({
    type: z.literal("object"),
    title: z.string(),
    workspaceRoot: z.string(),
    ref: BuddyObjectRefSchema,
    viewID: z.string().trim().min(1),
    route: z.string(),
    status: z.enum(["ready", "loading", "dirty", "error", "unavailable"]),
  })
  .strict()

const PublishedBenchContextTargetSchema = z.discriminatedUnion("type", [
  PublishedWorkspaceFileBenchContextTargetSchema,
  PublishedObjectBenchContextTargetSchema,
])

const BenchReadContextOpenOutputSchema = z
  .object({
    status: z.literal("open"),
    target: PublishedBenchContextTargetSchema,
    metadata: z.array(z.string()),
    content: z.string(),
    refs: z.array(BenchContextRefSchema),
    hints: z.array(z.string()),
  })
  .strict()

const BenchReadContextClosedOutputSchema = z
  .object({
    status: z.literal("closed"),
  })
  .strict()

const BenchReadContextOutputSchema = z.union([
  BenchReadContextClosedOutputSchema,
  BenchReadContextOpenOutputSchema,
])
```

`route` is allowed in the published context because it is transient app state,
but equality and tool decisions must use `type`, `path`, `ref`, `viewID`, and
status. `route` must not be the durable identity.

Managed Bench context surface contracts replace the old flat target required
fields for this implementation cut:

| Surface | Target | Required identity | Required context behavior |
| --- | --- | --- | --- |
| Resource reader | `object` | `ref.kind = "resource"`, `viewID = "reader"` | metadata includes alias/status/current location when available; content is visible reading context; refs include the resource object and useful pack/full-text paths |
| Markdown editor | `workspace-file` | workspace-relative `path` | metadata includes save/dirty/error state; content is current editor text; refs include the workspace file |
| Generic file | `workspace-file` | workspace-relative `path` | metadata includes MIME/file facts; content is a plain statement or readable text when available; refs include the workspace file or URL |
| Whiteboard | `object` | `ref.kind = "whiteboard"`, `viewID = "current"` | metadata includes board status, boardID when present, element count, and continuation handle; content points to `whiteboard_read_context`; refs include that tool |
| HTML widget | `object` | `ref.kind = "html-widget"`, `viewID = "runtime"` | metadata includes viewport/source status; content is sanitized/runtime summary or source hint; refs include object source/view routes |
| Mermaid | `object` | `ref.kind = "mermaid"`, `viewID = "rendered"` | metadata includes render status and diagram type; content includes source or readable render summary; refs include object/source view |
| Figure/freeform figure | `object` | `ref.kind = "figure"` or `"freeform-figure"`, `viewID = "rendered"` | metadata includes render status and caption/alt text; content includes inspectable SVG/text summary; refs include object/source view |
| Media presentation | `object` | `ref.kind = "media-presentation"`, `viewID = "gallery"`, `itemID` when focused | metadata includes item count/focused item/availability; content summarizes visible media; refs include available file or URL refs |
| Question set | `object` | `ref.kind = "question-set"`, `viewID = "practice"` | metadata includes current question/progress/results visibility; content includes visible question state only; refs include object/context view |
| Flashcard deck | `object` | `ref.kind = "flashcard-deck"`, `viewID = "review"` | metadata includes current card/progress/review phase; content includes visible card state only; refs include object/context view |

For revisioned objects, equality uses the resolved concrete `revisionID`. A
model call with only `object_id` always resolves to the current revision before
comparison, so a repaired diagram or updated deck can replace the older Bench
target for the same object.

Bench mode preference keys derive from the target:

```ts
function workspaceFileBenchModePreferenceKey(
  target: Extract<BenchTarget, { type: "workspace-file" }>,
): BenchModePreferenceKey {
  return target.viewer
}

function objectBenchModePreferenceKey(ref: BuddyObjectRef): BenchModePreferenceKey {
  if (ref.kind === "resource") return "reading"
  if (ref.kind === "whiteboard") return "whiteboard"
  return `artifact:${ref.kind}`
}
```

`artifact:<kind>` is retained only as a preference namespace for artifact-like
object kinds. It is not storage identity. `reading` is produced only by
resource object targets. Raw workspace-file targets map to `markdown` or
`file` from their `viewer`.

`resolveBenchSurfaceDefaults(target)` remains the only authority for docked vs
floating defaults. Object view descriptors do not override it.

Kind-owned default Bench views are locked as behavior, not model input:

| Kind | Default Bench view |
| --- | --- |
| `resource` | `reader`, blocked with the same `bench_reader=none` result as `present_resource` when no PDF/EPUB reader path exists |
| `whiteboard` | `current` |
| `html-widget` | `runtime` |
| `mermaid` | `rendered` |
| `figure` | `rendered` |
| `freeform-figure` | `rendered` |
| `media-presentation` | `gallery` |
| `question-set` | `practice` |
| `flashcard-deck` | `review` |

```ts
type ResolveObjectViewToBenchTargetInput = {
  directory: string
  ref: BuddyObjectRef
  viewID: string
  sessionID?: string
}

type ReadObjectViewInput = {
  directory: string
  ref: BuddyObjectRef
  viewID: string
  revisionID?: string
  itemID?: string
}

type ResolveObjectViewToBenchTargetResult =
  | {
      status: "ready"
      target: BenchTarget
    }
  | {
      status: "blocked" | "unavailable" | "error"
      reason: string
      message: string
    }
```

Bench object route:

```text
/$directory/_bench/objects/$kind/$objectID?view=<viewID>&revision=<revisionID>&item=<itemID>
```

Managed Bench object views mount under the Bench route tree so they inherit the
Bench shell, open policy, chat layout, leave guard, and route adapter behavior.
Artifact routes do not need redirects. Non-Bench object detail routes are out
of scope for this design and must be specified separately if needed later.

Frontend cutover checklist:

- Generate and consume SDK types for shared object routes and kind-owned object
  routes before wiring UI code.
- Replace artifact/resource-specific transcript dispatch with a
  `buddyObjectResult` dispatcher that reads `presentations[].data`.
- Replace Bench target storage with `workspace-file | object` and make route
  strings derived state.
- Update Bench auto-open to read `presentations[].autoOpen` instead of
  feature-specific `metadata.artifact` tags.
- Wire the transcript-level object-result consumer to call `useOpenBench` for
  each non-null `presentations[].autoOpen`, using the resolved object Bench
  target and the provided `{ policyID, eventKey }`.
- Move Library rows to the object list/view contract.
- Move resource reader screens to object resource records and resolver-produced
  reader paths.
- Remove old artifact/resource metadata parsers in the same vertical cut; do
  not keep dual frontend parsers for pre-cut data.

Frontend auto-open consumer:

1. transcript tool renderers read
   `metadata.buddyObjectResult.presentations[].autoOpen`;
2. for each non-null value, the frontend resolves the presentation ref/view to
   a Bench object target;
3. it calls `useOpenBench` with `mode: "policy"` and
   `autoOpen: { policyID, eventKey }`;
4. `useOpenBench` and `resolveBenchOpenPolicy` remain responsible for
   suppression, same-target checks, and blocking replacement of a different
   active Bench target.

Running tools may also publish a start-of-tool auto-open candidate when current
UX depends on Bench opening before the tool finishes. Whiteboard uses this path
to preserve today's behavior where Bench opens while `whiteboard_create_view`
is running and the learner can watch the board appear.

For whiteboard, `whiteboard_create_view` must resolve or mint the session
whiteboard object before emitting this metadata and before long-running drawing
work. The start of `execute` should create the empty live object if needed,
commit `state/session.json` and `object.json`, update the session/object
indexes, then call `ctx.metadata({ benchAutoOpenCandidate })` with the object
Bench target. Permission prompts and drawing-program execution happen after the
stable object target exists.

```ts
type BenchAutoOpenCandidateMetadata = {
  benchAutoOpenCandidate: {
    policyID: BenchAutoOpenPolicyID
    eventKey: string
    target: BenchTarget
  }
}
```

The event key must be stable and dedup-safe. It is derived from deterministic
tool-part identity, not random data. Current locked formats:

- whiteboard create view: `whiteboard:<sessionID>:<messageID>:<callID-or-partID>`;
- fullscreen HTML widget: `fullscreen-html-widget:<objectID>`.

Completed tool results may emit the same auto-open event through
`presentations[].autoOpen`; the frontend dedupes by `{ policyID, eventKey }`.

Bench open dispatch from tool results has two paths:

1. Explicit `bench_present` results carry `BenchPresentToolMetadata`.
   `bench_present` presentations use `autoOpen: null`. If
   `benchAction === "close"` and `benchStatus === "closed"`, the frontend
   navigates back to chat after the leave guard. If `benchTarget` is non-null
   and the status is `presented` or `already_presenting`, the frontend calls
   `useOpenBench` with `autoOpen: null` and `{ origin: "agent" }`. Blocked and
   errored results do not open Bench.
2. Object-producing tools such as whiteboard and fullscreen HTML widgets carry
   `presentations[].autoOpen`. The frontend constructs
   `{ type: "object", ref: presentation.ref, viewID: presentation.viewID }` and
   calls `useOpenBench` with that auto-open identity.

The current `readLatestBenchPresentationAction` JSON-output parser is replaced
in this cut. It must read `metadata.benchTarget` and shared object metadata,
not parse a JSON string from `state.output`.

### Object HTTP API

The object API is locked as part of the frontend/backend contract because the
SDK is generated from Hono OpenAPI routes.

The API mirrors the existing Hono/OpenAPI style:

- shared index route like `artifacts.list`;
- shared object read/view routes for cross-kind object identity;
- kind-owned action/raw/source routes where behavior is domain-specific;
- generated SDK methods only, no manual frontend fetch helpers.

Shared routes:

```text
GET    /api/objects?directory=<path>&kind=<optional-kind>
       operationId: objects.list
       response: { objects: BuddyObjectIndexItem[], loadErrors: BuddyObjectLoadError[] }

GET    /api/objects/:kind/:objectID?directory=<path>
       operationId: objects.read
       response: BuddyObjectReadResponse

GET    /api/objects/:kind/:objectID/views/:viewID?directory=<path>&revisionID=<optional>&itemID=<optional>
       operationId: objects.view
       response: BuddyObjectViewResponse

DELETE /api/objects/:kind/:objectID?directory=<path>
       operationId: objects.delete
       response: { ok: true }
```

Shared HTTP routes are kindful because SDK callers and routes should already
hold a resolved `BuddyObjectRef`. ObjectID-only resolution is for backend
tools, model-facing tool input, and explicit resolver endpoints/actions. The
frontend must not guess kind from `objectID`; it should use the kind returned
in tool metadata, object refs, or resolver responses.

The list route returns `{ objects, loadErrors }`, matching the artifact index
behavior. The read route returns a typed envelope so deleted objects can resolve
to compact `unavailable` tombstones instead of throwing or pretending to be
manifests. A never-created object ID returns `not_found`; tombstoned object IDs
return `status: "unavailable"`. View routes return typed view payloads; inline
view payloads match the shape used by `presentations[].data`.

Example list request:

```text
GET /api/objects?directory=/Users/me/Learning&kind=html-widget
```

Example list response:

```json
{
  "objects": [
    {
      "kind": "html-widget",
      "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD",
      "title": "Derivative Explorer",
      "status": "ready",
      "lifecycle": "live",
      "sourceRoot": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source",
      "primaryViewID": "runtime",
      "surfaces": ["inline", "bench", "source"],
      "hasLibraryView": false,
      "updatedAt": "2026-06-18T09:30:00.000Z"
    }
  ],
  "loadErrors": []
}
```

Example manifest request:

```text
GET /api/objects/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD?directory=/Users/me/Learning
```

Example manifest response:

```json
{
  "version": 1,
  "kind": "html-widget",
  "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD",
  "title": "Derivative Explorer",
  "status": "ready",
  "lifecycle": "live",
  "createdAt": "2026-06-18T09:30:00.000Z",
  "updatedAt": "2026-06-18T09:30:00.000Z",
  "sourceRefs": [
    {
      "role": "authoring",
      "path": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source/index.html",
      "displayPath": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source/index.html",
      "workspacePath": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source/index.html",
      "mutable": true,
      "copied": false,
      "availability": "available"
    }
  ],
  "views": [
    {
      "viewID": "runtime",
      "label": "Widget",
      "surfaces": ["inline", "bench", "source"],
      "availability": {
        "status": "available"
      },
      "inline": {
        "renderer": "html-widget",
        "params": {
          "renderer": "html-widget",
          "entryPath": "index.html",
          "viewportPreset": "desktop"
        }
      },
      "bench": {
        "resolver": "object-view"
      },
      "source": {
        "sourceRoot": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source",
        "entryPath": "index.html"
      }
    }
  ],
  "summary": {
    "kind": "html-widget",
    "entryPath": "index.html",
    "viewportPreset": "desktop"
  }
}
```

Example view request:

```text
GET /api/objects/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/views/runtime?directory=/Users/me/Learning
```

Example view response:

```json
{
  "ref": {
    "kind": "html-widget",
    "objectID": "01KG1A0KH77HJ9QGAQ5QK0N4BD",
    "revisionID": null,
    "itemID": null
  },
  "viewID": "runtime",
  "title": "Derivative Explorer",
  "data": {
    "renderer": "html-widget",
    "runtimeUrl": "/api/objects/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/runtime?directory=/Users/me/Learning&version=01KG1A3WZKJ5EV9WRVZ8SYPQ4E",
    "sourceRoot": ".buddy/objects/v1/html-widget/01KG1A0KH77HJ9QGAQ5QK0N4BD/source",
    "entryPath": "index.html",
    "sourceVersion": "01KG1A3WZKJ5EV9WRVZ8SYPQ4E",
    "viewportPreset": "desktop"
  }
}
```

Kind-owned routes keep the current domain shape instead of forcing everything
through generic object actions:

```text
GET  /api/objects/html-widget/:objectID/source?directory=<path>&path=<source-relative-path>
     operationId: objectHtmlWidget.source
     response: { objectID: string, path: string, source: string }

GET  /api/objects/html-widget/:objectID/runtime?directory=<path>&version=<sourceVersion>
     operationId: objectHtmlWidget.runtime
     response: text/html

GET  /api/objects/media-presentation/:objectID/items/:itemID/availability?directory=<path>
     operationId: objectMediaPresentation.availability
     response: { status: "available" | "missing" | "error", message: string | null }

GET  /api/objects/media-presentation/:objectID/raw/:itemID?directory=<path>&fileName=<optional>
HEAD /api/objects/media-presentation/:objectID/raw/:itemID?directory=<path>&fileName=<optional>
     operationId: objectMediaPresentation.raw
     response: application/octet-stream

POST /api/objects/resource/:objectID/rebuild?directory=<path>
     operationId: objectResource.rebuild
     response: ResourceObjectRecord

GET  /api/objects/whiteboard/session/:sessionID?directory=<path>
     operationId: objectWhiteboard.readSession
     response: WhiteboardSessionRead

PUT  /api/objects/whiteboard/session/:sessionID?directory=<path>
     operationId: objectWhiteboard.saveLearnerEdit
     body: WhiteboardLearnerEditRequest
     response: WhiteboardSessionRead

PUT  /api/objects/whiteboard/session/:sessionID/render-report?directory=<path>
     operationId: objectWhiteboard.renderReport.save
     body: WhiteboardRenderReport
     response: { saved: boolean }

POST /api/objects/whiteboard/session/:sessionID/share?directory=<path>
     operationId: objectWhiteboard.share.create
     body: WhiteboardShareRequest
     response: WhiteboardShareResponse
```

This is intentionally close to current `artifacts`, `html-widget`,
`media-presentation`, `resource`, and `whiteboards` routes. The difference is
identity and storage: managed object routes use `objectID` and object
manifests; kind-owned actions still own domain behavior.

Resource route contract based on current `/api/resource`:

```text
GET    /api/objects/resource?directory=<path>
       operationId: objectResource.list
       response: { resources: ResourceObjectRecord[] }

POST   /api/objects/resource?directory=<path>
       operationId: objectResource.create
       body: { sourcePath: string, alias?: string }
       response: ResourceObjectRecord

PATCH  /api/objects/resource/:objectID?directory=<path>
       operationId: objectResource.rename
       body: { alias: string }
       response: ResourceObjectRecord

PATCH  /api/objects/resource/by-key/:resourceKey?directory=<path>
       operationId: objectResource.renameByKey
       body: { alias: string }
       response: ResourceObjectRecord

POST   /api/objects/resource/:objectID/rebuild?directory=<path>
       operationId: objectResource.rebuild
       response: ResourceObjectRecord

POST   /api/objects/resource/by-key/:resourceKey/rebuild?directory=<path>
       operationId: objectResource.rebuildByKey
       response: ResourceObjectRecord

DELETE /api/objects/resource/:objectID?directory=<path>
       operationId: objectResource.delete
       response: { ok: true }

DELETE /api/objects/resource/by-key/:resourceKey?directory=<path>
       operationId: objectResource.deleteByKey
       response: { ok: true }
```

Generic cross-kind object routes and resource objectID routes use `objectID`
only. Alias-or-objectID convenience routes live under `by-key` so they do not
conflict with `/api/objects/:kind/:objectID`. `resourceKey` resolves objectID
first and alias second.

Example create resource request:

```json
{
  "sourcePath": "resources/calculus.pdf",
  "alias": "calculus"
}
```

Example create resource response:

```json
{
  "objectID": "01VJZXX7V44QGQGXHH2TH68F0P",
  "alias": "calculus",
  "sourceRelpath": ".buddy/objects/v1/resource/01VJZXX7V44QGQGXHH2TH68F0P/source/calculus.pdf",
  "format": "pdf",
  "status": "preparing",
  "warnings": [],
  "preparedAt": null,
  "title": null,
  "author": null
}
```

Example rebuild by alias:

```text
POST /api/objects/resource/by-key/calculus/rebuild?directory=/Users/me/Learning
```

Example rebuild by objectID:

```text
POST /api/objects/resource/01VJZXX7V44QGQGXHH2TH68F0P/rebuild?directory=/Users/me/Learning
```

Whiteboard route examples based on current `/api/whiteboards/session/:sessionID`:

```text
GET /api/objects/whiteboard/session/ses_123?directory=/Users/me/Learning
```

```json
{
  "currentBoard": {
    "boardID": "01Y9ATQADNQF6H8GQ4VRF69J7X",
    "origin": "agent",
    "updatedAt": "2026-06-18T09:30:00.000Z",
    "elements": []
  }
}
```

Learner edit request:

```json
{
  "baseBoardID": "01Y9ATQADNQF6H8GQ4VRF69J7X",
  "elements": []
}
```

Render report request:

```json
{
  "boardID": "01Y9ATQADNQF6H8GQ4VRF69J7X",
  "viewport": {
    "x": 0,
    "y": 0,
    "width": 1200,
    "height": 800
  },
  "canvas": {
    "width": 1200,
    "height": 800,
    "zoom": 1
  },
  "contentBounds": null,
  "elements": []
}
```

Render report response:

```json
{
  "saved": true
}
```

## Object Kind Registry

```ts
type BuddyObjectKindDefinition<Summary extends BuddyObjectSummary> = {
  kind: BuddyObjectKind
  manifestSchema: z.ZodType<BuddyObjectManifest & { summary: Summary }>
  list(directory: string): Promise<{
    objects: BuddyObjectIndexItem[]
    loadErrors: BuddyObjectLoadError[]
  }>
  readManifest(
    directory: string,
    ref: BuddyObjectRef,
  ): Promise<BuddyObjectManifest & { summary: Summary }>
  read(directory: string, ref: BuddyObjectRef): Promise<Summary>
  readView(input: ReadObjectViewInput): Promise<BuddyObjectViewResponse>
  resolveBenchView(input: ResolveObjectViewToBenchTargetInput): Promise<ResolveObjectViewToBenchTargetResult>
  readContext?(input: {
    directory: string
    ref: BuddyObjectRef
    viewID: string
  }): Promise<string>
  delete?(input: {
    directory: string
    ref: BuddyObjectRef
  }): Promise<void>
}
```

The registry is a backend boundary. The frontend consumes typed API responses;
it does not import backend resolver code.

The shared `objects.read` route calls `readManifest`; kind-owned routes may call
`read` when they only need the typed summary.
The shared `objects.view` route calls `readView`; Bench opening calls
`resolveBenchView`. Do not overload Bench target resolution with API hydration.

## Proof Obligations

The architecture is not sound until it proves these flows end to end:

- **Resources:** import source, derived packs, async preparation, stale
  detection, alias-to-objectID resolution, rebuild, delete/unavailable, reader
  view, full-text/context reads, prompt inventory, active-resource prelude,
  resource-reference prompt parts/chips, resource-aware skill prompts, Library
  rows.
- **HTML widgets:** Buddy-owned source roots, normal file authoring,
  source-vs-presentation separation, runtime output, and live transcript cards.
- **Media presentations:** external refs, stable item IDs, per-item
  availability, raw-byte serving, inline gallery, optional Bench focus without
  copying bytes, and no silent pruning without tombstones.
- **Whiteboard:** session-bound live current board, previous board for context,
  learner edits with stale-base protection, frontend render report, share link,
  current-view Bench presentation, precise context read, and no checkpoint
  history.
- **Flashcards or question sets:** durable payload plus learner state under the
  object directory. Flashcards are the stronger proof because scheduling state
  is more stateful.

Mermaid and figures are useful implementation candidates, but they are too easy
to validate the architecture by themselves because they are mostly static render
outputs.

## Relevant Current Files

- `packages/buddy/src/artifacts/`
- `packages/buddy/src/resources/resource-registry-service.ts`
- `packages/buddy/src/resource-packs/`
- `packages/buddy/src/learning/prompt/context.ts`
- `packages/buddy/src/learning/prompt/workspace-file-references.ts`
- `packages/buddy/src/learning/prompt/runtime-context/resource-context/`
- `packages/buddy/src/learning/runtime/create-buddy-tool.ts`
- `packages/buddy/src/learning/features/bench/tools/present.ts`
- `packages/buddy/src/learning/features/media-presentations/`
- `packages/buddy/src/learning/features/media-presentations/service/file-media.ts`
- `packages/buddy/src/learning/features/html-widgets/`
- `packages/buddy/src/learning/features/diagrams/tools/render-mermaid.ts`
- `packages/buddy/src/learning/features/figure-rendering/`
- `packages/buddy/src/learning/features/question-sets/`
- `packages/buddy/src/learning/features/flashcards/`
- `packages/buddy/src/learning/features/reading/tools/prepare-resource.ts`
- `packages/buddy/src/learning/features/reading/tools/prepare-resource.md`
- `packages/buddy/src/learning/features/reading/tools/ingest-full-text.ts`
- `packages/buddy/src/learning/features/reading/tools/ingest-full-text.md`
- `packages/buddy/src/learning/features/reading/skills/reading/SKILL.md`
- `packages/buddy/src/learning/features/whiteboard/`
- `packages/buddy/src/learning/features/whiteboard/tools/read-context.ts`
- `packages/buddy/src/routes/whiteboards.ts`
- `packages/web/src/lib/bench-targets.ts`
- `packages/web/src/lib/bench-route-adapter.ts`
- `packages/web/src/lib/html-widgets.ts`
- `packages/web/src/lib/presented-media.ts`
