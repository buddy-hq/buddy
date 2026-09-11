# Workspace Artifacts

> **Storage status:** The `.buddy/artifacts/<kind>/<artifactID>/` layout in this document is the
> **historical / proposed unified artifacts store**. It is **not** what ships.
>
> Shipped ownership is the managed object store:
>
> ```text
> <workspace>/.buddy/objects/v1/<kind>/<objectID>/
>   object.json
>   source/ | revisions/ | derived/ | state/   (kind-owned)
> ```
>
> Defined in `packages/buddy/src/objects/` (`kinds.ts`, `path.ts`). Index and HTTP:
> `GET /api/objects?directory=...&kind=...` in `packages/buddy/src/routes/objects.ts`
> (`api.route("/objects", ObjectsRoutes)` in `packages/buddy/src/app.ts`). Frontend:
> `packages/web/src/state/workspace-objects-query.ts` and
> `packages/web/src/components/layout/chat-left-sidebar/library-object-selectors.ts`.
> Flashcard contract: [Flashcards](../flashcards/decisions.md).
>
> Shipped kinds include the seven below **plus** `resource` and `whiteboard` (those two were
> out of scope for this artifacts envelope). Manifest filename is `object.json`, public id
> `objectID` (ULID).
>
> Keep the schemas, staging/rename rules, and kind domain notes below as the artifacts-era
> contract and migration rationale.

## Objective

Workspace artifacts are durable, learner-facing objects that Buddy creates during a lesson or chat and can later show again in the transcript, side panels, or Library.

The artifacts-era design normalized these seven learner-facing kinds (still the product set, now stored as objects):

| Kind | Product surface |
| --- | --- |
| `mermaid` | diagrams |
| `question-set` | practice, quiz, and assessment question sets |
| `flashcard-deck` | flashcard decks and review state |
| `media-presentation` | local files presented in chat |
| `html-widget` | sandboxed single-file HTML widgets |
| `figure` | structured geometry SVG figures |
| `freeform-figure` | direct SVG figures |

This system does not cover resources, whiteboards, teaching workspaces/checkpoints, learner memory, standards knowledge-graph artifacts, or advanced-math temporary outputs.

## Design Position

Artifacts use a local filesystem snapshot plus manifest model.

The **proposed** storage root was workspace-scoped:

```text
<workspace>/.buddy/artifacts/<kind>/<artifactID>/
  manifest.json
  kind-owned payload files
```

**Shipped** root (use this for new work):

```text
<workspace>/.buddy/objects/v1/<kind>/<objectID>/
  object.json
```

**Shipped public identifier:** `objectID` (ULID). It is the id in tool metadata, `GET /api/objects` and `/api/objects/<kind>/...` routes, frontend queries, and `object.json`. Old per-kind names such as `deckID`, `presentationID`, `widgetID`, and `figureID` are not part of the object API.

**Historical artifacts-era identifier:** `artifactID` was the same ULID role under `.buddy/artifacts/` and `manifest.json`. Keep that name only when reading the historical envelope below.

The shared object core still owns path construction, ID validation, ULID generation, staged writes, `object.json` reads, listing, load-error shaping, stale object filtering, and explicit orphan garbage collection. Individual kinds own only their domain payloads, tool contracts, read models, and actions. That core now lives in `packages/buddy/src/objects/`, not `packages/buddy/src/artifacts/`.

## Why Filesystem Storage

Buddy is local-first and workspace-scoped. The artifact store therefore lives inside the workspace instead of a global database.

This gives the right operational properties:

- artifacts move with the workspace;
- artifacts are easy to inspect and delete;
- the app can list and read artifacts without a central database migration path;
- a corrupt artifact directory does not corrupt unrelated artifacts;
- large or kind-specific payloads can stay as normal files beside metadata.

The system is not content-addressed storage. `sourceHash` exists for validation, rendering, and identity hints, but the canonical address is the ULID (`objectID` shipped; `artifactID` in the artifacts-era envelope).

## Common Manifest Envelope

**Historical artifacts-era** envelope (`manifest.json` + `artifactID`). Shipped manifests are `object.json` with `objectID`. Keep this schema as the migration rationale; kinds still use a shared envelope plus kind-owned `summary`.

Every normalized artifacts-era record had `manifest.json` with this shared envelope:

```ts
type ArtifactManifestBase = {
  version: 1
  artifactID: string
  kind:
    | "mermaid"
    | "question-set"
    | "flashcard-deck"
    | "media-presentation"
    | "html-widget"
    | "figure"
    | "freeform-figure"
  title: string
  description?: string
  origin?:
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
  createdAt: string
  updatedAt: string
  sourceHash?: string
  summary: unknown
}
```

The envelope is cheap to list. `summary` is the typed per-kind list payload. Full content stays in kind-owned payload files when it would be too large, sensitive, or action-specific for index listing.

## Payload Layout

**Historical artifacts-era** payload layout (proposed `.buddy/artifacts/` store; not shipped):

```text
.buddy/artifacts/mermaid/<artifactID>/
  manifest.json
  source.mmd
  renders/<renderKey>.json

.buddy/artifacts/question-set/<artifactID>/
  manifest.json
  question-set.json
  attempts/*.json

.buddy/artifacts/flashcard-deck/<artifactID>/
  manifest.json
  deck.json
  pending-review.json
  reviews/*.json

.buddy/artifacts/media-presentation/<artifactID>/
  manifest.json

.buddy/artifacts/html-widget/<artifactID>/
  manifest.json
  index.html

.buddy/artifacts/figure/<artifactID>/
  manifest.json
  figure.svg

.buddy/artifacts/freeform-figure/<artifactID>/
  manifest.json
  figure.svg
```

Media presentations intentionally do not copy media bytes. Their manifest stores resolved local-file metadata and raw URLs. Reads refresh availability from the current filesystem so a deleted source file becomes unavailable without pretending the bytes still exist.

HTML widgets, Mermaid sources, and SVG figures are snapshots. They remain renderable even if the original authoring file or chat context changes.

## Shared Backend Core

**Shipped** core: `packages/buddy/src/objects/` (`kinds.ts`, `path.ts` for `.buddy/objects/v1`, `store.ts` `writeObjectRecord` / `listObjects`, errors, index). HTTP adapter: `packages/buddy/src/routes/objects.ts`.

**Historical artifacts-era** core (not in the tree): `packages/buddy/src/artifacts/`.

Historical modules (rationale for staging, listing, and GC — names mapped to objects today):

| File | Responsibility |
| --- | --- |
| `kinds.ts` | kind constants, manifest version, ULID and hash schemas |
| `manifest.ts` | common envelope and origin schemas |
| `path.ts` | `.buddy/artifacts` path construction and validation (shipped: `.buddy/objects/v1`) |
| `layout.ts` | canonical payload filenames and subdirectories |
| `store.ts` | staged writes, reads, listing, load errors, explicit orphan GC |
| `errors.ts` | shared artifact validation, not-found, load errors, and route mapper |
| `hash.ts` | shared text hashing |

Historical `writeArtifactRecord` staged a complete artifact directory before making it visible. For updates, it copied the existing artifact into a staging directory, overlaid changed files and the new manifest, then swapped the staged directory into place with a backup fallback. Shipped `writeObjectRecord` keeps that atomic visibility rule under `.buddy/objects/v1/` for object creation and payload updates, preserving sidecar files such as Mermaid render records, question-set attempts, and flashcard reviews. Metadata/status-only updates use `writeObjectManifest`, which atomically rewrites only `object.json` and refreshes the object index without restaging sidecars.

Historical `listArtifactManifests` was read-only. It read valid ULID directories, parsed each manifest with the caller's schema, sorted items newest-first, and returned `{ items, loadErrors }`. Shipped listing is `listObjects`. Missing manifests and stale pre-refactor discriminator errors are ignored so old or partially-created directories do not show noisy Library errors. Corrupt current-format manifests become load errors.

Historical `garbageCollectArtifactKindOrphans` was explicit. It removed manifestless artifact directories and abandoned staging directories, but listing does not perform cleanup as a side effect.

## Backend Flow

The normal creation flow is:

1. A model-visible tool or markdown renderer receives kind-specific input.
2. The feature validates and normalizes that input.
3. The feature builds a typed manifest using the common envelope and kind-specific `summary`.
4. The feature writes the manifest plus payload files through the shared store (`writeObjectRecord` shipped; historical `writeArtifactRecord`).
5. The tool returns metadata containing `objectID` (historical field name: `artifactID`), `kind`, and enough summary data for the transcript renderer.
6. The Library and side panels list objects through `GET /api/objects`.

Kind-specific stores still own domain behavior:

- Mermaid owns preflight repair, source snapshots, browser render records, failed-render records, supersession, and auto-repair state.
- Question sets own public answer stripping, attempt records, and attempt evaluation.
- Flashcards own authoritative queue/count construction, scheduling, pending review recovery, and review records. Their current contract is documented in [Flashcards](../flashcards/decisions.md).
- Media presentations own local-file resolution, media classification, raw-file serving metadata, and current availability.
- HTML widgets own file-first snapshotting, viewport presets, source/runtime URLs, warnings, and sandbox/CSP behavior.
- Figures own SVG generation, repair attempts, and raw SVG serving.
- Freeform figures own SVG validation, normalization, and raw SVG serving.

## API Surface

The artifacts-era unified index was:

```text
GET /api/artifacts?directory=<absolute-path>&kind=<optional-kind>
```

That route and `packages/buddy/src/learning/artifact-index.ts` / `packages/buddy/src/routes/artifacts.ts` are not the shipped surface.

**Shipped index:**

```text
GET /api/objects?directory=<absolute-path>&kind=<optional-kind>
```

Implemented in `packages/buddy/src/routes/objects.ts` (`listObjects`). Typed kind routes mount under `/api/objects/<kind>/...` (mermaid, question-set, flashcard-deck, html-widget, media-presentation, figure, freeform-figure, plus resource and whiteboard).

The historical response shape was:

```ts
type ArtifactIndexResponse = {
  artifacts: ArtifactIndexItem[]
  loadErrors: Array<{
    artifactID: string
    kind: ArtifactKind
    message: string
  }>
}
```

The artifacts-era index was a domain query over normalized kinds. Historical Hono adapter: `packages/buddy/src/routes/artifacts.ts` (not present). Historical typed routes:

```text
/api/artifacts/mermaid/...
```

**Shipped** typed routes live under `/api/objects/...` as listed above.

Routes use generated OpenAPI SDK types on the frontend. Metadata and availability queries should go through `BuddyClient`; raw-byte URLs are allowed only for actual byte delivery, such as image, SVG, PDF, audio, or video responses.

## Frontend Flow

The artifacts-era query family was `packages/web/src/state/workspace-artifacts-query.ts` with keys `["workspace-artifacts", directory, kind]`. That module is gone.

**Shipped:** `packages/web/src/state/workspace-objects-query.ts` calling `getBuddyClient(directory).objects.list({ directory, kind })`. Library filters: `library-object-selectors.ts` (not `library-artifact-selectors.ts`).

Historical query keys were:

```ts
["workspace-artifacts", directory, kind]
```

The generic historical loader called `getBuddyClient(directory).artifacts.list({ directory, kind })`. Per-kind helpers such as `workspaceMermaidArtifactsQueryOptions` were thin adapters around that shared query.

Library selection helpers were `library-artifact-selectors.ts`. They filter the typed index union into tab-specific rows:

- Flashcards
- Question Sets
- Widgets
- Diagrams
- Media

The Media tab combines `media-presentation`, `figure`, and `freeform-figure`. Media presentations with no currently available files are intentionally hidden from that tab; figures and freeform figures render as SVG previews.

The transcript renderers parse tool metadata at the untyped agent-output boundary and then use `objectID` to hydrate details when needed (historical metadata field: `artifactID`).

## Library Semantics

The Library treats `loadErrors` as current-format managed-object problems. They are rendered in the relevant tab instead of failing the whole list request.

Stale objects from older internal shapes are ignored by the backend lister. This is intentional because this refactor is a breaking cut with no migration. Old artifacts-era roots and manifest shapes may remain on disk, but they should not create noisy user-facing errors.

Unavailable media has different semantics from load errors. A valid media-presentation object whose source files are now missing remains a valid object, but the Media tab hides presentations with no available items so the tab stays action-oriented.

## Concurrency And Failure Behavior

### Shipped managed-object visibility contract

`writeObjectRecord` handles object creation and payload updates by staging the complete object directory. A list request should not see a half-written new object, and these updates preserve sidecars by copying the current directory before swapping.

`object.json` is the commit record for object visibility in `writeObjectRecord`. Kind-owned payload files are written before `object.json` inside the staging directory, and the final directory rename makes the object visible under `.buddy/objects/v1/<kind>/<objectID>/`. Metadata/status-only updates use `writeObjectManifest`, which atomically rewrites only `object.json` and refreshes the object index without restaging sidecars.

### Historical artifacts-era visibility rule

The artifacts-era contract staged artifact directories in the same way. Its `manifest.json` was written after payload files, and the final directory rename made the artifact visible. Keep that rule as migration rationale only; it is not the shipped storage contract.

Listing is failure-isolated:

- missing kind roots list as empty;
- invalid directory names are ignored;
- missing `object.json` records are ignored;
- old artifacts-era roots outside `.buddy/objects/v1/` are not scanned;
- corrupt current-format `object.json` records become `loadErrors`;
- valid objects are returned newest-first.

Mermaid inline markdown object creation is serialized per markdown origin plus source hash. Repeated or concurrent inline creation for the same markdown segment returns the same object instead of creating duplicate diagram objects.

Flashcard review submission serializes scheduling updates and durable review records so a completed review does not update deck state without a committed review entry.

## Tool Contracts

The model-facing tools remain behavior-specific rather than generic artifact creation tools.

| Tool | Creates |
| --- | --- |
| `render_mermaid` | `mermaid` artifact |
| `save_question_set` | `question-set` artifact, usually via subagent |
| `save_flashcard_deck` | `flashcard-deck` artifact, usually via subagent |
| `present_media` | `media-presentation` artifact |
| `present_html_widget` | `html-widget` artifact |
| `render_figure` | `figure` artifact |
| `render_freeform_figure` | `freeform-figure` artifact |

This is intentional. The model should think in terms of teaching operations, not storage primitives. The shared artifact system is an implementation and product indexing layer, not a model-visible generic database.

## Non-Goals

- No backward-compatible reads for old artifact roots.
- No migration from old `.buddy/<feature-root>` layouts.
- No global artifact database.
- No cross-workspace artifact index.
- No content-addressed artifact IDs.
- No model-facing generic `create_artifact` tool.
- No raw-byte copying for media presentations.
- No preservation of old tool-output IDs for new outputs.

## Key Files

Historical artifacts-era paths (not present): `packages/buddy/src/artifacts/*`, `artifact-index.ts`, `routes/artifacts.ts`, `workspace-artifacts-query.ts`.

Shipped:

Backend:

- `packages/buddy/src/objects/` (`kinds.ts`, `path.ts`, list/read)
- `packages/buddy/src/routes/objects.ts` and `packages/buddy/src/routes/object-*.ts`
- `packages/buddy/src/app.ts` (`api.route("/objects", ObjectsRoutes)`)

Kind implementations (still valid):

- `packages/buddy/src/learning/features/diagrams/service/store.ts`
- `packages/buddy/src/learning/features/question-sets/storage/save-object.ts`
- `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts`
- `packages/buddy/src/learning/features/flashcards/storage/read-deck.ts`
- `packages/buddy/src/learning/features/flashcards/storage/review.ts`
- `packages/buddy/src/learning/features/media-presentations/service/file-media.ts`
- `packages/buddy/src/learning/features/html-widgets/service/store.ts`
- `packages/buddy/src/learning/features/figure-rendering/geometry/render-figure.ts`
- `packages/buddy/src/learning/features/figure-rendering/freeform/service/io.ts`

Frontend:

- `packages/web/src/state/workspace-objects-query.ts`
- `packages/web/src/components/layout/chat-left-sidebar/library-object-selectors.ts`
- `packages/web/src/components/layout/workspace-mermaid-panel.tsx`
- `packages/web/src/components/layout/workspace-question-set-panel.tsx`
- `packages/web/src/components/layout/workspace-flashcard-panel.tsx`
- `packages/web/src/components/directory-chat/right-workspace-catalog-drawers.tsx`
- transcript renderers under `packages/web/src/components/chat/tools/render/`

Tests:

- `packages/buddy/test/objects/object-store.test.ts`
- focused kind tests under `packages/buddy/test/`
- `packages/web/test/workspace-objects-query.test.ts`
- `packages/web/test/library-object-selectors.test.ts`

## Implementation Status

The seven kinds from this document ship as managed objects under `.buddy/objects/v1/`, with `resource` and `whiteboard` in the same store. The object record is `object.json` and its public identifier is `objectID`. Unified index is `GET /api/objects`.

Old feature-specific roots are still not read:

```text
.buddy/mermaid-artifacts-v2
.buddy/question-set-artifacts
.buddy/flashcard-decks
.buddy/presented-media-artifacts
.buddy/html-widget-artifacts
.buddy/figures
.buddy/freeform-figures
```

Kind-specific code still owns rendering, review scheduling, attempt evaluation, file availability, sandboxed widget runtime, and SVG generation.
