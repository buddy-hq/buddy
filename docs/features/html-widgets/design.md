# HTML App Widgets

## Recommendation

Buddy should add HTML app widgets as a first-class teaching artifact: small, self-contained browser experiences that Buddy can create during a lesson and show to the learner in chat, fullscreen, and the library.

The first product shape should be file-first:

1. Buddy writes or edits a normal local `.html` file with existing file tools.
2. Buddy calls `present_html_widget` with the file path, learner-facing title, and closest viewport preset.
3. The backend snapshots that file into a durable widget artifact.
4. The frontend renders the snapshot in a sandboxed browser frame.
5. If Buddy later changes the widget, it edits the source file and presents a new snapshot.

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

This is feasible in the current architecture if the first version stays file-first and sandboxed.

Buddy already has the required building blocks:

| Need | Existing precedent |
| --- | --- |
| model-visible presentation tool | `present_media`, `render_mermaid`, whiteboard tools |
| durable local artifact storage | Mermaid, question sets, presented media |
| transcript card renderer | Mermaid, present media, saved question sets |
| fullscreen artifact view | Mermaid |
| library collection | Mermaid, question sets, flashcards, resources |
| browser runtime | Electron ships Chromium on macOS and Windows |

The code generation side is not the concern. Modern models can produce useful single-file HTML. The design risk is in product boundaries and runtime isolation.

## Decisions To Lock

1. Add an `html-widgets` Buddy feature.
2. Use a file-first authoring flow.
3. Add one model-visible presentation tool: `present_html_widget`.
4. `present_html_widget` snapshots an existing local HTML file; it does not accept HTML source as a string.
5. Each successful presentation creates an immutable widget snapshot.
6. Edited widgets are presented again as a new snapshot. V1 does not mutate a prior transcript widget in place.
7. Use a backend-owned `artifactID` as the stable snapshot handle.
8. Treat `artifactID` like other normalized Buddy artifact IDs: returned in metadata for rendering and library lookup, not something the model needs to manage for ordinary edits.
9. Render snapshots in a sandboxed iframe first, with explicit risk tracking for CPU hangs.
10. Block network access by default.
11. Use inline CSS and JavaScript by default.
12. Collect widgets in the library.
13. Render widgets inline in the transcript with fullscreen support.
14. Keep learner interaction state ephemeral in the first version.
15. Ask the model for a constrained viewport preset, not arbitrary dimensions. Store the resolved width and height in the snapshot manifest so the frontend can preserve the intended iframe viewport while scaling the preview to fit.

## Tool Contract

The model-facing tool should stay small:

```ts
present_html_widget({
  path: string,
  title: string,
  description?: string,
  viewportPreset:
    | "compact_4_3"
    | "standard_16_10"
    | "wide_16_9"
    | "square"
    | "tall_mobile",
})
```

The tool should:

- resolve the path using the same local path rules as `present_media`
- validate that the file is readable HTML
- record the intended viewport preset and resolved dimensions
- snapshot the file into Buddy's artifact storage
- return a structured metadata payload
- make the widget available in chat and the library

The tool should not:

- edit the widget
- accept raw HTML source
- ask the model for a snapshot ID
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

The backend should generate an `artifactID` for each presented snapshot.

This is needed because the rendered widget is not just a path mention. It needs a stable, opaque handle for:

- iframe runtime URL
- transcript rehydration after app restart
- library listing
- fullscreen open
- source inspection
- future state storage keyed to a specific snapshot
- stable rendering after the original source file changes or is deleted

This is not checkpointing. It is not an edit handle. It is a normalized Buddy artifact identity; the model does not manage it for ordinary edits.

## Storage Model

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

Suggested tool metadata:

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

The transcript renders from the snapshotted `index.html`, not the mutable source file. If Buddy edits the source file later, that old transcript card remains stable and a new `present_html_widget` call creates a new snapshot.

## Edit Model

The edit model is source-file based, not artifact based.

Flow:

1. Buddy creates a source file, for example `.buddy/html-widget-sources/fractions/index.html`.
2. Buddy presents it.
3. The learner asks for a change.
4. Buddy edits the source file.
5. Buddy presents the edited file again.

The old widget remains in the transcript because it represents what was shown at that moment. The library can show multiple snapshots initially. If that gets noisy, a later design can add source-path grouping or supersession, but the current model does not need a model-facing update handle.

## Runtime Boundary

Render widgets in a sandboxed iframe:

```html
<iframe
  sandbox="allow-scripts"
  referrerpolicy="no-referrer"
/>
```

The iframe should not include `allow-same-origin` in the first version. That gives the widget an opaque origin and prevents it from reading host DOM, app storage, cookies, or Electron preload globals.

The runtime route should serve the snapshot with a restrictive CSP:

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

This allows inline interactivity while blocking remote scripts, remote stylesheets, fetches, forms, nested frames, and external navigation.

## Risk Read

| Risk | Read | Proposed decision |
| --- | --- | --- |
| Widget JS can touch Buddy internals | Low if iframe has no `allow-same-origin` and no preload bridge | Use sandboxed iframe and test host isolation |
| Widget JS can hang the UI with an infinite loop | Medium | Accept for dogfooding or move to isolated Electron renderer before broader release |
| External dependencies make widgets unreliable offline | Medium | Block network in first version |
| Single-file HTML limits richer assets | Medium | Accept first; add explicit bundled asset support later if needed |
| Library fills with near-duplicate edits | Medium | Start with snapshots; add grouping/supersession after observing usage |
| Learner answers inside widgets disappear on reload | Medium | Keep state ephemeral first; add host messaging later |
| Generated UI quality varies | Medium | Use a short `html-widget-authoring` skill with concrete constraints |

The main unresolved runtime risk is CPU isolation. A sandboxed iframe protects data boundaries, but it may still share enough renderer execution with Buddy to freeze the app on bad JavaScript. If we want stronger reliability before shipping, the widget viewer should move into a separate Electron renderer surface. That is a bigger implementation, but it is the correct escalation path.

## Validation

`present_html_widget` should validate the source before snapshotting:

- local readable file
- `.html` or `.htm` extension
- UTF-8 text
- non-empty content
- source-size cap
- no folder snapshotting
- warnings for relative assets that will not be copied
- warnings for remote URLs that CSP will block

The validator should not strip `<script>`. Script is part of the feature. Safety comes from the runtime boundary, not from pretending arbitrary HTML can be rewritten into safe host DOM.

## Frontend Behavior

The transcript card should behave like a lightweight Mermaid-style artifact card:

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
- open source file action when `sourcePath` exists

The iframe should mount lazily when visible. A transcript with several widgets should not eagerly run all of them.

## Library Behavior

Add widgets to the library as a collectible artifact type.

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
3. Whether the library should group snapshots by source file after usage creates enough duplicates.
4. Whether remote images should remain blocked with all other network access or move to a narrow `img-src https:` exception.
5. How soon quiz-like widgets need persisted learner state.
6. Whether widgets eventually need a focused workspace route like whiteboard/reading mode.

## Current Best Answer

Build the smallest durable version that proves the product loop:

- file-first authoring
- `present_html_widget`
- immutable snapshots
- backend-owned `artifactID`
- constrained viewport presets with resolved dimensions
- sandboxed iframe rendering
- no network by default
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

Reason: widgets are code files. The simplest correct edit model is to edit the source file and present a new immutable snapshot. A checkpoint model can be added later only if widgets become long-lived editable surfaces.

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
- Edits could have been mutable like whiteboard or generated one after another like Mermaid; this design chooses immutable snapshots from source files.
- If file editing is strong, Buddy does not need a special widget editing tool.
- Multiple widgets in one chat may eventually live in one session-level place where the child can revisit them.
- This is currently a brainstorm and design-locking pass, not an implementation request.
