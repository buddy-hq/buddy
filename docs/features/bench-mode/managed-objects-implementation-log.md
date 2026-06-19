# Managed Objects Implementation Log

This log records implementation decisions for
`docs/features/bench-mode/managed-objects-design.md`.

## Current Status

- Implementation verification in progress before final read-only audit/review.
- Latest focused grep pass over changed files found only intentional negative
  prompt warnings telling the model not to infer
  `resources/<alias>/processed/`. These hits match the managed-object resource
  prompt replacement and are not legacy contract preservation.
- Latest Mermaid checkpoint: focused Mermaid tests passed, Buddy package raw
  typecheck passed, and the changed Mermaid files had no old-vocabulary grep
  hits.
- Latest figure/freeform checkpoint: focused figure and freeform figure tests
  passed, Buddy package raw typecheck passed, and the changed figure/freeform
  files had no old-vocabulary grep hits.
- Latest Bench/whiteboard checkpoint: focused Bench presenter and whiteboard
  service tests passed, Buddy package raw typecheck passed, and changed
  managed-object Bench/whiteboard files had no old-vocabulary grep hits. The
  only focused grep hit in this checkpoint is the pre-existing OpenCode
  compatibility API description in `packages/buddy/src/index.ts`, which is
  unrelated to managed-object compatibility or storage.
- Latest frontend Mermaid checkpoint: production Mermaid renderers, inline
  Markdown Mermaid, render persistence, supersession detection, and repair
  prompts now use object IDs and revision IDs. Focused grep over those
  production files found no old managed-object vocabulary.
- Latest resource API cleanup checkpoint: removed the previous standalone
  resource route mount/export, removed duplicate resource `id` identity from
  the object-resource record shape, restored original-source stale detection
  through the resource object resolver, and verified focused resource
  route/context tests plus Buddy package raw typecheck.
- Latest regression checkpoint: restored whiteboard Bench back navigation
  through the same user-origin leave guard path, fixed Mermaid repair request
  completion/success tracking after the repair assistant turn completes, and
  verified focused Mermaid, Bench, whiteboard, object-route, and frontend
  render/navigation tests.
- Latest documentation checkpoint: updated the curl smoke and flashcard
  backend-flow guides to use managed object routes, `objectID`, revision/state
  storage, and `metadata.buddyObjectResult`.
- Latest frontend regression checkpoint: hardened Bench close-to-chat history
  handling, made whiteboard session changes wait for the leave guard before
  mutating selected session state, fixed Mermaid supersession so the latest
  revision stays visible, and moved object Bench view hydration onto shared
  TanStack Query option factories.
- Latest finalization checkpoint: `bun lint` and root `bun typecheck` pass.
  Focused backend Mermaid repair/render tests pass when run as their own set;
  the larger backend focused command still exposes a test isolation issue where
  the Mermaid route tests inherit full OpenCode user plugin bootstrap and hit
  Bun's per-test timeout. The route/tool behavior is covered by the passing
  focused tests, and this is tracked as test harness debt rather than a managed
  object architecture divergence.
- Latest frontend verification checkpoint: targeted Bench navigation/open
  policy, Bench surface rendering, Library object selectors, shared object
  query factories, Mermaid supersession/panel, media rendering, and question-set
  sidebar tests pass with the package Happy DOM preload.
- Latest review-fix checkpoint: resource preparation now builds into
  generation-scoped staging and promotes only after the live manifest still
  matches the generation, object-store missing/tombstone resource route errors
  map through the object route mapper, Mermaid auto-repair detection is scoped
  to the current repair turn, stale Mermaid render reports cannot overwrite a
  newer current revision status, Bench Mermaid renders pass object/revision
  identity for render persistence, supported raw PDF/EPUB file Bench routes
  delegate to the reader, and the desktop titlebar back button is available in
  the directory-chat titlebar used by Bench routes.
- Latest resource-pack cleanup checkpoint: removed the old public
  `ensureResourcePack` facade, alias-root `createResourcePackPaths` helper, and
  alias-root full-text resolver export; prompt resource-reference tests now
  prepare resources through object-backed `addResource` and resolve via the
  resource object resolver.
- Design constraints added on 2026-06-18:
  - Execute the managed-objects cut end to end, not as a completed partial
    slice.
  - Use subagents only for concrete implementation work with disjoint write
    ownership, not read-only exploration.
  - Do not edit the design source of truth without explicit user permission.
  - Record local design/code mismatches in the `Divergences` section.
  - Adapt pragmatically to dead ends found by real code, checks, tests, SDK
    generation, or smoke flows while preserving the architecture's intent.
  - Run an explicit `rg`/grep audit before completion for prompt drift, old
    vocabulary, stale paths, parallel fallback surfaces, and dual old/new
    parsers.
  - No old vocabulary in new or touched managed-object function names, type
    names, filenames, route modules, query keys, helper names, comments, or
    docs; run focused grep checks over changed files regularly while coding.

## Decisions

- Added the backend object-core foundation under `packages/buddy/src/objects`.
  It owns kind/ID constants, manifest/tombstone/view/result schemas,
  `.buddy/objects/v1` path construction, staged record writes, tombstone-aware
  read/list/resolve/delete helpers, the rebuildable central object index, and a
  backend kind registry.
- Kept the old artifact core intact while building the object core because
  callers have not been cut over yet. The intent is replacement by vertical
  workflow cutover, not permanent dual contracts.
- Replaced the resource registry internals with resource managed objects.
  New resources copy source into
  `.buddy/objects/v1/resource/<objectID>/source/`, build packs under
  `.buddy/objects/v1/resource/<objectID>/derived/pack/`, maintain a rebuildable
  alias index, and expose objectID-first resolution.
- Updated `prepare_resource`, `ingest_full_text`, resource prompt inventory,
  active-resource prelude, resource reading skill/tool docs, Bench resource
  presentation lookup, and `/api/objects/resource` routes to consume the
  resource object resolver.
- Cut new HTML widget presentations over to managed objects. `present_html_widget`
  now adopts workspace-relative files or folders into
  `.buddy/objects/v1/html-widget/<objectID>/source/`, returns
  `metadata.buddyObjectResult`, exposes live-current runtime/source URLs under
  `/api/objects/html-widget`, and tells the model to edit the returned
  `source_root` or `edit_path`.
- Removed the previous HTML widget backend route, storage helpers, output
  schema, aggregate index branch, and tests. HTML widgets now use only object
  identity, object routes, and object-result metadata in touched backend code.
- Cut new media presentations over to managed objects. `present_media` now
  registers external-reference objects, stores item metadata in object state,
  resolves object views through the kind registry, and serves item bytes through
  `/api/objects/media-presentation/<objectID>/raw/<itemID>`.
- Renamed the media-presentation object path away from old identity vocabulary.
  New media presentations now use `objectID`, object raw/availability routes,
  and object tests; the previous media presentation backend route is no longer
  mounted or compiled.
- Cut new question sets over to managed objects. `save_question_set` now writes
  revisioned question-set objects, returns `metadata.buddyObjectResult`, and
  stores learner attempts under the object's `state/attempts` directory through
  `/api/objects/question-set/<objectID>/attempts`.
- Renamed the question-set object storage/test/prompt path away from old
  identity vocabulary. Private question-set payloads and attempt records now
  use `objectID` and `revisionID`; the deleted old question-set route is no
  longer mounted or compiled.
- Cut new flashcard decks over to managed objects. `save_flashcard_deck` now
  writes revisioned flashcard-deck objects, stores mutable review scheduler
  state in `state/deck.json`, writes pending/committed review records under
  `state/reviews`, and exposes object read/next-card/review routes.
- Renamed the flashcard object payload/state/review path away from old identity
  vocabulary. Decks, notes, review records, review inputs, object routes, and
  flashcard tests now use `objectID` for the managed deck identity.
- Cut Mermaid diagrams over to managed objects. Inline Markdown diagrams and
  `render_mermaid` now create revisioned Mermaid objects, render records live
  under object-derived storage, and browser repair routes use object IDs plus
  replacement revision IDs.
- Preserved Mermaid's single automatic repair attempt while moving the repair
  request state under the object store's Mermaid index. The repair prompt now
  asks the model to pass `repairOfObjectID`, and strict repair handling detects
  the repair request message ID directly.
- Cut freeform figures over to managed objects. `render_freeform_figure` now
  writes revisioned `freeform-figure` objects, serves SVG through
  `/api/objects/freeform-figure`, and returns shared object-result metadata.
- Aligned figure and freeform figure object views on the design's `rendered`
  view ID.
- Cut Bench context and `bench_present` over to explicit object/file targets.
  Bench snapshots now publish `workspace-file` or `object` targets, object
  targets carry `BuddyObjectRef` plus `viewID`, and `bench_present` returns
  typed metadata instead of relying on JSON-output parsing.
- Cut whiteboard persistence over to the object store. Session whiteboards now
  live under `.buddy/objects/v1/whiteboard/<objectID>/state/session.json`,
  the session lookup index lives under the whiteboard object index directory,
  and the whiteboard kind registry resolves the `current` view for Bench.
- Moved whiteboard HTTP operations to `/api/objects/whiteboard/session/:sessionID`
  and removed the old whiteboard route mount from the backend index.
- Cut frontend Mermaid rendering over to object metadata. Transcript Mermaid
  cards now parse `metadata.buddyObjectResult`, rehydrate through
  `objectMermaid.read`, persist browser render records through object Mermaid
  routes, repair with `repairOfObjectID`, and open Bench with object targets.
- Removed the now-unreferenced old backend artifact-core package and its
  dedicated artifact-store tests after production imports moved to the object
  core.
- Removed the previous standalone resource route surface. Resource API callers
  now use `/api/objects/resource`, and the object-resource record exposes
  `objectID` as the stable managed-object identity instead of duplicating it as
  `id`.
- Restored resource original-source stale detection after the object-storage
  move. Resolver/list reads now report a ready resource as stale when its
  original workspace source changes, and rebuild refreshes the managed source
  from that original before regenerating the object pack.
- Moved kind payload reads for flashcard decks, question sets, and Mermaid
  diagrams onto unambiguous subpaths: `/deck`, `/questions`, and `/source`.
  This keeps shared `objects.read` as the manifest route at
  `/api/objects/:kind/:objectID` and avoids route shadowing in the generated
  SDK.
- Restored Bench titlebar back navigation for pathless Bench object routes.
  The titlebar now detects Bench routes by pathname as well as route matches,
  derives the directory token from matches or the path, and calls the
  user-origin Bench leave guard before navigating back to chat.
- Fixed Mermaid automatic repair status handling after the object/revision
  move. Successful repairs now mark the parent repair request even when the
  tool executes in the assistant message context, and a completed repair turn
  that does not create a replacement revision exhausts the request instead of
  leaving the frontend polling a running status.
- Renamed the frontend Bench action reader away from the removed
  generated-output parser vocabulary. The reader now explicitly consumes typed
  `bench_present` metadata and shared object metadata.
- Changed explicit Bench close-to-chat navigations to replace the current
  history entry. Closing Bench is no longer a route stack push that makes the
  browser Back button reopen the just-closed Bench target.
- Changed whiteboard Bench session switching to run the leave guard before
  creating or selecting a session. If the guard blocks, the selected session is
  left untouched.
- Moved object Bench view, question-set payload, flashcard-deck payload, and
  media item availability reads behind shared TanStack Query option factories
  so loaders and components share cache identity instead of declaring route-local
  query keys.
- Serialized resource preparation commits with alias-index mutations so a
  background pack build cannot overwrite a concurrent rename, and delete now
  waits for active preparation before taking the alias-index lock.
- Changed resource preparation to write derived packs into a
  generation-scoped staging directory before promoting them into the resource
  object's canonical `derived/pack` path. A completed background build now
  commits only if the live manifest still carries the same generation.
- Kept the whiteboard `whiteboard_create_view` ordering that creates the stable
  live object and publishes the start-of-tool Bench auto-open candidate before
  permission and drawing work. This rejects the review suggestion to ask before
  object creation because the managed-objects design explicitly locks early
  whiteboard object targets to preserve progressive Bench opening.
- Made Bench route parsing tolerant of the pathless generated object route and
  the explicit `/_bench/objects/...` shape from the design prose. Both resolve
  to the same object target, and titlebar close-to-chat navigation can derive
  the current whiteboard target before running the leave guard.
- Routed supported path-only raw file Bench targets through the existing
  reading page so PDF/EPUB workspace paths keep reader state and
  selection-to-chat behavior even before they have a resource object ID.
- Scoped Mermaid auto-repair turn detection to the current message or current
  assistant parent message, and guarded browser render status writes so delayed
  reports for an older revision only persist their revision-scoped record
  without changing the object's current summary status.
- Removed the old resource-pack service re-export and alias-root path helper.
  The resource-pack package now exports only the object-root build entrypoint
  and object-root full-text metadata resolver needed by resource objects.
- Added a narrow session-interaction runtime override seam around Mermaid repair
  route dependencies. Production defaults still use OpenCode session lookup,
  prompt transforms, async prompt submission, message completion checks, and
  idle status; tests can exercise object repair state without real runtime
  session creation.
- Removed the accidental frontend `zod` import from the object-result renderer
  and replaced it with local manual narrowing so `packages/web` does not depend
  on a backend-only parser package.

## Removed Old Contracts

- Removed previous model-facing alias-derived processed-path instructions from
  resource runtime context and reading tool prompts.
- Removed `resource_id` as the primary `prepare_resource` output identity;
  the tool now emits `object_kind=resource` and `object_id=<objectID>`.
- Removed snapshot wording from the HTML widget tool prompt for newly-created
  widgets; live-current object runtime is now the model-facing contract.
- Removed previous HTML widget result metadata and backend routes from the
  backend contract.
- Removed old `PresentedMediaOutput` metadata from new `present_media` tool
  calls; the shared `buddyObjectResult` is now the presentation contract.
- Removed old `SaveQuestionSetOutput` metadata from new `save_question_set`
  tool calls; the shared `buddyObjectResult` is now the presentation contract.
- Removed old `SaveFlashcardDeckOutput` metadata from new
  `save_flashcard_deck` tool calls; the shared `buddyObjectResult` is now the
  presentation contract.
- Removed old Mermaid route mounting and old diagram result metadata from new
  Mermaid tool calls; the shared `buddyObjectResult` and `/api/objects/mermaid`
  routes are now the backend contract.
- Removed the old aggregate backend route/index files after the final backend
  old-route consumer, freeform figure, moved to object routes.
- Removed old Bench target shapes and old generated-output/resource target
  fields from the prompt prelude for newly-created object workflows.
- Removed old whiteboard storage paths and the old `/api/whiteboards` backend
  route mount.
- Removed the old backend artifact-core package after verifying no production
  or test imports remained outside the deleted package and its dedicated tests.
- Removed old frontend Mermaid artifact metadata parsing from production
  renderers; inline and tool Mermaid cards now use object-result metadata.
- Removed the previous standalone resource backend route and old duplicated
  resource `id` field from object-backed resource route responses.
- Removed stale managed-object guide text that still pointed curl smoke checks
  and flashcard flow documentation at the previous route/storage/result
  contracts.

## Preserved Contracts

- The new object store preserves the current artifact-core invariants for ULID
  validation, staged writes, sidecar preservation on update, failure-isolated
  listing, ignored invalid directories, and explicit orphan cleanup.
- Resource tools still accept human-friendly aliases, but objectID wins when a
  `resourceKey` can be resolved both ways.
- Resource stale detection is preserved for copied workspace sources: if the
  original source changes after preparation, object listing reports the resource
  as stale, and rebuild copies the changed original into the managed object
  source before rebuilding derived pack output.
- HTML widget adoption preserves folder entry paths, serves runtime documents
  from managed source, and only applies immutable caching when the runtime URL
  includes a matching computed source version.
- HTML widget adoption preserves previous validation for workspace containment,
  HTML extension, UTF-8 text, non-empty source, and maximum entry-file size.
- Media presentations preserve current external-file behavior: referenced files
  are not copied or pruned, and missing files remain addressable with item
  availability reported as missing/error.
- Question-set grading and learner-memory side effects are preserved while
  moving durable payloads and attempts into object revisions/state.
- Flashcard review scheduling, pending-review recovery, committed review
  records, and learner-memory side effects are preserved through object state.
- Mermaid SVG sanitization, inline-diagram deduplication, failed-render records,
  and one-attempt automatic repair behavior are preserved through object
  revisions and derived render records.
- Freeform SVG linting, sanitization, text halo insertion, and same-origin raw
  SVG serving are preserved through object revisions.
- Bench close/block/open behavior is preserved through typed
  `bench_present` metadata and object/file target comparisons.
- Whiteboard continuation safety, learner autosave conflict checks, render
  report digesting, layout feedback, and current-context reads are preserved
  while the durable state moved into object storage.
- Whiteboard Bench back navigation is preserved for object routes and still
  goes through the user-origin leave guard before closing Bench.
- Mermaid automatic repair preserves the one-attempt state machine: succeeded
  repair requests record the replacement revision, while completed repair turns
  without a replacement move to the exhausted state instead of polling
  indefinitely.
- Mermaid supersession preserves latest-revision visibility: only a later
  concrete revision in transcript order can supersede the current revision card.
- Resource preparation preserves current manifest changes made by rename while
  a build is running, and removal no longer deadlocks against an active build
  that needs the alias-index mutation lock to finish.
- Resource rebuild now keeps the last committed pack on disk until the staged
  replacement generation passes the manifest-generation check and is promoted.
- Resource alias lookup treats `aliases.json` as a cache: stale entries that
  point at missing or tombstoned objects are rebuilt before reporting failure,
  and duplicate live alias claims report an ambiguous alias error instead of
  silently choosing a winner.
- Resource pack snapshots no longer expose `packKey`; objectID-scoped pack
  paths are the remaining resource-pack identity surfaced to callers.
- `bench_present` resource presentation preserves managed-object unavailable
  semantics for deleted object IDs instead of converting tombstones into
  not-found resource responses.
- Mermaid reads preserve the requested revision ID all the way through render
  record resolution, preventing stale revision renders from being written under
  the current revision.
- Shared object view resolvers now reject unsupported `viewID` values before
  returning data, so route/cache identity cannot drift from the returned view.
- Frontend object-result parsing still validates question-set inline payload
  shape before rendering, but does so without adding a new package dependency.

## Divergences

- Added a `resource-reader` object view payload to the shared
  `BuddyObjectViewData` schema. The design specifies resource reader behavior
  and default view identity but only examples inline/source/context/library data
  shapes. A typed reader payload keeps the object-view API explicit for
  resource Bench/frontend hydration without falling back to routes or untyped
  blobs.

- None currently recorded for the question-set, flashcard, Mermaid,
  figure/freeform, Bench, or whiteboard object cutovers.

## Test Harness Notes

- Running the focused backend Mermaid repair route tests alone is stable and
  passes. Running those route tests inside a larger backend focused command can
  inherit user OpenCode plugin bootstrap and hit Bun's per-test timeout before
  the route assertions execute. The production repair status path and direct
  Mermaid tool semantics are covered by focused passing tests; this is test
  isolation debt, not a managed-object architecture divergence.

## Clean-Slate Review Disposition

- Fixed cached object resolution so tombstones and duplicate live manifests
  take precedence over a previously cached ready object.
- Typed Mermaid preflight repair records in the OpenAPI route and regenerated
  SDK.
- Made the resolver-owned resource `readerPath` authoritative in web readers,
  and recomputed full-text paths from the managed pack instead of trusting
  persisted manifest paths.
- Removed the remaining abbreviated full-text token vocabulary from backend,
  prompt, web, fixture, and generated contracts.
- Completed HTML widget folder adoption, contained relative-asset serving,
  single-file rollback, live-current hydration, home/URI path rejection, and
  standard/wide Bench auto-open behavior.
- Added shared TanStack Query hydration for null inline object presentations,
  direct save-tool renderers for question sets and flashcard decks, and a typed
  unavailable Bench surface for tombstoned objects.
- Restored MIME data through media object payloads so audio and video use the
  inline player, and updated whiteboard continuation guidance to the current
  contract.
- Rejected the reported missing Bench-route finding after verifying the
  generated TanStack tree: `_bench` is a pathless layout ID, while the existing
  `/$directory/file`, `/$directory/markdown`, and `/$directory/objects/...`
  URLs are the generated public paths.

Verification: focused Buddy and web regression suites pass, regenerated SDK
contracts contain typed Mermaid repair data and media MIME, drift grep is clean,
`git diff --check` passes, `bun lint` passes, and root `bun typecheck` passes.

## Open Blockers

- None for managed-object product behavior.
