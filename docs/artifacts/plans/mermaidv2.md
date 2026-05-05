# Mermaid Rendering v2 Phased Implementation Plan

## Goal

Replace Buddy's Mermaid system with a browser-authoritative renderer while keeping the app working at every phase.

The final system must satisfy these exit criteria:

- Mermaid diagrams render inline inside an interactive card with pan, zoom in/out, fit/reset, fullscreen, source copy, and SVG download.
- Diagrams adapt to the active Buddy theme.
- Diagrams do not have known light-on-light or dark-on-dark text contrast failures.
- Small patterned syntax failures are repaired deterministically before browser render.
- Browser render success/failure is the only render authority.
- Failed diagrams get exactly one automatic AI repair attempt.
- After the one auto attempt fails or is ineligible, the card shows a manual "Ask AI to fix" button.
- Chat assistant raw fenced `mermaid` markdown uses the same artifact/render/error/repair path as `render_mermaid` tool diagrams.

## Architecture Decision: No New Package

Do not create `packages/mermaid`.

The earlier package idea existed only to share deterministic preflight/hash code between backend and frontend. That adds package boundary overhead and confused implementation sequencing. Use this design instead:

- `packages/buddy` owns Mermaid source artifacts, deterministic preflight, source hashes, artifact ids, render-record persistence, and AI repair state.
- `packages/web` owns browser rendering, theme signature calculation, SVG sanitization, SVG contrast normalization, pan/zoom UI, fullscreen, and download.
- The backend/frontend contract is the typed SDK generated from backend OpenAPI.
- The frontend does not need to run deterministic preflight for chat/tool artifacts because every first-class Mermaid diagram is created as a backend artifact before rendering.

This keeps Mermaid "part of Buddy" without a new workspace package and avoids duplicating the repair pipeline in the browser.

## Non-Negotiable Rules

- Do not patch `vendor/**`.
- Do not hand-edit `packages/sdk/src/gen/**`; run `bun run sdk:generate`.
- In `packages/web`, use the generated SDK through `getBuddyClient(directory)`. Do not add manual fetch helpers.
- Use `type`, not `interface`, for new TypeScript types.
- Do not use `any`; use `unknown`, zod, and type guards.
- Do not preserve v1 behavior after the final phase. During early phases, keep v1 working only to reduce rollout risk.
- Do not put AI repair under `mermaid-artifacts`; artifact routes store/read data only.
- Do not use backend Mermaid parser validation as success authority.
- Do not keep the raw markdown imperative placeholder enhancer in the final system.

## Phase Rules

- Implement phases in order.
- Do not start a later phase until the current phase exit criteria pass.
- Each phase must leave the app able to render Mermaid diagrams at least as well as before that phase.
- Each phase should have its own small commit.
- If a phase fails verification, stop and fix that phase before proceeding.

---

## Phase 1: Backend V2 Foundation Behind Existing UI

### Purpose

Add v2 artifact storage, deterministic preflight, render-record storage, and tests without switching the visible frontend/tool path yet. This reduces risk by making backend data behavior testable before the UI depends on it.

### Files To Change

Add:

- `packages/buddy/src/learning/features/diagrams/service/v2-types.ts`
- `packages/buddy/src/learning/features/diagrams/service/v2-path.ts`
- `packages/buddy/src/learning/features/diagrams/service/v2-preflight.ts`
- `packages/buddy/src/learning/features/diagrams/service/v2-store.ts`
- `packages/buddy/test/mermaid/preflight.test.ts`
- `packages/buddy/test/mermaid/v2-store.test.ts`

Do not remove v1 files yet.

### V2 Types

Define zod schemas and exported types in `v2-types.ts`.

```ts
type MermaidArtifactKind = "mermaid.v2"

type MermaidArtifactOrigin =
  | {
      kind: "tool"
      sessionID: string
      messageID: string
      callID: string
    }
  | {
      kind: "markdown"
      sessionID: string
      messageID: string
      partID: string
      segmentIndex: number
    }

type MermaidPreflightRepairCode =
  | "stripped_fence"
  | "trimmed_wrapping_prose"
  | "removed_duplicate_mermaid_marker"
  | "normalized_smart_punctuation"
  | "normalized_unicode_arrow"
  | "canonicalized_header"
  | "quoted_er_relationship_label"
  | "converted_flowchart_single_quoted_label"
  | "renamed_subgraph_node_collision"
  | "normalized_timeline_period"
  | "removed_trailing_xychart_connector"

type MermaidPreflightRepair = {
  code: MermaidPreflightRepairCode
  message: string
}

type MermaidAutoRepairState =
  | { status: "not_needed" | "eligible"; attempts: number }
  | { status: "running"; attempts: number; repairRequestID: string; failedRenderKey: string }
  | { status: "succeeded"; attempts: number; replacementArtifactID: string }
  | { status: "exhausted"; attempts: number; lastErrorMessage: string }

type MermaidArtifactManifest = {
  version: 2
  artifactID: string
  kind: "mermaid.v2"
  origin: MermaidArtifactOrigin
  diagramType: string
  alt: string
  caption?: string
  sourceHash: string
  preflightRepairs: MermaidPreflightRepair[]
  autoRepair: MermaidAutoRepairState
  createdAt: string
  updatedAt: string
  supersedesArtifactID?: string
}

type MermaidRenderRecord =
  | {
      renderKey: string
      artifactID: string
      sourceHash: string
      status: "rendered"
      svg: string
      contrastAdjustments: Array<{
        selector: string
        property: "fill" | "color" | "stroke"
        from: string
        to: string
        reason: string
      }>
      rendererName: "mermaid"
      rendererVersion: string
      renderConfigVersion: number
      themeSignature: string
      renderedAt: string
    }
  | {
      renderKey: string
      artifactID: string
      sourceHash: string
      status: "failed"
      errorMessage: string
      rendererName: "mermaid"
      rendererVersion: string
      renderConfigVersion: number
      themeSignature: string
      renderedAt: string
    }
```

Constants:

```ts
const MERMAID_ARTIFACT_KIND = "mermaid.v2" as const
const MERMAID_RENDERER_NAME = "mermaid" as const
const MERMAID_RENDER_CONFIG_VERSION = 1
const MAX_MERMAID_AUTO_REPAIR_ATTEMPTS = 1
const MERMAID_AUTO_REPAIR_TIMEOUT_MS = 120_000
const MERMAID_AUTO_REPAIR_POLL_INTERVAL_MS = 1_000
const MERMAID_RENDER_CONCURRENCY = 1
const MERMAID_STREAM_STABLE_DELAY_MS = 600
const MERMAID_AUTO_REPAIR_MESSAGE_ID_PREFIX = "buddy_mermaid_auto_repair_"
```

### Storage Layout

Implement in `v2-path.ts`:

```text
.buddy/mermaid-artifacts-v2/
  <artifactID>/
    manifest.json
    source.mmd
    renders/
      <renderKey>.json
  _repair-requests/
    <repairRequestID>.json
```

Rules:

- `artifactID` and `renderKey` must match `/^[a-f0-9]{64}$/u`.
- `repairRequestID` must start with `buddy_mermaid_auto_repair_` and contain only `[A-Za-z0-9_-]`.
- Ignore `_repair-requests` in artifact lists.
- Ignore invalid artifact directories instead of crashing the whole list.
- Write JSON atomically: write temp file then rename.

### Backend Hash Algorithms

Implement in `v2-store.ts`.

Source hash:

```text
sha256(normalizedSource)
```

Tool artifact id:

```text
sha256("mermaid.v2:tool:" + sessionID + ":" + messageID + ":" + callID + ":" + createdAt + ":" + sourceHash)
```

Markdown artifact id:

```text
sha256("mermaid.v2:markdown:" + sessionID + ":" + messageID + ":" + partID + ":" + segmentIndex + ":" + sourceHash)
```

Render key:

```text
sha256("mermaid-render:" + sourceHash + ":mermaid:" + rendererVersion + ":" + renderConfigVersion + ":" + themeSignature)
```

Notes:

- Backend owns artifact ids and render keys.
- Frontend sends `themeSignature`, `rendererVersion`, and `renderConfigVersion`.
- Backend computes the `renderKey`.
- Frontend does not need to duplicate SHA-256 render-key logic.

### Deterministic Preflight Algorithm

Implement `preflightMermaidSource(source: string)` in `v2-preflight.ts`.

Normalization:

1. Remove BOM.
2. Normalize CRLF/CR to LF.
3. Replace tabs with two spaces.
4. Strip trailing horizontal whitespace from each line.
5. Preserve internal blank lines.

Transforms, in exact order:

1. Extract one Mermaid fenced block from surrounding prose.
2. Strip surrounding code fence.
3. Remove duplicate fence lines.
4. Remove duplicate leading `mermaid` marker lines.
5. Canonicalize diagram header aliases such as `quadrant-chart` to `quadrantChart`.
6. Normalize smart quotes/dashes.
7. Normalize unicode arrows to Mermaid arrows.
8. Quote ER relationship labels after `:`.
9. Convert flowchart single-quoted labels to double-quoted labels.
10. Rename deterministic subgraph/node id collisions.
11. Normalize timeline quoted/colon period labels.
12. Remove trailing xychart connectors.
13. Trim prose before/after the diagram block.
14. Final normalization and blank boundary trim.

Required fixes:

- `erDiagram` line `A ||--o| B : one to many` becomes `A ||--o| B : "one to many"`.
- `flowchart` label `Query['searchLearnerMemory(query)']` becomes `Query["searchLearnerMemory(query)"]`.
- In a `flowchart`, if `subgraph G6[...]` contains node `G6[...]`, rename the node to `G6_node[...]` and update deterministic node references.
- If subgraph/node reference ownership is ambiguous, do not guess. Leave source as-is and let browser render fail with a visible error.

Preflight rules:

- Deterministic.
- Idempotent.
- Does not call Mermaid.
- Does not claim source is valid.
- Returns `{ source, sourceHash, diagramType, repairs }`.

### V2 Store API

Implement these functions in `v2-store.ts`:

- `createToolMermaidArtifact(input)`
- `createMarkdownMermaidArtifact(input)`
- `readMermaidV2Artifact(directory, artifactID, input?: { renderKey?: string })`
- `listMermaidV2Artifacts(directory, input?: { includeSuperseded?: boolean })`
- `readMermaidV2RenderRecord(directory, artifactID, renderKey)`
- `resolveMermaidV2RenderRecord(directory, artifactID, input)`
- `storeMermaidV2RenderRecord(directory, artifactID, input)`
- `markMermaidV2ArtifactSuperseded(directory, oldArtifactID, replacementArtifactID)`
- `updateMermaidV2AutoRepairState(directory, artifactID, state)`

`resolveMermaidV2RenderRecord` returns:

```ts
type MermaidResolvedRenderRecord = {
  renderKey: string
  render?: MermaidRenderRecord
}
```

### Phase 1 Exit Criteria

- Existing app behavior is unchanged.
- `bun run --cwd packages/buddy test test/mermaid/preflight.test.ts test/mermaid/v2-store.test.ts` passes.
- Preflight fixtures cover ER labels, single-quoted flowchart labels, subgraph collision, and idempotence.
- V2 storage writes and reads artifact source, manifest, and render records.
- V1 files are still present and active; no frontend switch has happened.

---

## Phase 2: Tool Artifacts Use Browser-Authoritative V2 Rendering

### Purpose

Switch `render_mermaid` tool artifacts to v2 and render them in the browser, while preserving the existing interactive card behavior. Auto-repair and raw markdown can remain out of scope in this phase.

### Backend Files To Change

- `packages/buddy/src/learning/features/diagrams/tools/render-mermaid.ts`
- `packages/buddy/src/learning/features/diagrams/tools/render-mermaid.md`
- `packages/buddy/src/learning/features/diagrams/tools/render-mermaid.ideal.md`
- `packages/buddy/src/routes/mermaid-artifacts.ts`

Do not add a new service barrel file for v2. Import v2 helpers directly from their v2 service files unless an existing edited file already has a local convention that requires a re-export.

### Backend Route Contracts

Update `packages/buddy/src/routes/mermaid-artifacts.ts`.

Routes and operation IDs:

- `GET /api/mermaid-artifacts?directory=<dir>&includeSuperseded=false`, `mermaidArtifacts.list`
- `GET /api/mermaid-artifacts/:artifactID?directory=<dir>`, `mermaidArtifacts.read`
- `GET /api/mermaid-artifacts/:artifactID/render-record?directory=<dir>&themeSignature=<sig>&rendererVersion=<version>&renderConfigVersion=<n>`, `mermaidArtifacts.resolveRender`
- `PUT /api/mermaid-artifacts/:artifactID/render-record?directory=<dir>`, `mermaidArtifacts.storeRender`

Important route behavior:

- Backend never infers current theme.
- `resolveRender` computes `renderKey` from `sourceHash`, `themeSignature`, `rendererVersion`, and `renderConfigVersion`.
- `storeRender` computes the same `renderKey`, writes the record, and returns the full written record.
- `list` returns v2 artifacts only once the frontend is switched in this phase.
- `list` excludes superseded artifacts unless `includeSuperseded=true`.

### Tool Behavior

`render_mermaid` algorithm:

1. Parse `{ alt, caption?, source, repairOfArtifactID? }`.
2. Ask permission as current tool does.
3. Run `preflightMermaidSource`.
4. Create v2 artifact using `createToolMermaidArtifact`.
5. If `repairOfArtifactID` is present, verify old artifact exists in same workspace and set `supersedesArtifactID`.
6. Return metadata:

```ts
{
  artifact: "RenderMermaidOutput",
  value: {
    artifactID,
    kind: "mermaid.v2",
    mime: "application/vnd.buddy.mermaid",
    alt,
    caption,
    diagramType,
    source,
    sourceHash,
    preflightRepairs,
    artifactUrl,
    supersedesArtifactID
  }
}
```

7. Tool output text must say: `Mermaid diagram artifact created and queued for browser rendering.`
8. Do not say "rendered".
9. Do not call `validateMermaidSource`.
10. Do not use `@mermaid-js/parser`.

### Frontend Files To Change

- `packages/web/src/components/chat/tools/render/mermaid/lib/render.ts`
- `packages/web/src/components/chat/tools/render/mermaid/lib/loader.ts`
- `packages/web/src/components/chat/tools/render/mermaid/use-mermaid-render.ts`
- `packages/web/src/components/chat/tools/render/mermaid/mermaid-diagram.tsx`
- `packages/web/src/components/chat/tools/render/mermaid/index.tsx`
- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/i18n/en.ts`
- `packages/sdk/src/gen/**` via `bun run sdk:generate`

Add frontend render lib files:

- `packages/web/src/components/chat/tools/render/mermaid/lib/theme.ts`
- `packages/web/src/components/chat/tools/render/mermaid/lib/svg-sanitize.ts`
- `packages/web/src/components/chat/tools/render/mermaid/lib/persisted-renders.ts`

### Frontend Render Algorithm

1. Read artifact source from tool metadata or rehydrate by artifact id.
2. Read theme tokens:
   - `--background-base`
   - `--surface-base`
   - `--surface-raised-base`
   - `--surface-weak`
   - `--border-base`
   - `--text-base`
   - `--text-strong`
   - `--text-weak`
   - `--text-invert-base`
   - `--text-interactive-base`
3. Build `themeSignature` as a stable ordered JSON string of those token values. Do not hash it in frontend.
4. Call SDK `mermaidArtifacts.resolveRender`.
5. If it returns a rendered record, display it.
6. If it returns a failed record, display failed state; do not rerender until source/theme/config changes.
7. If no record exists, call `mermaid.render` in browser.
8. Sanitize SVG with SVG profile.
9. Store rendered or failed record through SDK `mermaidArtifacts.storeRender`.
10. Display the result in `MermaidDiagram`.

### Preserve Current Interactive Card

Do not regress these existing features:

- Inline pan/drag.
- Zoom in/out.
- Fit/reset.
- Fullscreen dialog.
- Source copy.
- SVG download.

### Phase 2 Exit Criteria

- `render_mermaid` tool diagrams render through browser v2 records.
- Backend no longer claims render success before browser render.
- A Mermaid syntax/render failure shows a failed card with source/error, not a blank "Diagram" card.
- Existing pan/zoom/fullscreen/copy/download controls still work.
- `bun run sdk:generate` has been run.
- `bun run --cwd packages/buddy test test/mermaid` passes.
- `bun run --cwd packages/web test test/mermaid-render.test.tsx` passes.
- The app can still create and view Mermaid diagrams from tool calls.

---

## Phase 3: Theme, Contrast, And Render Scheduling

### Purpose

Fix white-on-white/dark-on-dark output and prevent many shelf diagrams from blocking rendering.

### Files To Change

Add:

- `packages/web/src/components/chat/tools/render/mermaid/lib/svg-contrast.ts`
- `packages/web/src/components/chat/tools/render/mermaid/lib/scheduler.ts`

Update:

- `packages/web/src/components/chat/tools/render/mermaid/lib/render.ts`
- `packages/web/src/components/chat/tools/render/mermaid/lib/theme.ts`
- `packages/web/src/components/chat/tools/render/mermaid/mermaid-fullscreen-dialog.tsx`
- `packages/web/src/components/layout/workspace-mermaid-panel.tsx`
- `packages/web/src/components/layout/chat-left-sidebar/library-panel.tsx`

### Theme Rules

- Mermaid `themeVariables` are the first layer.
- They are not enough because Mermaid source can contain `style` and `classDef` rules that override theme variables.
- Keep current theme-variable mappings and add:
  - `primaryTextColor`
  - `secondaryTextColor`
  - `tertiaryTextColor`
  - `textColor`
  - `labelTextColor`
  - `actorTextColor`
  - `noteTextColor`
  - `edgeLabelBackground`

### Contrast Algorithm

Implement targeted SVG normalization, not a generic arbitrary SVG engine.

Color parser supports:

- `#rgb`
- `#rrggbb`
- `rgb(r,g,b)`
- `rgba(r,g,b,a)`
- `white`
- `black`
- `transparent`

WCAG contrast:

- Use relative luminance.
- Threshold is `4.5`.
- Candidate readable colors:
  - `--text-base`
  - `--text-strong`
  - `--text-invert-base`
  - `#111827`
  - `#ffffff`

Target groups:

- `g.node`
- `g.cluster`
- `g.edgeLabel`
- `g.label`
- `g.note`
- `g.actor`
- descendants with classes containing `nodeLabel`, `edgeLabel`, `label`, `actor`, `noteText`, `messageText`

Algorithm:

1. Find background from first descendant shape with fill: `rect`, `polygon`, `circle`, `ellipse`, or `path`.
2. If no background, use `--background-base`.
3. Find text descendants: `text`, `tspan`, and HTML label elements inside `foreignObject`.
4. Resolve current text color from inline `fill`, attribute `fill`, inline `color`, then theme fallback.
5. If parsed contrast is at least `4.5`, do nothing.
6. Otherwise choose candidate text color with highest contrast.
7. Set SVG text `fill` or HTML label `style.color`.
8. Add `data-buddy-contrast-adjusted="true"`.
9. Record `contrastAdjustments`.

Must fix:

- `style A fill:#fff,color:#fff`
- `classDef bad fill:#ffffff,color:#ffffff`
- light text on light node fill
- dark text on dark node fill
- fullscreen/card theme mismatch

### Scheduler Algorithm

- Mermaid runtime render concurrency is `1`.
- Deduplicate tasks by artifact id plus render metadata.
- Visible chat/tool cards priority `0`.
- Visible shelf cards priority `1`.
- No prefetch priority unless explicitly needed.
- Offscreen shelf cards must not enqueue renders.
- If source/theme/config changes before task resolves, ignore stale result.

### Phase 3 Exit Criteria

- White-on-white fixtures become readable.
- Theme switch changes render metadata and causes visible diagrams to rerender.
- Offscreen shelf items do not enqueue new renders on theme switch.
- Fullscreen diagram SVG uses the same normalized SVG as inline card.
- `bun run --cwd packages/web test test/mermaid-contrast.test.ts test/workspace-mermaid-panel.test.tsx` passes.
- Manual QA with a shelf of many diagrams does not freeze UI on theme switch.

---

## Phase 4: One-Attempt AI Auto-Repair

### Purpose

Add automatic repair only after browser render failure, using the existing session agent loop. Keep manual fix as fallback.

### Backend Files To Change

- `packages/buddy/src/routes/session.ts`
- `packages/buddy/src/session/orchestration/interaction-actions.ts`
- `packages/buddy/src/session/index.ts`
- `packages/buddy/src/learning/features/diagrams/service/v2-store.ts`
- `packages/buddy/src/learning/features/diagrams/tools/render-mermaid.ts`
- `packages/buddy/test/mermaid/repair-routes.test.ts`

### Routes

Add:

- `POST /api/session/:sessionID/mermaid-repair-async?directory=<dir>`, operationId `session.mermaidRepairAsync`
- `GET /api/session/:sessionID/mermaid-repair/:repairRequestID?directory=<dir>`, operationId `session.mermaidRepairStatus`

### Start Auto-Repair Algorithm

1. Resolve directory.
2. Assert session exists in directory.
3. Parse `{ artifactID, failedRenderKey }`.
4. Read artifact and failed render record.
5. Reject unless render record status is `failed`.
6. Reject unless artifact `sourceHash` equals failed render `sourceHash`.
7. Reject if `autoRepair.attempts >= 1`.
8. Create `repairRequestID` with prefix `buddy_mermaid_auto_repair_`.
9. Write repair request record under `_repair-requests`.
10. Update artifact `autoRepair` to running with `attempts: 1`.
11. Send synthetic prompt through the same `prompt_async` transform/proxy path as normal prompts.

Synthetic prompt:

````md
<buddy_internal_mermaid_auto_repair repairRequestID="{repairRequestID}" artifactID="{artifactID}" failedRenderKey="{failedRenderKey}">
The previous Mermaid diagram failed in the browser renderer.

Your task:
1. Fix the Mermaid source below.
2. Preserve the original intent, alt text, and caption.
3. Call render_mermaid exactly once.
4. Include repairOfArtifactID: "{artifactID}" in the render_mermaid call.
5. Do not answer with a visible explanation before calling render_mermaid.

Browser render error:
{errorMessage}

Source:
```mermaid
{source}
```
</buddy_internal_mermaid_auto_repair>
````

Use `messageID: repairRequestID`. Also include metadata:

```ts
{
  kind: "mermaid_auto_repair",
  artifactID,
  failedRenderKey,
  hiddenFromUser: true
}
```

### Complete Auto-Repair Algorithm

When `render_mermaid` is called with `repairOfArtifactID`:

1. Write replacement artifact.
2. Set replacement `supersedesArtifactID`.
3. If old artifact has running auto repair, mark request `succeeded`.
4. Set old artifact `autoRepair` to `{ status: "succeeded", attempts: 1, replacementArtifactID }`.

### Polling Algorithm

`GET /mermaid-repair/:repairRequestID`:

1. Return `running`, `succeeded`, or `exhausted`.
2. If request is past `expiresAt`, mark exhausted.
3. Exhausted message: `Automatic Mermaid repair timed out before a replacement diagram was created.`

### Frontend Files To Change

- `packages/web/src/components/chat/tools/render/mermaid/use-mermaid-render.ts`
- `packages/web/src/components/chat/tools/render/mermaid/mermaid-diagram.tsx`
- `packages/web/src/components/chat/tools/render/mermaid/index.tsx`
- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/components/chat/sections/user-section.tsx`
- `packages/web/src/components/chat/parts/user-message.tsx`
- `packages/web/src/i18n/en.ts`

Frontend behavior:

- Start auto-repair once after first persisted failed render.
- Show `Repairing diagram...` in the same card.
- Poll every `1_000ms`.
- Hide synthetic user message by message id prefix or prompt marker.
- Do not hide the assistant replacement tool call.
- If succeeded, collapse old card to `Replaced by newer diagram`.
- If exhausted/ineligible, show manual fix button.
- Manual fix prompt includes source, error, artifact id, failed render key, and `repairOfArtifactID`.

### Phase 4 Exit Criteria

- Failed diagram starts exactly one automatic repair.
- Second auto attempt is rejected.
- Synthetic repair user message is not shown in chat.
- Replacement artifact supersedes old failed artifact.
- Manual fix button appears only after auto repair fails/exhausts/is ineligible.
- `bun run sdk:generate` has been run.
- `bun run --cwd packages/buddy test test/mermaid/repair-routes.test.ts` passes.
- `bun run --cwd packages/web test test/mermaid-render.test.tsx` passes.

---

## Phase 5: Raw Chat Markdown Mermaid Uses Same Pipeline

### Purpose

Move raw fenced `mermaid` blocks in assistant chat text off the imperative placeholder enhancer and onto the same artifact/render/error/repair path.

### Backend Files To Change

- `packages/buddy/src/routes/mermaid-artifacts.ts`
- `packages/buddy/src/learning/features/diagrams/service/v2-store.ts`
- `packages/buddy/test/mermaid/inline-artifacts.test.ts`

Add route:

- `POST /api/mermaid-artifacts/inline?directory=<dir>`, operationId `mermaidArtifacts.createInline`

Body:

```ts
type CreateInlineMermaidArtifactInput = {
  sessionID: string
  messageID: string
  partID: string
  segmentIndex: number
  source: string
  alt?: string
  caption?: string
}
```

Behavior:

- Assert session exists in directory.
- Run backend preflight.
- Use deterministic markdown artifact id.
- Return existing artifact if same id already exists.
- Default alt is `Mermaid diagram`.

### Frontend Files To Change

Add:

- `packages/web/src/components/markdown/markdown-segments.ts`
- `packages/web/src/components/markdown/markdown-html-segment.tsx`
- `packages/web/src/components/markdown/markdown-mermaid-segment.tsx`

Update:

- `packages/web/src/components/markdown/Markdown.tsx`
- `packages/web/src/components/markdown/markdown-parser.ts`
- `packages/web/src/components/chat/types.ts`
- `packages/web/src/components/chat/hooks/use-assistant-derived-state.ts`
- `packages/web/src/components/chat/sections/assistant-section.tsx`
- `packages/web/src/components/chat/parts/assistant-part/assistant-part.tsx`
- `packages/web/src/components/chat/parts/assistant-part/text-part.tsx`
- `packages/web/src/state/chat-actions.ts`

### Segment Parser Algorithm

Parse markdown into:

```ts
type MarkdownSegment =
  | { kind: "html"; markdown: string; segmentIndex: number }
  | { kind: "mermaid"; source: string; raw: string; segmentIndex: number }
```

Rules:

- Opening fence: `/^ {0,3}(`{3,}|~{3,})[ \t]*mermaid(?:[ \t].*)?$/iu`
- Closing fence must use same fence char and at least same length.
- Unclosed fence remains HTML/code text and does not render Mermaid.
- Closed fence becomes Mermaid segment.
- Empty HTML segments are omitted.
- Segment indices are source-order stable.
- Mermaid segment React key is exactly `${cacheKey}:mermaid:${segmentIndex}`.
- Source changes are handled by props/effects inside the Mermaid segment component, not by changing the React key.

Streaming rules:

- During streaming, do not render unclosed fences.
- Closed fences render only after `600ms` without source changes or when `isStreaming=false`.
- Appending text after a completed Mermaid segment must not remount that segment.

### Markdown Rendering Rules

- Messages without Mermaid keep the existing single-root morphdom fast path.
- Messages with Mermaid render fragments:
  - HTML segments use the current marked/DOMPurify/morphdom/code-copy/KaTeX/Shiki path.
  - Mermaid segments create inline artifacts then render `MermaidDiagram`.
- Remove `enhanceMermaidPlaceholders` and `data-buddy-mermaid-placeholder`.

### Chat Context Threading

Pass this context to `Markdown` only for assistant chat text:

```ts
type MarkdownMermaidContext = {
  directory: string
  sessionID: string
  messageID: string
  partID: string
}
```

Implementation steps:

1. Update assistant derived state so each part knows its parent message id/session id.
2. Pass `directory`, `sessionID`, `messageID`, `partID` to `AssistantTextPart`.
3. `AssistantTextPart` passes `mermaidContext` to `Markdown`.
4. Reasoning, settings, hidden summaries, and generic tool-output markdown do not need first-class Mermaid artifacts in this phase.

### Phase 5 Exit Criteria

- Raw assistant chat ```mermaid blocks render as `MermaidDiagram`.
- Raw assistant chat Mermaid blocks use backend preflight through inline artifact route.
- Raw assistant chat Mermaid failures get the same failed UI and one-attempt auto repair.
- Unclosed streaming fences do not invoke Mermaid.
- Non-Mermaid markdown keeps the old fast path.
- `bun run sdk:generate` has been run.
- `bun run --cwd packages/buddy test test/mermaid/inline-artifacts.test.ts` passes.
- `bun run --cwd packages/web test test/markdown-mermaid-segments.test.tsx` passes.

---

## Phase 6: Shelves, Supersession, And Cleanup

### Purpose

Finish workspace/library behavior and remove obsolete v1 Mermaid code.

### Files To Change

- `packages/web/src/components/layout/workspace-mermaid-panel.tsx`
- `packages/web/src/components/layout/chat-left-sidebar/library-panel.tsx`
- `packages/web/src/state/workspace-artifacts-query.ts`
- `packages/buddy/src/learning/features/diagrams/service/repair.ts`
- `packages/buddy/src/learning/features/diagrams/service/validate.ts`
- `packages/buddy/package.json`
- `packages/web/src/i18n/en.ts`

### Shelf Rules

- List v2 artifacts only.
- Hide superseded artifacts by default.
- Render visible cards only.
- Retained offscreen cards may keep existing rendered SVG but must not enqueue a fresh render on theme switch.
- Query invalidation on chat idle remains.

### Cleanup Rules

- Delete or fully disconnect v1 validation as active code.
- Remove `@mermaid-js/parser` if no imports remain.
- Delete old raw markdown Mermaid placeholder enhancer.
- Keep old `.buddy/mermaid-artifacts` files ignored; do not migrate them.

### Phase 6 Exit Criteria

- Workspace shelf shows v2 diagrams only.
- Superseded failed diagrams are hidden/collapsed.
- Theme switch does not enqueue offscreen shelf renders.
- No active frontend/backend code depends on `mermaid.v1`.
- `rg "mermaid.v1|@mermaid-js/parser|enhanceMermaidPlaceholders|data-buddy-mermaid-placeholder" packages/buddy/src packages/web/src` finds no active code references.
- `bun run --cwd packages/web test test/workspace-mermaid-panel.test.tsx` passes.

---

## Final Verification

Run after Phase 6:

```sh
bun run sdk:generate
bun run --cwd packages/buddy test test/mermaid
bun run --cwd packages/web test test/mermaid-render.test.tsx test/mermaid-contrast.test.ts test/markdown-mermaid-segments.test.tsx test/workspace-mermaid-panel.test.tsx
bun fmt
bun lint
bun typecheck
```

The implementation is not complete unless every command passes.

## Final Manual QA

- Render the ER example: `A ||--o| B : one to many`; it should preflight to quoted labels and render.
- Render the `G6` subgraph collision example; it should preflight or fail visibly with source/error, never blank.
- Render single-quoted flowchart labels such as `Query['searchLearnerMemory(query)']`; they should preflight and render.
- Render `style A fill:#fff,color:#fff`; text should become readable.
- Render `classDef bad fill:#ffffff,color:#ffffff`; text should become readable.
- Switch light/dark theme with many diagrams in the shelf; visible diagrams update without freezing UI.
- Fullscreen pan/zoom works.
- Downloaded SVG contains contrast-normalized SVG.
- Auto-repair happens once, then manual button appears if it fails.
- Raw assistant chat ```mermaid block uses the same card and repair flow as a tool-created diagram.
