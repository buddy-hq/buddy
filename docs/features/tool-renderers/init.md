## Situation
- The old chat tool UI mixed a summary area (title + body), inline cards, and tools that sat in the summary with no summary. Mermaid/figure-style parts broke the summary block by going inline. Expanding the summary during generation showed collapsed steps.

## Complication
- That mix was hard to reason about. The product direction was one linear timeline.

## Suggestions (original)
- One linear timeline.
- Thinking collapsed by default, shimmer, expand on click.
- Keep aggregating repeated tools (historical example: `Thought, Ran 3x, Read 4 files`).
- Keep specialized inline renderers for mermaid, media, question sets, etc.

## Shipped architecture (current)

The `hidden-steps/` tree and `tool-summary-resolver.ts` **do not exist**. Collapsible activity lives in `activity-row/` (`packages/web/src/components/chat/tools/activity-row/`). Aggregation is `createActivityEntry` / count sorting in `entries.ts` (thought label, tool action+detail, count). Registry is `built-in-tool-renderers.ts` (`toolRenderersByToken`).

- Core presentation descriptors resolve by exact integrated tool ID; there is no
  `names: []` alias map or alias helper.
- The token renderer registry is separate from exact-ID descriptor resolution.
- Keep the `buddy-custom` renderer token distinct from `generic`; Buddy-owned
  custom cards must not collapse into the generic fallback, and runtime-defined
  tools use their explicit runtime activity descriptor.
- `getToolInfo()` remains a shared title/icon helper, not the sole owner of
  renderer-owned trigger or title copy; renderer cards and the activity row own
  their detail presentation.
- Activity-row summaries and aggregation are the shipped replacement for
  hidden steps. Do not reintroduce the removed hidden-step paths or casually
  change their count, ordering, or error behavior.
- The old blueprint's `render_saved_question_set` versus `save_question_set`
  mismatch is historical; the current shipped registration is
  `save_question_set`, so verify current code before treating that old note as
  an open issue.

### Dynamic-tool presentation contract (current)

Dynamic tool authoring uses `presentation` descriptors serialized on the tool
part as `metadata.buddy.presentation`; the older `metadata.buddy.toolUi`
proposal is historical and is not the current wire contract. Pending tool calls
do not have usable state metadata, so their presentation snapshot stays on
`part.metadata`; running, completed, and error states may also carry state
metadata. Adapter history and SSE boundaries strip that snapshot before
model-facing messages so presentation data is not replayed to the provider
while remaining available to Buddy-owned UI responses. The `dynamic` field
remains runtime and search metadata, not a UI descriptor consumed by the web
renderer.

Core presentations resolve by exact integrated tool ID, while runtime-defined
tools receive an explicit generic activity descriptor and custom catalogs
remain directory-scoped and unregister-safe. `buddy-custom` is a distinct
renderer token from `generic`, so Buddy-owned/custom cards must not collapse
into generic fallback. `getToolInfo` is a shared title/icon helper, but
renderer cards and the activity row own trigger/detail copy and aggregation.
Current dynamic learning tools use explicit activity presentations and do not
rely on a default hidden-summary mode. The old hidden-steps/default-hidden-
summary blueprint and its provider-history rules are historical context; future
metadata changes must preserve pending replay, model-history stripping, and
renderer-token invariants together.

## Relevant files (current)

### Core resolver & types
- `packages/web/src/components/chat/tools/tool-renderer-resolver.ts` — icon + card lookup
- `packages/web/src/components/chat/tools/tool-registry-types.ts` — `ToolRenderer`, `ToolPartProps`
- `packages/web/src/components/chat/tools/types.ts` — `ToolState`, `ToolInfo`, `ToolAttachment`
- `packages/web/src/components/chat/tools/built-in-tool-renderers.ts` — token → card/icon
- `packages/web/src/components/chat/tools/registry.ts` — resolver/type exports; dynamic presentation catalog registration lives in `packages/opencode-adapter/src/registry.ts`
- `packages/web/src/components/chat/tools/tool-info.ts` — titles including image read running/idle copy
- `packages/web/src/components/chat/tools/parse-tool-presentation.ts` — presentation snapshot

### Activity row (replaces HiddenSteps)
- `packages/web/src/components/chat/tools/activity-row/index.tsx` — collapsible activity header, shimmer, expand
- `packages/web/src/components/chat/tools/activity-row/entries.ts` — entry creation, labels (`Thought` / `Thinking`), aggregation counts
- `packages/web/src/components/chat/tools/activity-row/file-change-details.tsx`
- `packages/web/src/components/chat/tools/text-shimmer.tsx`

### Tool card renderers
Under `packages/web/src/components/chat/tools/render/` unless noted:
- `buddy-custom.tsx`, `generic.tsx`, `bash.tsx`, `read.tsx` (image thumbnails via `packages/web/src/components/chat/tools/read-image-preview.ts`)
- `edit.tsx`, `apply-patch.tsx` / `apply-patch-item.tsx`
- `search.tsx`, `exa-search.tsx`, `webfetch.tsx`
- Mermaid: `packages/web/src/components/media/renderers/mermaid/` (not `tools/render/mermaid/`)
- `render-figure.tsx`, `present-media/index.tsx`, `html-widget/index.tsx`
- `task.tsx` + `task/`, `skill.tsx`, `question.tsx`, `question-set/`
- `flashcard-deck/`, `knowledge-graph.tsx`, `python-calculator.tsx`
- `ingest-full-text.tsx`, `bench-present.tsx`, `diagnostic-list.tsx`, `todo.tsx`

## Current Status

Linear timeline + activity-row aggregation is the live UI. The Situation/Complication text above is the original problem statement, not a description of today's files.
