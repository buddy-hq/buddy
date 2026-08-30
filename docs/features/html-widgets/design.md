# HTML App Widgets

Status: **shipped** file-first teaching widgets. `present_html_widget` is a live Buddy tool
(`packages/buddy/src/learning/features/html-widgets/`). This file is the product design record,
not a brainstorm and not an implementation request.

## Product outcome

HTML app widgets are a first-class teaching artifact: small, self-contained browser experiences
that Buddy can create during a lesson and show to the learner in chat, fullscreen, and the library.

The shipped product shape is file-first:

1. Buddy writes or edits a normal local `.html` file with existing file tools.
2. Buddy calls `present_html_widget` with the file path, learner-facing title, and closest viewport preset.
3. The backend adopts that file or folder into a durable managed `html-widget` object.
4. The frontend renders the managed object's source in a sandboxed browser frame.
5. If Buddy later changes the widget, it edits the returned managed source path and re-presents
   the same object with `present_object`.

This keeps widget authoring aligned with how code-capable models work best: use real files for substantial HTML/CSS/JavaScript, and use a small presentation tool only to make the result visible and collectible.

## Product Shape

An HTML widget is not a full app. It is a single static HTML document with inline CSS and JavaScript.

It can support:

- concept simulations
- custom quizzes
- animated explanations
- draggable visual models
- small practice tools
- one-off mini games
- canvas, SVG, CSS animation, and ordinary browser UI

It does not need a backend. It does not get implicit access to Buddy state, local files, credentials, Electron APIs, or the host DOM.

The learner-facing mental model is: "Buddy made an interactive widget for this explanation." The model-facing mental model is: "Create an HTML file, then present it."

## Feasibility Read

This is shipped in the current architecture: file-first, sandboxed iframe, managed object source.

Buddy already has the required building blocks:

| Need | Existing precedent |
| --- | --- |
| model-visible presentation tool | `present_media`, `render_mermaid`, whiteboard tools |
| durable local managed-object storage | Mermaid, question sets, presented media |
| transcript card renderer | Mermaid, present media, saved question sets |
| fullscreen artifact view | Mermaid |
| library collection | Mermaid, question sets, flashcards, resources |
| browser runtime | Electron ships Chromium on macOS and Windows |

The code generation side is not the concern. Modern models can produce useful single-file HTML. The design risk is in product boundaries and runtime isolation.

## Decisions To Lock

1. Add an `html-widgets` Buddy feature.
2. Use a file-first authoring flow.
3. Add one model-visible presentation tool: `present_html_widget`.
4. `present_html_widget` accepts a local HTML file or folder for `present_path`, or a previously
   returned object ID for `present_object`; it does not accept HTML source as a string.
5. The first successful presentation creates a managed `html-widget` object and adopts its source
   into that object's `source/` tree.
6. An edited managed widget is re-presented with the same `objectID`. Per-presentation immutable
   revisions are not implemented; `sourceVersion` identifies the currently served source tree.
7. Use a backend-owned `objectID` as the stable managed-object handle.
8. Treat `objectID` like other normalized Buddy object IDs: return it in object metadata for
   rendering and library lookup, and pass it back only when re-presenting that managed widget.
9. Render the managed source in a sandboxed iframe first, with explicit risk tracking for CPU hangs.
10. Restrict network access by default; the shipped CSP permits same-origin runtime connects but
    blocks third-party network use.
11. Use inline CSS and JavaScript by default.
12. Collect widgets in the library.
13. Render widgets inline in the transcript with fullscreen support.
14. Keep learner interaction state ephemeral in the first version.
15. Ask the model for a constrained viewport preset, not arbitrary dimensions. The frontend resolves
    the preset to the declared viewport while scaling the preview to fit.

## Tool Contract

The model-facing tool stays small and has two explicit modes:

```ts
present_html_widget({
  action: "present_path",
  path: string,
  entryPath?: string,
  title: string,
  description?: string,
  viewportPreset: HtmlWidgetViewportPreset,
})

present_html_widget({
  action: "present_object",
  objectID: string,
})
```

The tool should:

- resolve a workspace-contained file or folder using the same local path rules as `present_media`
- validate the HTML entry file and any folder `entryPath`
- record the intended viewport preset and resolved dimensions
- adopt the source into Buddy's managed object storage for `present_path`
- return an object reference plus source/runtime metadata
- rehydrate an existing object for `present_object`
- make the widget available in chat, Bench, and the library

The tool should not:

- edit the widget content itself (file tools edit the managed source)
- accept raw HTML source
- ask the model for an object ID on first presentation
- ask the model for a revision/checkpoint ID
- ask the model for arbitrary pixel dimensions
- expose Buddy component imports

Viewport presets:

| Preset | Dimensions | Use when |
| --- | ---: | --- |
| `compact_4_3` | 640x480 | small quiz, control panel, compact explanation |
| `standard_16_10` | 960x600 | default lesson widget |
| `wide_16_9` | 1280x720 | wide simulation, canvas scene, timeline |
| `square` | 720x720 | centered manipulative or board-like tool |
| `tall_mobile` | 390x844 | phone-shaped widget |

## Widget Identity

The backend generates an `objectID` for each first presentation and reuses it when the managed
widget is presented again.

This is needed because the rendered widget is not just a path mention. It needs a stable, opaque handle for:

- iframe runtime URL
- transcript rehydration after app restart
- library listing
- fullscreen open
- source inspection
- future state storage keyed to a managed widget
- source-versioned runtime URLs after the original source has been adopted

`objectID` is a normalized Buddy object identity and is also the handle used by
`present_object`; it is not a learner-facing filename or an ID the model invents.

## Current managed-object storage

Store an adopted widget under the workspace's managed object root:

```text
.buddy/objects/v1/html-widget/
  <objectID>/
    object.json
    source/
      <entryPath>
      ...contained assets...
```

The common `object.json` manifest carries `kind: "html-widget"`, `objectID`, status/lifecycle,
origin, source references, and views. Its kind-owned summary contains `entryPath`,
`viewportPreset`, the current `sourceVersion`, and warning strings. The returned object result
uses a ref shaped like `{ kind: "html-widget", objectID, revisionID: null, itemID: null }`.

Current source and runtime endpoints are:

- `GET /api/objects/html-widget/<objectID>/source?directory=<workspace>&path=<entryPath>`
- `/api/objects/html-widget/runtime/<directoryToken>/<objectID>/<versionToken>/<entryPath>`

The runtime URL is built by `packages/buddy/src/learning/features/html-widgets/service/store.ts`;
the object and source routes are in `packages/buddy/src/routes/object-html-widget.ts`.

## Historical artifacts-era storage proposal (not live)

The following `.buddy/artifacts`/`artifactID` shape is retained as design history and migration
rationale. The current implementation does not write these paths or emit this metadata shape.

Store snapshots under the workspace:

```text
.buddy/artifacts/html-widget/
  <artifactID>/
    manifest.json
    index.html
```

Suggested manifest:

```ts
type HtmlWidgetManifest = {
  version: 1
  artifactID: string
  kind: "html-widget"
  title: string
  description?: string
  origin: {
    sessionID: string
    messageID: string
    callID: string
  }
  sourceHash: string
  summary: {
    viewport: {
      preset: "compact_4_3" | "standard_16_10" | "wide_16_9" | "square" | "tall_mobile"
      width: number
      height: number
      label: string
    }
    sourcePath?: string
    warnings: Array<{
      code: "relative_asset_reference" | "blocked_remote_reference"
      message: string
    }>
  }
  createdAt: string
  updatedAt: string
}
```

Historical artifacts-era tool metadata:

```ts
type PresentHtmlWidgetOutput = {
  artifactID: string
  kind: "html-widget"
  title: string
  description?: string
  viewport: {
    preset: "compact_4_3" | "standard_16_10" | "wide_16_9" | "square" | "tall_mobile"
    width: number
    height: number
    label: string
  }
  runtimeUrl: string
  sourceUrl: string
  sourceHash: string
  sourcePath?: string
  warnings: Array<{
    code: "relative_asset_reference" | "blocked_remote_reference"
    message: string
  }>
}
```

The historical proposal rendered from a snapshotted `index.html`, not the mutable source file.
That immutability is not the current managed-object behavior; per-presentation revisions remain
deferred.

## Current edit model

The edit model is source-file based, with the managed object becoming the source owner after the
first presentation.

Flow:

1. Buddy creates a workspace-contained HTML file or folder.
2. `present_path` adopts (moves) it into the object's `.buddy/objects/v1/html-widget/<objectID>/source/` tree.
3. The tool returns `source_root` and `edit_path`; later file edits target that managed path.
4. Buddy calls `present_object` with the returned `objectID` after an edit.
5. Buddy serves the current managed source tree. The source version changes with the tree, but
   the object ID is reused and transcript data is not an immutable per-presentation revision.

Object revision/history and source-path grouping can be added later if the library needs them.

## Runtime Boundary

Render widgets in a sandboxed iframe (shipped on transcript, Bench, and related frames):

```html
<iframe
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
/>
```

The iframe does not include `allow-same-origin`. That gives the widget an opaque origin and prevents it from reading host DOM, app storage, cookies, or Electron preload globals.

Sources: `packages/web/src/components/media/renderers/html-widget-frame.tsx`,
`packages/web/src/components/bench/surfaces/object-bench-surface.tsx`.

### Shipped Content-Security-Policy

The runtime route sets `Content-Security-Policy` to `HTML_WIDGET_RUNTIME_CSP` in
`packages/buddy/src/learning/features/html-widgets/service/types.ts`, applied by
`packages/buddy/src/routes/object-html-widget.ts`. Tests assert the header equals that constant
(`packages/buddy/test/html-widgets/html-widgets.test.ts`).

Shipped value (joined with `"; "`):

```text
default-src 'none';
sandbox allow-scripts;
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
media-src 'self' data: blob:;
frame-src 'none';
base-uri 'none';
form-action 'none';
navigate-to 'none';
```

**Decision consequence of `connect-src 'self'`:** same-origin fetches to the widget runtime host
are allowed. This is **not** `connect-src 'none'`. Arbitrary third-party network is still blocked
by `default-src 'none'` plus the explicit connect list, but same-origin `connect-src` is a weaker
default than the original lock. `'self'` on script/style/img/font/media matches serving the
snapshot from Buddy's runtime origin. `sandbox allow-scripts` is duplicated in CSP in addition to
the iframe `sandbox` attribute. `navigate-to 'none'` blocks top-level navigation from the widget
document.

### Original v1 CSP lock (intent, not current header)

The design originally locked a stricter policy that blocked all network, including same-origin
connects, and omitted `'self'` and `navigate-to`:

```text
default-src 'none';
script-src 'unsafe-inline';
style-src 'unsafe-inline';
img-src data: blob:;
font-src data:;
connect-src 'none';
media-src data: blob:;
frame-src 'none';
base-uri 'none';
form-action 'none';
```

That string is **historical intent**. Do not document it as the live header. The security rationale
that remains: no `allow-same-origin`, no remote script/style, no forms, no nested frames, and the
managed source is served through Buddy's runtime rather than injected into host DOM.

## Risk Read

| Risk | Read | Proposed decision |
| --- | --- | --- |
| Widget JS can touch Buddy internals | Low if iframe has no `allow-same-origin` and no preload bridge | Use sandboxed iframe and test host isolation |
| Widget JS can hang the UI with an infinite loop | Medium | Accept for dogfooding or move to isolated Electron renderer before broader release |
| External dependencies make widgets unreliable offline | Medium | Original lock blocked all network (`connect-src 'none'`). Shipped CSP uses `connect-src 'self'` — see Runtime Boundary |
| Rich assets can be missing from an adopted source tree | Medium | Folder adoption serves contained assets; broader packaging diagnostics remain deferred |
| Library fills with near-duplicate edits | Medium | Re-presenting reuses a managed object; add source grouping or revision history if usage requires it |
| Learner answers inside widgets disappear on reload | Medium | Keep state ephemeral first; add host messaging later |
| Generated UI quality varies | Medium | Use a short `html-widget-authoring` skill with concrete constraints |

The main unresolved runtime risk is CPU isolation. A sandboxed iframe protects data boundaries, but it may still share enough renderer execution with Buddy to freeze the app on bad JavaScript. If broader release needs stronger reliability, the widget viewer should move into a separate Electron renderer surface. That is a bigger implementation, but it is the correct escalation path.

## Validation

`present_html_widget` validates the source before adoption (`packages/buddy/src/learning/features/html-widgets/service/store.ts`):

- local readable HTML file or folder with an HTML entry file
- `.html` or `.htm` extension
- UTF-8 text
- non-empty content
- source-size cap (`MAX_HTML_WIDGET_SOURCE_BYTES` = 1_000_000 in `types.ts`)
- contained source tree and safe relative entry paths
- warnings for relative assets that may not exist in the managed widget source tree
- warnings for remote URLs that CSP will block

The validator should not strip `<script>`. Script is part of the feature. Safety comes from the runtime boundary, not from pretending arbitrary HTML can be rewritten into safe host DOM.

## Frontend Behavior

The transcript card should behave like a lightweight managed-object card:

- title
- description when present
- stable iframe preview area
- preview scaling that preserves the declared iframe viewport instead of silently changing its internal layout size
- fullscreen recommendation when the declared viewport is too large for a useful inline preview
- loading state
- runtime error or blocked-content hints when detectable
- reload action
- fullscreen action
- copy source action
- open the managed source file when the returned `edit_path` exists

The iframe should mount lazily when visible. A transcript with several widgets should not eagerly run all of them.

## Library Behavior

Add widgets to the library as a collectible managed-object type.

The library should show metadata first, not run every widget inline. Opening a widget can use the same fullscreen viewer as the transcript card.

Useful fields:

- title
- description
- created time
- source path basename
- originating session when available

## Deferred Questions

1. Whether CPU containment needs a separate Electron renderer process before broad release.
2. Whether Buddy should default source files to `.buddy/html-widget-sources/...` or visible lesson folders.
3. Whether the library should expose source-version history or group repeated presentations by source file after usage creates enough duplicates.
4. Whether remote images should remain blocked with all other network access or move to a narrow `img-src https:` exception.
5. How soon quiz-like widgets need persisted learner state.
6. Whether widgets eventually need a focused workspace route like whiteboard/reading mode.

## Current Best Answer

Build the smallest durable version that proves the product loop:

- file-first authoring
- `present_html_widget`
- managed source objects with a stable backend-owned `objectID`
- per-presentation immutable revisions deferred; `sourceVersion` tracks the current source tree
- constrained viewport presets with resolved dimensions
- sandboxed iframe rendering
- CSP as `HTML_WIDGET_RUNTIME_CSP` (`connect-src 'self'`, not `'none'`)
- transcript card
- fullscreen view
- library collection

That gives Buddy the flexible browser canvas without creating a second frontend framework, a custom widget edit protocol, or a premature app runtime.

## Appendix: Paths Not Chosen In This Design

### Raw HTML String Tool

A tool shaped like this is not selected:

```ts
create_html_widget({
  title: string,
  html: string,
})
```

Reason: large HTML/CSS/JS is awkward inside JSON tool calls, harder to incrementally edit, harder to inspect as a file, and duplicates existing file editing strengths.

### Buddy React Component Generation

Generating Buddy React components is not selected for the first version.

Reason: it would require a stable component import surface, a compile step, runtime protection for generated TSX, and compatibility with internal UI changes. Single-file HTML is more portable and better matched to one-off teaching widgets.

### Mutable Widget Checkpoints

Whiteboard-style checkpointing is not selected for the first version.

Historical reason: widgets are code files, and the original proposal favored editing the source
file and presenting a new immutable snapshot. The shipped edit model instead reuses a managed
object and `objectID`; checkpoint/revision history can be added later if widgets become long-lived
editable surfaces.

## Appendix: Raw Brainstorm Inputs To Preserve

- Buddy already renders Mermaid, SVGs, images, freeform figures, and whiteboards.
- Excalidraw is effectively model-generated JSON rendered by an embedded tool.
- Modern models are strong at code, so Buddy may be underusing them by forcing every visual artifact through narrow schemas.
- A single HTML file can include styling and JavaScript without needing a backend.
- Buddy should be able to create one-off mini-apps for explaining concepts to children.
- Example use cases include custom quizzes, animated explanations, moving objects on screen, simulations, and visual teaching widgets.
- Widgets should be shown in the chat transcript with fullscreen support.
- Widgets should be collectible in the library like Mermaid diagrams.
- The flexible option is raw browser code with boundaries.
- Because Buddy ships in Electron/Chromium, browser-native widgets should work consistently.
- The historical design considered mutable whiteboard-style edits versus new Mermaid-like snapshots; the shipped implementation adopts a managed source tree and reuses its `objectID`.
- If file editing is strong, Buddy does not need a special widget editing tool.
- Multiple widgets in one chat may eventually live in one session-level place where the child can revisit them.
- These bullets were brainstorm inputs used to lock the design; the feature is now shipped.
