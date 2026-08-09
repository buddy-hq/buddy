# Workspace Artifacts

## Objective

Workspace artifacts are durable, learner-facing objects that Buddy creates during a lesson or chat and can later show again in the transcript, side panels, or Library.

The current artifact system intentionally normalizes these seven kinds:

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

The storage root is workspace-scoped:

```text
<workspace>/.buddy/artifacts/<kind>/<artifactID>/
  manifest.json
  kind-owned payload files
```

`artifactID` is an opaque ULID. It is the public identifier in tool metadata, API routes, frontend queries, and persisted manifests. Old identifiers such as `deckID`, `presentationID`, `widgetID`, and `figureID` are not part of the normalized artifact API.

The shared core owns path construction, ID validation, ULID generation, staged writes, manifest reads, listing, load-error shaping, stale manifest filtering, and explicit orphan garbage collection. Individual artifact kinds own only their domain payloads, tool contracts, read models, and actions.

## Why Filesystem Storage

Buddy is local-first and workspace-scoped. The artifact store therefore lives inside the workspace instead of a global database.

This gives the right operational properties:

- artifacts move with the workspace;
- artifacts are easy to inspect and delete;
- the app can list and read artifacts without a central database migration path;
- a corrupt artifact directory does not corrupt unrelated artifacts;
- large or kind-specific payloads can stay as normal files beside metadata.

The system is not content-addressed storage. `sourceHash` exists for validation, rendering, and identity hints, but the canonical artifact address is the ULID `artifactID`.

## Common Manifest Envelope

Every normalized artifact has `manifest.json` with this shared envelope:

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

The current payload layout is:

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

The shared core lives under `packages/buddy/src/artifacts/`.

Important modules:

| File | Responsibility |
| --- | --- |
| `kinds.ts` | kind constants, manifest version, ULID and hash schemas |
| `manifest.ts` | common envelope and origin schemas |
| `path.ts` | `.buddy/artifacts` path construction and validation |
| `layout.ts` | canonical payload filenames and subdirectories |
| `store.ts` | staged writes, reads, listing, load errors, explicit orphan GC |
| `errors.ts` | shared artifact validation, not-found, load errors, and route mapper |
| `hash.ts` | shared text hashing |

`writeArtifactRecord` stages a complete artifact directory before making it visible. For updates, it copies the existing artifact into a staging directory, overlays changed files and the new manifest, then swaps the staged directory into place with a backup fallback. This preserves sidecar files such as Mermaid render records, question-set attempts, and flashcard reviews during manifest or payload updates.

`listArtifactManifests` is read-only. It reads valid ULID directories, parses each manifest with the caller's schema, sorts items newest-first, and returns `{ items, loadErrors }`. Missing manifests and stale pre-refactor discriminator errors are ignored so old or partially-created directories do not show noisy Library errors. Corrupt current-format manifests become load errors.

`garbageCollectArtifactKindOrphans` is explicit. It removes manifestless artifact directories and abandoned staging directories, but listing does not perform cleanup as a side effect.

## Backend Flow

The normal creation flow is:

1. A model-visible tool or markdown renderer receives kind-specific input.
2. The feature validates and normalizes that input.
3. The feature builds a typed manifest using the common envelope and kind-specific `summary`.
4. The feature writes the manifest plus payload files through `writeArtifactRecord`.
5. The tool returns metadata containing `artifactID`, `kind`, and enough summary data for the transcript renderer.
6. The Library and side panels list artifacts through the unified index.

Kind-specific stores still own domain behavior:

- Mermaid owns preflight repair, source snapshots, browser render records, failed-render records, supersession, and auto-repair state.
- Question sets own public answer stripping, attempt records, and attempt evaluation.
- Flashcards own authoritative queue/count construction, scheduling, pending review recovery, and review records. Their current contract is documented in [Flashcards](../../library-resources/flashcards.md).
- Media presentations own local-file resolution, media classification, raw-file serving metadata, and current availability.
- HTML widgets own file-first snapshotting, viewport presets, source/runtime URLs, warnings, and sandbox/CSP behavior.
- Figures own SVG generation, repair attempts, and raw SVG serving.
- Freeform figures own SVG validation, normalization, and raw SVG serving.

## API Surface

The unified index route is:

```text
GET /api/artifacts?directory=<absolute-path>&kind=<optional-kind>
```

It returns:

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

The index is implemented in `packages/buddy/src/learning/artifact-index.ts`. It is a domain query over all normalized kinds. The Hono route in `packages/buddy/src/routes/artifacts.ts` only adapts HTTP input/output and mounts typed per-kind routes.

Typed routes live under:

```text
/api/artifacts/mermaid/...
/api/artifacts/question-set/...
/api/artifacts/flashcard-deck/...
/api/artifacts/html-widget/...
/api/artifacts/media-presentation/...
/api/artifacts/figure/...
/api/artifacts/freeform-figure/...
```

Routes use generated OpenAPI SDK types on the frontend. Metadata and availability queries should go through `BuddyClient`; raw-byte URLs are allowed only for actual byte delivery, such as image, SVG, PDF, audio, or video responses.

## Frontend Flow

The frontend uses one query family in `packages/web/src/state/workspace-artifacts-query.ts`.

Query keys are kind-scoped:

```ts
["workspace-artifacts", directory, kind]
```

The generic query loader calls `getBuddyClient(directory).artifacts.list({ directory, kind })`. Per-kind helpers such as `workspaceMermaidArtifactsQueryOptions` and `workspaceFlashcardDecksQueryOptions` are thin adapters around that shared query.

Library selection helpers live in `packages/web/src/components/layout/chat-left-sidebar/library-artifact-selectors.ts`. They filter the typed index union into tab-specific rows:

- Flashcards
- Question Sets
- Widgets
- Diagrams
- Media

The Media tab combines `media-presentation`, `figure`, and `freeform-figure`. Media presentations with no currently available files are intentionally hidden from that tab; figures and freeform figures render as SVG previews.

The transcript renderers parse tool metadata at the untyped agent-output boundary and then use `artifactID` to hydrate details when needed.

## Library Semantics

The Library treats `loadErrors` as current-format artifact problems. They are rendered in the relevant tab instead of failing the whole list request.

Stale artifacts from older internal shapes are ignored by the backend lister. This is intentional because this refactor is a breaking cut with no migration. Old on-disk roots and old manifest shapes may remain on disk, but they should not create noisy user-facing errors.

Unavailable media has different semantics from load errors. A valid media presentation whose source files are now missing remains a valid artifact, but the Media tab hides presentations with no available items so the tab stays action-oriented.

## Concurrency And Failure Behavior

Artifact creation is directory-staged. A list request should not see a half-written new artifact. Existing artifact updates preserve sidecars by staging from the current directory before swapping.

The manifest is still the commit record for artifact visibility. Payload files are written before `manifest.json` inside the staging directory, and the final directory rename makes the artifact visible.

Listing is failure-isolated:

- missing kind roots list as empty;
- invalid directory names are ignored;
- missing manifests are ignored;
- stale old-origin manifests are ignored;
- corrupt current-format manifests become `loadErrors`;
- valid manifests are returned newest-first.

Mermaid inline markdown artifact creation is serialized per markdown origin plus source hash. Repeated or concurrent inline creation for the same markdown segment returns the same artifact instead of creating duplicate diagram artifacts.

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

Backend:

- `packages/buddy/src/artifacts/*`
- `packages/buddy/src/learning/artifact-index.ts`
- `packages/buddy/src/routes/artifacts.ts`
- `packages/buddy/src/routes/mermaid.ts`
- `packages/buddy/src/routes/question-set.ts`
- `packages/buddy/src/routes/flashcard-deck.ts`
- `packages/buddy/src/routes/html-widget.ts`
- `packages/buddy/src/routes/media-presentation.ts`
- `packages/buddy/src/routes/figure.ts`
- `packages/buddy/src/routes/freeform-figure.ts`

Kind implementations:

- `packages/buddy/src/learning/features/diagrams/service/store.ts`
- `packages/buddy/src/learning/features/question-sets/storage/save-artifact.ts`
- `packages/buddy/src/learning/features/question-sets/storage/read-artifact.ts`
- `packages/buddy/src/learning/features/flashcards/storage/save-deck.ts`
- `packages/buddy/src/learning/features/flashcards/storage/read-deck.ts`
- `packages/buddy/src/learning/features/flashcards/storage/review.ts`
- `packages/buddy/src/learning/features/media-presentations/service/file-media.ts`
- `packages/buddy/src/learning/features/html-widgets/service/store.ts`
- `packages/buddy/src/learning/features/figure-rendering/geometry/render-figure.ts`
- `packages/buddy/src/learning/features/figure-rendering/freeform/service/io.ts`

Frontend:

- `packages/web/src/state/workspace-artifacts-query.ts`
- `packages/web/src/components/layout/chat-left-sidebar/library-artifact-selectors.ts`
- `packages/web/src/components/layout/chat-left-sidebar/library-panel.tsx`
- `packages/web/src/components/layout/workspace-mermaid-panel.tsx`
- `packages/web/src/components/layout/workspace-question-set-panel.tsx`
- `packages/web/src/components/layout/workspace-flashcard-panel.tsx`
- transcript renderers under `packages/web/src/components/chat/tools/render/`

Tests:

- `packages/buddy/test/artifacts/artifact-store.test.ts`
- focused kind route/tool tests under `packages/buddy/test/{mermaid,question-set,flashcard,media,figures,html-widgets}/`
- `packages/web/test/workspace-artifacts-query.test.ts`
- `packages/web/test/library-artifact-selectors.test.ts`
- focused transcript and panel tests under `packages/web/test/`

## Implementation Status

The normalized artifact core is implemented for the seven in-scope kinds.

Old roots are intentionally not read:

```text
.buddy/mermaid-artifacts-v2
.buddy/question-set-artifacts
.buddy/flashcard-decks
.buddy/presented-media-artifacts
.buddy/html-widget-artifacts
.buddy/figures
.buddy/freeform-figures
```

The current system has one storage root, one manifest filename, one public ID field, one unified index API, and kind-scoped detail/action routes. The remaining kind-specific code is for actual domain behavior: rendering, review scheduling, attempt evaluation, file availability, sandboxed widget runtime, and SVG generation.
