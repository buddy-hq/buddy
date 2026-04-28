# Tool UI Display API Plan

Plan to replace the scattered hardcoded sets (`HIDDEN_TOOLS`, `ABSTRACTABLE_TOOLS`, `CONTEXT_TOOLS`) and ambiguous presenter naming (`hiddenSteps`, `summaryOnly`) with a single, explicit registry-driven display-mode API.

## Target End State

Every tool declares exactly one `displayMode` in the registry. The frontend groups and renders tool parts based solely on that mode. No hidden sets. No boolean flags inside presenters. No dead code.

## Why

The current frontend has three parallel classification systems for the same question: "how should this tool appear in the transcript?"

1. `HIDDEN_TOOLS` — a hardcoded `Set<string>` in `message-utils.ts` that omits tools entirely.
2. `ABSTRACTABLE_TOOLS` — a second hardcoded `Set<string>` in `constants.ts` that decides whether a tool is grouped into the `HiddenSteps` collapsible block.
3. `CONTEXT_TOOLS` + `isContextTool` — a registry-level boolean that is defined on four tools but never read anywhere in the frontend.
4. `hidden-summary` metadata — a runtime override from the backend that duplicates the abstractable behavior for dynamic tools.
5. `hiddenSteps` presenter + `summaryOnly` boolean — inside the registry, each tool can return a presenter that configures how it looks inside the `HiddenSteps` block. The `summaryOnly: true` flag means "show a compact row instead of the full card when expanded."

All of these answer variants of the same question. The proposed API collapses them into one registry-level `displayMode` with three collapsed sub-variants.

## Non-Goals

- Do not change backend metadata transport (`metadata.buddy.toolUi`) — that contract stays separate.
- Do not change the visual appearance of any tool — only the classification system that decides where it renders.
- Do not introduce a new transport channel between backend and frontend.
- Do not rename the `HiddenSteps` React component in this plan — that is a separate visual naming concern.

## Core Design Principles

### One Source of Truth

A tool's display behavior lives in exactly one place: the registry entry's `displayMode`. No parallel hardcoded sets.

### Registry Over Metadata Fallback

If a tool is registered, its `displayMode` is authoritative. The metadata `presentation: "hidden-summary"` is still supported as a fallback for unregistered or dynamically loaded tools, but it maps to the same `displayMode` enum.

### Presenters Configure, They Do Not Decide

The collapsed-block presenter (today `hiddenSteps`, renamed to `collapsedPresentation`) configures label, preview text, and row details. It does not decide whether the tool is collapsed — the `displayMode` does.

## Seams

### 1. Registry Definition Seam

File: `packages/web/src/components/chat/tools/registry.ts`

The registry defines what a `ToolRenderer` is and how to look it up.

### 2. Tool Registration Seam

File: `packages/web/src/components/chat/tools/tools.tsx`

Every tool is registered here with its renderer and optionally its presenter.

### 3. Renderability Decision Seam

File: `packages/web/src/components/chat/utils/message-utils.ts`

`assistantPartRenderable()` and `groupAssistantParts()` currently use `HIDDEN_TOOLS` and `ABSTRACTABLE_TOOLS` to decide placement.

### 4. Inline Rendering Seam

File: `packages/web/src/components/chat/parts/assistant-part/tool-part.tsx`

`ToolPartCard` returns `null` for hidden tools. This duplicates the `HIDDEN_TOOLS` check in `assistantPartRenderable`.

### 5. Collapsed Block Rendering Seam

File: `packages/web/src/components/chat/tools/hidden-steps/index.tsx`

The `HiddenSteps` component decides per-entry whether to render a `SummaryOnlyToolRow` or a full `AssistantPartRenderer`. This decision is currently based on `entry.hiddenSteps?.summaryOnly`.

## Iteration 1

### API Direction

Replace all classification sets with a single `displayMode` enum on the registry.

### Type Shape

```ts
// registry.ts
export type ToolDisplayMode =
  | "hidden"              // Omitted entirely from UI
  | "inline"              // Full card in main transcript flow
  | "collapsed-full"      // In summary block, expands to full card
  | "collapsed-summary"   // In summary block, expands to compact row only

export type CollapsedPresentation = {
  label: string
  preview?: { text: string; kind: "text" | "markdown" }
  rowDetails?: Array<{ text: string; kind: "text" | "markdown" }>
  suppressErrorPreview?: boolean
}

export type ToolRenderer = {
  name: string
  render: (props: ToolPartProps) => ReactNode
  displayMode: ToolDisplayMode
  collapsedPresentation?: (props: ToolPartProps) => CollapsedPresentation | undefined
}
```

### Registration Examples

```ts
// tools.tsx — every tool declares its mode explicitly
registerTool({
  name: "todowrite",
  render: () => null,
  displayMode: "hidden",
})

registerTool({
  name: "read",
  render: renderReadTool,
  displayMode: "collapsed-summary",
  collapsedPresentation: createReadCollapsedPresentation,
})

registerTool({
  name: "list",
  render: renderSearchTool,
  displayMode: "collapsed-full",
  collapsedPresentation: createSearchCollapsedPresentation,
})

registerTool({
  name: "edit",
  render: renderEditTool,
  displayMode: "inline",
})

registerTool({
  name: "bash",
  render: renderBashTool,
  displayMode: "collapsed-summary",
  collapsedPresentation: createBashCollapsedPresentation,
})
```

### Frontend Decision Flow

```ts
// message-utils.ts
import { getToolDisplayMode } from "../tools/registry"

export function assistantPartRenderable(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return /* existing non-tool logic */
  
  const mode = getToolDisplayMode(part.tool)
  if (mode === "hidden") return false
  
  if (part.tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }
  
  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  // existing logic ...
  if (isChatToolPart(part)) {
    const mode = getToolDisplayMode(part.tool)
    if (mode === "hidden") return false
    if (isCollapsedMode(mode)) return false
    // ...
  }
}

export function groupAssistantParts(parts: MessagePart[], ...): AssistantRenderItem[] {
  // ...
  const partIsAbstractable =
    (isChatToolPart(part) && isCollapsedMode(getToolDisplayMode(part.tool))) ||
    isChatReasoningPart(part)
  // ...
}
```

```ts
// hidden-steps/index.tsx
function entryUsesSummaryOnlyRendering(entry: AbstractedEntry): boolean {
  return entry.part.type === "tool" && getToolDisplayMode(entry.part.tool) === "collapsed-summary"
}
```

### What This Eliminates

| Current | Proposed |
|---|---|
| `HIDDEN_TOOLS` hardcoded set | `displayMode: "hidden"` on registry |
| `ABSTRACTABLE_TOOLS` hardcoded set | `displayMode: "collapsed-*"` on registry |
| `CONTEXT_TOOLS` + `isContextTool` (dead code) | Deleted entirely |
| `hiddenSteps` presenter name | `collapsedPresentation` |
| `summaryOnly` boolean flag | `collapsed-summary` mode |
| `hidden-steps-presenters.ts` filename | `collapsed-presenters.ts` |

### Open Question

The `question` tool has a state-dependent visibility rule (hidden while pending/running). Should `displayMode` accept a function `(props) => ToolDisplayMode`, or should `question` remain a special case?

### Why Iteration 1 Is Good

- One enum answers the placement question everywhere.
- No hidden sets drift out of sync with registrations.
- Adding a new tool requires one line: `displayMode: "..."`.

### Why Iteration 1 Might Be Insufficient

- The metadata `presentation: "hidden-summary"` from dynamic tools is still a separate path. It needs to map into this same enum.
- `question` tool special-casing is awkward.
- `reasoning` parts are not tools, so they still need a hardcoded check in `groupAssistantParts`.

## Iteration 2

### Changes from Iteration 1

- Drop the `displayMode` enum. Keep the current flat registration style and use the presence/absence of keys as the signal.
- Rename `hiddenSteps` → `fold`. Rename `summaryOnly` → `type: "brief"` vs `type: "full"`.
- Rename `rowDetails` → `details`.
- All text renders through `<Markdown>`. Drop `HIDDEN_STEP_DETAIL_KIND` and the plain-text branch.
- Add `hidden: true` flag for completely hidden tools.
- Delete `CONTEXT_TOOLS` + `isContextTool` (dead code).

### API Direction

A tool is either hidden, inline, or foldable. Foldable tools declare a `fold` presenter. The presenter shape itself tells you whether the expanded view is brief (compact row) or full (full card).

### Type Shape

```ts
// registry.ts
export type FoldPresentation =
  | {
      type: "brief"
      label: string
      details?: string[]
      suppressError?: boolean
    }
  | {
      type: "full"
      label: string
      preview?: string
    }

export type ToolRenderer = {
  name: string
  render: (props: ToolPartProps) => ReactNode
  hidden?: boolean
  fold?: (props: ToolPartProps) => FoldPresentation | undefined
}
```

### Registration Examples

```ts
// tools.tsx
registerTool({
  name: "todowrite",
  render: () => null,
  hidden: true,
})

registerTool({
  name: "read",
  render: renderReadTool,
  fold: createReadFoldPresentation, // returns { type: "brief", ... }
})

registerTool({
  name: "list",
  render: renderSearchTool,
  fold: createSearchFoldPresentation, // returns { type: "full", ... }
})

registerTool({
  name: "edit",
  render: renderEditTool,
  // no fold = inline
})

registerTool({
  name: "bash",
  render: renderBashTool,
  fold: createBashFoldPresentation, // returns { type: "brief", ... }
})
```

### Presenter Example

```ts
// fold-presenters.ts
export function createReadFoldPresentation(props: ToolPartProps): FoldPresentation {
  const fileName = readNonEmptyString(props.info.subtitle)
  const snippet = summarizeText(props.state.output, PREVIEW_MAX_CHARS)

  return {
    type: "brief",
    label: buildLabel(props.info.title, fileName),
    details: [fileName, snippet].filter(isNonEmptyString),
    suppressError: true,
  }
}

export function createSearchFoldPresentation(props: ToolPartProps): FoldPresentation {
  const summaryDetail =
    readNonEmptyString(props.info.summary) ?? searchInputText(props)

  return {
    type: "full",
    label: buildLabel(props.info.title, summaryDetail),
    preview: summarizeText(props.state.output, PREVIEW_MAX_CHARS),
  }
}
```

### Frontend Decision Flow

```ts
// registry.ts
export function isHidden(tool: string): boolean {
  return getToolRenderer(tool)?.hidden ?? false
}

export function isFoldable(tool: string): boolean {
  return getToolRenderer(tool)?.fold !== undefined
}

export function isBrief(tool: string): boolean {
  const renderer = getToolRenderer(tool)
  const presentation = renderer?.fold
  return presentation?.type === "brief"
}

// message-utils.ts
export function assistantPartRenderable(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return /* existing non-tool logic */
  if (isHidden(part.tool)) return false
  if (part.tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }
  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (isChatToolPart(part)) {
    if (isHidden(part.tool)) return false
    if (isFoldable(part.tool)) return false
    // ...
  }
}

export function groupAssistantParts(parts: MessagePart[], ...): AssistantRenderItem[] {
  // ...
  const partIsAbstractable =
    (isChatToolPart(part) && isFoldable(part.tool)) || isChatReasoningPart(part)
  // ...
}
```

```ts
// hidden-steps/index.tsx
function entryUsesSummaryOnlyRendering(entry: AbstractedEntry): boolean {
  return entry.part.type === "tool" && isBrief(entry.part.tool)
}
```

### Rendering the Fold Block

All text in the fold block renders as markdown. No plain-text fallback.

```tsx
function FoldDetail({ text }: { text: string }) {
  return (
    <Markdown
      text={text}
      className="text-xs text-text-weaker"
    />
  )
}
```

### What This Eliminates

| Current | Proposed |
|---|---|
| `HIDDEN_TOOLS` hardcoded set | `hidden: true` on registry |
| `ABSTRACTABLE_TOOLS` hardcoded set | Presence of `fold` key on registry |
| `CONTEXT_TOOLS` + `isContextTool` (dead code) | Deleted entirely |
| `hiddenSteps` presenter name | `fold` |
| `summaryOnly` boolean flag | `type: "brief"` in fold presentation |
| `HIDDEN_STEP_DETAIL_KIND` with text/markdown split | Everything is markdown |
| `rowDetails` | `details` |
| `hidden-steps-presenters.ts` filename | `fold-presenters.ts` |

### Open Questions

1. **Metadata fallback for dynamic tools.** Unregistered dynamic tools arrive with `metadata.buddy.toolUi.presentation = "hidden-summary"`. The grouping logic needs a second check: `metadataSaysFold(tool, metadata)`. Should `isFoldable(tool, metadata?)` accept optional metadata and check both registry and metadata?

2. **`question` tool special case.** It hides itself while pending/running. Should this stay a one-off in `assistantPartRenderable`, or should `renderQuestionTool` itself return null for those states?

3. **`reasoning` parts.** Not tools, so they can't use the registry. Keep the hardcoded `isChatReasoningPart` check in `groupAssistantParts`, or introduce a parallel concept?

### Why Iteration 2 Is Better

- No enum verbosity. The API is the same shape as today, just with clearer names.
- `fold` is short and maps directly to the `HiddenSteps` collapsible UI.
- `type: "brief"` vs `type: "full"` is self-documenting. No boolean mystery.
- All text is markdown. No `kind` discrimination.
- Registration stays flat and readable.

## Iteration 3

### Changes from Iteration 2

- Drop `registerTool` and the runtime `Map` registry.
- Use `createToolRenderer(...)` so the renderer component and fold behavior live in one definition.
- Keep a static `Record<string, ToolRenderer>` export in `tools.tsx`, but populate it from `createToolRenderer(...)` values.
- All fold text is markdown. Delete `HIDDEN_STEP_DETAIL_KIND`.
- Rename `hidden-steps-presenters.ts` → `fold-presenters.ts`.
- Rename `SummaryOnlyToolRow` → `BriefToolRow`.

### API Direction

Each tool exports one frontend definition created with `createToolRenderer(...)`. That one object owns:

- visibility (`hidden`)
- full card rendering (`component`)
- fold summary behavior (`label`, `preview`, `details`, `suppressError`)

No separate registration call. No separate presenter registration.

### Type Shape

```ts
// registry.ts
export type ToolRendererDefinition = {
  name: string
  hidden?: boolean
  component?: (props: ToolPartProps) => ReactNode
  label?: (props: ToolPartProps) => string
  preview?: (props: ToolPartProps) => string | undefined
  details?: (props: ToolPartProps) => string[] | undefined
  suppressError?: boolean
}

export type ToolRenderer = ToolRendererDefinition

export function createToolRenderer(definition: ToolRendererDefinition): ToolRenderer {
  return definition
}

export function isHiddenTool(tool: string): boolean {
  return tools[tool]?.hidden === true
}

export function getToolRenderer(tool: string): ToolRenderer | undefined {
  return tools[tool]
}

export function isFoldTool(
  tool: string,
  metadata?: Record<string, unknown>,
): boolean {
  const renderer = tools[tool]
  if (renderer?.label || renderer?.preview || renderer?.details) {
    return true
  }

  return parseToolUiMetadata(metadata)?.presentation === "hidden-summary"
}

export function isBriefTool(
  tool: string,
  metadata?: Record<string, unknown>,
): boolean {
  const renderer = tools[tool]
  if (!renderer) {
    return parseToolUiMetadata(metadata)?.presentation === "hidden-summary"
  }

  return !renderer.component && isFoldTool(tool, metadata)
}
```

### Tool Definitions

```ts
// render/read.tsx
export const ReadTool = createToolRenderer({
  name: "read",
  component: ReadToolCard,
  label: (props) => buildLabel(props.info.title, props.info.subtitle),
  preview: (props) => summarizeText(props.state.output, PREVIEW_MAX_CHARS),
  details: (props) =>
    [props.info.subtitle, summarizeText(props.state.output, PREVIEW_MAX_CHARS)].filter(
      isNonEmptyString,
    ),
  suppressError: true,
})

// render/search.tsx
export const SearchTool = createToolRenderer({
  name: "list",
  component: SearchToolCard,
  label: (props) => buildLabel(props.info.title, searchInputText(props)),
  preview: (props) =>
    summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? searchInputText(props),
})

// render/skill.tsx
export const SkillTool = createToolRenderer({
  name: "skill",
  label: (props) => props.info.title,
  details: (props) => [props.info.subtitle, props.info.summary].filter(isNonEmptyString),
  suppressError: true,
})

// render/todo.tsx
export const TodoWriteTool = createToolRenderer({
  name: "todowrite",
  hidden: true,
})
```

### Central Tool Map

```ts
// tools.tsx
import { ReadTool } from "./render/read"
import { SearchTool } from "./render/search"
import { EditTool } from "./render/edit"
import { BashTool } from "./render/bash"
import { SkillTool } from "./render/skill"
import { TodoWriteTool, TodoReadTool } from "./render/todo"

export const tools: Record<string, ToolRenderer> = {
  [ReadTool.name]: ReadTool,
  [SearchTool.name]: SearchTool,
  glob: createToolRenderer({ ...SearchTool, name: "glob" }),
  grep: createToolRenderer({ ...SearchTool, name: "grep" }),
  websearch: createToolRenderer({ ...SearchTool, name: "websearch" }),
  codesearch: createToolRenderer({ ...SearchTool, name: "codesearch" }),

  [EditTool.name]: EditTool,
  write: createToolRenderer({ ...EditTool, name: "write" }),
  apply_patch: ApplyPatchTool,

  [BashTool.name]: BashTool,
  [SkillTool.name]: SkillTool,

  task: TaskTool,
  question: QuestionTool,

  learning_tool_search: createToolRenderer({ ...SearchTool, name: "learning_tool_search" }),
  learning_tool_load: createToolRenderer({ ...SkillTool, name: "learning_tool_load" }),

  search_standards: createToolRenderer({ ...SkillTool, name: "search_standards" }),
  get_standard: createToolRenderer({ ...SkillTool, name: "get_standard" }),
  get_learning_components: createToolRenderer({ ...SkillTool, name: "get_learning_components" }),

  [TodoWriteTool.name]: TodoWriteTool,
  [TodoReadTool.name]: TodoReadTool,
}
```

### Full Frontend Flow

#### 1. `registry.ts`

Add `createToolRenderer(...)` and make lookup helpers read from the static `tools` object.

Delete:

- `registerTool`
- `Map<string, ToolRenderer>`
- `isContextTool`
- `CONTEXT_TOOLS`
- `HIDDEN_TOOLS`

#### 2. `tools.tsx`

Replace `registerTool({...})` calls with a static object built from imported renderer definitions.

This file becomes a plain index of exported tool definitions.

#### 3. `render/*.tsx`

Each tool file exports one renderer definition instead of only a component/render function.

Examples:

- `render/read.tsx` exports `ReadTool`
- `render/skill.tsx` exports `SkillTool`
- `render/todo.tsx` exports `TodoWriteTool` / `TodoReadTool`

For tools that share behavior, use `createToolRenderer({ ...BaseTool, name: "other_name" })` in `tools.tsx`.

#### 4. `tool-part.tsx`

```tsx
export const ToolPartCard = memo(function ToolPartCard({ part, ... }) {
  if (isHiddenTool(part.tool)) {
    return null
  }

  const renderer = getToolRenderer(part.tool)
  if (renderer?.component) {
    const Component = renderer.component
    return <Component {...props} />
  }

  if (isBuddyCustomTool(part.tool) && part.tool !== "python_calculator") {
    return <BuddyCustomTool {...props} />
  }

  return <GenericTool {...props} />
})
```

#### 5. `message-utils.ts`

```ts
export function assistantPartRenderable(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return /* existing non-tool logic */

  if (isHiddenTool(part.tool)) return false

  if (part.tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }

  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (isChatToolPart(part)) {
    const state = parseToolState(part)

    if (isHiddenTool(part.tool)) return false
    if (isFoldTool(part.tool, state.metadata)) return false

    // existing question handling stays
    return true
  }

  // existing non-tool logic
}

export function groupAssistantParts(parts: MessagePart[], ...): AssistantRenderItem[] {
  const partIsAbstractable =
    (isChatToolPart(part) && isFoldTool(part.tool, parseToolState(part).metadata)) ||
    isChatReasoningPart(part)
}
```

Delete `ABSTRACTABLE_TOOLS` usage entirely.

#### 6. `hidden-steps/index.tsx`

Build each fold entry from the renderer definition.

```ts
type FoldEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
  fold?: {
    label: string
    preview?: string
    details?: string[]
    suppressError?: boolean
  }
  brief: boolean
}

function createEntry(part: MessagePart): FoldEntry {
  if (part.type !== "tool") {
    return { part, brief: false }
  }

  const state = parseToolState(part)
  const info = getToolInfo(String(part.tool ?? ""), state)
  const tool = String(part.tool ?? "")
  const renderer = getToolRenderer(tool)
  const props: ToolPartProps = { part, state, info, tool }
  const metadataUi = parseToolUiMetadata(state.metadata)

  if (renderer && (renderer.label || renderer.preview || renderer.details)) {
    return {
      part,
      state,
      info,
      fold: {
        label: renderer.label?.(props) ?? info.title,
        preview: renderer.preview?.(props),
        details: renderer.details?.(props),
        suppressError: renderer.suppressError,
      },
      brief: !renderer.component,
    }
  }

  if (metadataUi?.presentation === "hidden-summary") {
    return {
      part,
      state,
      info,
      fold: {
        label: info.title,
        details: [info.subtitle, info.summary].filter(isNonEmptyString),
      },
      brief: true,
    }
  }

  return { part, state, info, brief: false }
}
```

Rendering stays:

```tsx
{entries.map((entry) =>
  entry.brief ? (
    <BriefToolRow key={entry.part.id} entry={entry} />
  ) : (
    <AssistantPartRenderer key={entry.part.id} part={entry.part} />
  ),
)}
```

#### 7. `BriefToolRow`

All `details` render as markdown.

```tsx
function BriefToolRow({ entry }: { entry: FoldEntry }) {
  if (!entry.info || !entry.fold) return null

  return (
    <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
      <div className="text-xs font-medium text-text-weak">{entry.info.title}</div>
      {entry.fold.details?.map((detail) => (
        <Markdown
          key={`${entry.part.id}:${detail}`}
          text={detail}
          className="mt-1 text-xs text-text-weaker"
        />
      ))}
    </div>
  )
}
```

#### 8. `constants.ts`

Delete `ABSTRACTABLE_TOOLS` entirely.

### What This Eliminates

| Current | Proposed |
|---|---|
| `registerTool` imperative API | `createToolRenderer(...)` exports |
| Runtime `Map` registry | Static `tools` object |
| `HIDDEN_TOOLS` hardcoded set | `hidden: true` on tool definition |
| `ABSTRACTABLE_TOOLS` hardcoded set | Presence of `label` / `preview` / `details` on tool definition |
| `CONTEXT_TOOLS` + `isContextTool` (dead) | Deleted |
| `hiddenSteps` name | Fold properties on renderer |
| `summaryOnly` boolean | No `component` means brief fold entry |
| `HIDDEN_STEP_DETAIL_KIND` | Everything is markdown |
| `rowDetails` | `details` |
| `SummaryOnlyToolRow` | `BriefToolRow` |
| `hidden-steps-presenters.ts` | `fold-presenters.ts` or inlined into renderer files |

### Files to Touch

1. `packages/web/src/components/chat/tools/registry.ts`
2. `packages/web/src/components/chat/tools/tools.tsx`
3. `packages/web/src/components/chat/parts/assistant-part/tool-part.tsx`
4. `packages/web/src/components/chat/utils/message-utils.ts`
5. `packages/web/src/components/chat/utils/constants.ts`
6. `packages/web/src/components/chat/tools/hidden-steps/index.tsx`
7. `packages/web/src/components/chat/tools/parse-tool-ui-metadata.ts`
8. `packages/web/src/components/chat/tools/render/read.tsx`
9. `packages/web/src/components/chat/tools/render/search.tsx`
10. `packages/web/src/components/chat/tools/render/skill.tsx`
11. `packages/web/src/components/chat/tools/render/bash.tsx`
12. `packages/web/src/components/chat/tools/render/question.tsx`
13. `packages/web/src/components/chat/tools/render/buddy-custom.tsx`
14. `packages/web/src/components/chat/tools/render/generic.tsx`
15. `packages/web/src/components/chat/tools/render/edit.tsx`

### Open Questions

1. **Alias tools.** Is `createToolRenderer({ ...SearchTool, name: "glob" })` acceptable, or do you want a helper like `renameToolRenderer(SearchTool, "glob")`?

2. **Dynamic tools.** Unregistered tools with `metadata.buddy.toolUi.presentation = "hidden-summary"` still get a metadata-driven brief fallback. Good enough?

3. **Question tool.** Its pending/running hiding still lives in `assistantPartRenderable`. Keep it there, or move it into the `QuestionTool` definition later?

4. **Reasoning parts.** Still hardcoded in `groupAssistantParts`. Acceptable?

## Iteration 4

This iteration supersedes Iteration 3 for frontend API direction.

### Principle

- Built-in tools and dynamic tools are different frontend problems.
- Built-in tools are the small set of tools that have custom React UI.
- Dynamic tools are the unbounded set of backend-defined tools that should not be registered in the frontend.
- Dynamic tools should render from `metadata.buddy.toolUi` only.
- The frontend should never maintain a map of dynamic tool IDs.

### Why Iteration 3 Was Wrong

Iteration 3 blurred two separate concerns:

- built-in custom UI lookup
- dynamic tool metadata-driven UI

That made it look like every tool name needed a frontend entry.

That is wrong.

The frontend only needs a small map for built-in tools that have bespoke UI.
The whole point of backend metadata is to avoid any map for the 100s of dynamic tools.

### API Goals

- Use `createToolRenderer(...)` for built-in tools only.
- Keep fold behavior inside the renderer definition.
- Support shared built-in renderers without repeated alias lines.
- Let dynamic tools fold and label themselves from metadata alone.
- Keep unknown future dynamic tools working without frontend code changes.

### Backend / Frontend Split

Built-in tool path:

- tool name matches a built-in renderer definition
- frontend may use a custom component
- fold behavior comes from the built-in renderer definition

Dynamic tool path:

- no built-in renderer exists for that tool name
- frontend reads `metadata.buddy.toolUi`
- if `presentation === "hidden-summary"`, render a generic brief fold row
- otherwise fall back to generic tool card rendering

### Frontend Type Shape

```ts
// registry.ts
export type ToolFold = {
  label?: (props: ToolPartProps) => string
  preview?: (props: ToolPartProps) => string | undefined
  details?: (props: ToolPartProps) => string[] | undefined
  suppressError?: boolean
}

export type ToolRendererDefinition = {
  names: readonly [string, ...string[]]
  hidden?: boolean
  component?: (props: ToolPartProps) => ReactNode
  fold?: ToolFold
}

export type ToolRenderer = ToolRendererDefinition

export function createToolRenderer(definition: ToolRendererDefinition): ToolRenderer {
  return definition
}

export function indexToolRenderers(
  renderers: readonly ToolRenderer[],
): Record<string, ToolRenderer> {
  const entries: Array<[string, ToolRenderer]> = []

  for (const renderer of renderers) {
    for (const name of renderer.names) {
      entries.push([name, renderer])
    }
  }

  return Object.fromEntries(entries)
}
```

### Built-In Tool Definitions

```ts
// render/read.tsx
export const ReadTool = createToolRenderer({
  names: ["read"],
  component: ReadToolCard,
  fold: {
    label: (props) => buildLabel(props.info.title, props.info.subtitle),
    preview: (props) => summarizeText(props.state.output, PREVIEW_MAX_CHARS),
    details: (props) =>
      [props.info.subtitle, summarizeText(props.state.output, PREVIEW_MAX_CHARS)].filter(
        isNonEmptyString,
      ),
    suppressError: true,
  },
})

// render/search.tsx
export const SearchTool = createToolRenderer({
  names: ["list", "glob", "grep", "websearch", "codesearch", "learning_tool_search"],
  component: SearchToolCard,
  fold: {
    label: (props) => buildLabel(props.info.title, searchInputText(props)),
    preview: (props) =>
      summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? searchInputText(props),
  },
})

// render/skill.tsx
export const SkillTool = createToolRenderer({
  names: [
    "skill",
    "learning_tool_load",
    "search_standards",
    "get_standard",
    "get_learning_components",
    "get_prerequisites",
    "get_next_standards",
    "get_crosswalk",
    "query_standards_sql",
    "pedagogy_resource_ingest_full_text",
  ],
  fold: {
    label: (props) => props.info.title,
    details: (props) => [props.info.subtitle, props.info.summary].filter(isNonEmptyString),
    suppressError: true,
  },
})

// render/todo.tsx
export const TodoTools = createToolRenderer({
  names: ["todowrite", "todoread"],
  hidden: true,
})
```

### Built-In Tool Index

```ts
// tools.tsx
import { indexToolRenderers } from "./registry"
import { ReadTool } from "./render/read"
import { SearchTool } from "./render/search"
import { EditTool } from "./render/edit"
import { BashTool } from "./render/bash"
import { WebfetchTool } from "./render/webfetch"
import { SkillTool } from "./render/skill"
import { TaskTool } from "./render/task"
import { QuestionTool } from "./render/question"
import { RenderFigureTool } from "./render/render-figure"
import { RenderMermaidTool } from "./render/mermaid"
import { SavedQuestionSetTool } from "./render/question-set/saved-question-set-tool"
import { LearnerSnapshotTool } from "./render/buddy-custom"
import { TodoTools } from "./render/todo"

export const tools = indexToolRenderers([
  ReadTool,
  SearchTool,
  EditTool,
  BashTool,
  WebfetchTool,
  SkillTool,
  TaskTool,
  QuestionTool,
  RenderFigureTool,
  RenderMermaidTool,
  SavedQuestionSetTool,
  LearnerSnapshotTool,
  TodoTools,
])
```

Important consequence:

- only built-in tools appear in this index
- dynamic tools never appear here
- grouped names like `list` / `glob` / `grep` are only an ergonomics feature for built-ins that intentionally share one UI

### Dynamic Tool Example

Dynamic tool has no frontend entry:

```ts
metadata: {
  buddy: {
    toolUi: {
      presentation: "hidden-summary",
      labels: {
        idle: "Reflection",
        running: "Guiding reflection",
      },
    },
  },
}
```

Frontend behavior:

- no built-in renderer is found
- `parseToolUiMetadata(...)` reads the metadata
- the tool is treated as a brief fold entry
- label/details come from generic metadata-aware fallback logic

No frontend mapping is added.

### Full Frontend Flow

#### 1. `registry.ts`

Own the built-in renderer API only.

Add:

- `createToolRenderer(...)`
- `indexToolRenderers(...)`
- `getToolRenderer(tool)`
- `isHiddenTool(tool)`
- `isBuiltInFoldTool(tool)`

Delete:

- `registerTool`
- runtime `Map`
- `CONTEXT_TOOLS`
- `isContextTool`
- `HIDDEN_TOOLS`

Example helpers:

```ts
export function getToolRenderer(tool: string): ToolRenderer | undefined {
  return tools[tool]
}

export function isHiddenTool(tool: string): boolean {
  return tools[tool]?.hidden === true
}

export function isBuiltInFoldTool(tool: string): boolean {
  return tools[tool]?.fold !== undefined
}
```

#### 2. `tools.tsx`

Replace imperative registration with `indexToolRenderers([...])` over built-in renderer definitions.

This file becomes the built-in tool index, not a universal tool registry.

#### 3. `render/*.tsx`

Each built-in tool file exports a `createToolRenderer(...)` definition.

The renderer definition owns:

- `names`
- `hidden`
- `component`
- `fold`

Fold config is not separate anymore. It belongs to the renderer definition.

#### 4. `tool-part.tsx`

Only built-in tools use the built-in lookup.

```tsx
export const ToolPartCard = memo(function ToolPartCard({ part, ... }) {
  if (isHiddenTool(part.tool)) {
    return null
  }

  const renderer = getToolRenderer(part.tool)
  if (renderer?.component) {
    const Component = renderer.component
    return <Component {...props} />
  }

  if (isBuddyCustomTool(part.tool) && part.tool !== "python_calculator") {
    return <BuddyCustomTool {...props} />
  }

  return <GenericTool {...props} />
})
```

Meaning:

- built-in custom UI if it exists
- otherwise existing generic fallback path
- dynamic tools do not need registration to work

#### 5. `message-utils.ts`

Grouping logic checks built-in fold first, then metadata fallback.

```ts
function isFoldTool(part: ChatToolPart): boolean {
  if (isBuiltInFoldTool(part.tool)) {
    return true
  }

  return parseToolUiMetadata(parseToolState(part).metadata)?.presentation === "hidden-summary"
}

export function assistantPartRenderable(part: MessagePart): boolean {
  if (!isChatToolPart(part)) return /* existing non-tool logic */

  if (isHiddenTool(part.tool)) return false

  if (part.tool === "question") {
    const state = parseToolState(part)
    return !(state.status === "pending" || state.status === "running")
  }

  return true
}

export function assistantPartStartsFollowup(part: MessagePart): boolean {
  if (isChatToolPart(part)) {
    if (isHiddenTool(part.tool)) return false
    if (isFoldTool(part)) return false
    return true
  }

  // existing non-tool logic
}

export function groupAssistantParts(parts: MessagePart[], ...): AssistantRenderItem[] {
  const partIsAbstractable =
    (isChatToolPart(part) && isFoldTool(part)) || isChatReasoningPart(part)
}
```

Delete `ABSTRACTABLE_TOOLS` entirely.

#### 6. `hidden-steps/index.tsx`

Build fold entries from either:

- built-in renderer `fold`
- metadata fallback for dynamic tools

```ts
type FoldEntry = {
  part: MessagePart
  state?: ToolState
  info?: ToolInfo
  fold?: {
    label: string
    preview?: string
    details?: string[]
    suppressError?: boolean
  }
  brief: boolean
}

function createEntry(part: MessagePart): FoldEntry {
  if (part.type !== "tool") {
    return { part, brief: false }
  }

  const state = parseToolState(part)
  const info = getToolInfo(String(part.tool ?? ""), state)
  const tool = String(part.tool ?? "")
  const renderer = getToolRenderer(tool)
  const props: ToolPartProps = { part, state, info, tool }
  const toolUi = parseToolUiMetadata(state.metadata)

  if (renderer?.fold) {
    return {
      part,
      state,
      info,
      fold: {
        label: renderer.fold.label?.(props) ?? info.title,
        preview: renderer.fold.preview?.(props),
        details: renderer.fold.details?.(props),
        suppressError: renderer.fold.suppressError,
      },
      brief: !renderer.component,
    }
  }

  if (toolUi?.presentation === "hidden-summary") {
    return {
      part,
      state,
      info,
      fold: {
        label: toolUi.labels?.idle ?? info.title,
        details: [info.subtitle, info.summary].filter(isNonEmptyString),
      },
      brief: true,
    }
  }

  return { part, state, info, brief: false }
}
```

This is the crucial split:

- built-in fold behavior comes from the renderer definition
- dynamic fold behavior comes from metadata

#### 7. `BriefToolRow`

Keep it generic. All text renders as markdown.

```tsx
function BriefToolRow({ entry }: { entry: FoldEntry }) {
  if (!entry.info || !entry.fold) return null

  return (
    <div className="rounded-md border border-border-base bg-background-base px-3 py-2">
      <div className="text-xs font-medium text-text-weak">{entry.fold.label}</div>
      {entry.fold.details?.map((detail) => (
        <Markdown
          key={`${entry.part.id}:${detail}`}
          text={detail}
          className="mt-1 text-xs text-text-weaker"
        />
      ))}
    </div>
  )
}
```

#### 8. `parse-tool-ui-metadata.ts`

Keep this as the single parser for dynamic-tool UI metadata.

No built-in lookup logic belongs here.

#### 9. `constants.ts`

Delete `ABSTRACTABLE_TOOLS`.

No replacement set is needed.

### What This Eliminates

| Current | Proposed |
|---|---|
| Global registry for every tool | Built-in tool index only |
| Any imagined map of dynamic tool IDs | No frontend map for dynamic tools |
| `registerTool` imperative API | `createToolRenderer(...)` + `indexToolRenderers(...)` |
| Separate fold presenter registration | `fold` lives inside the renderer definition |
| `HIDDEN_TOOLS` set | `hidden: true` on built-in renderer |
| `ABSTRACTABLE_TOOLS` set | Built-in `fold` or metadata `hidden-summary` |
| `CONTEXT_TOOLS` + `isContextTool` | Deleted |
| Plain-text fold rendering | Everything is markdown |

### Files to Touch

1. `packages/web/src/components/chat/tools/registry.ts`
2. `packages/web/src/components/chat/tools/tools.tsx`
3. `packages/web/src/components/chat/parts/assistant-part/tool-part.tsx`
4. `packages/web/src/components/chat/utils/message-utils.ts`
5. `packages/web/src/components/chat/utils/constants.ts`
6. `packages/web/src/components/chat/tools/hidden-steps/index.tsx`
7. `packages/web/src/components/chat/tools/parse-tool-ui-metadata.ts`
8. `packages/web/src/components/chat/tools/render/read.tsx`
9. `packages/web/src/components/chat/tools/render/search.tsx`
10. `packages/web/src/components/chat/tools/render/edit.tsx`
11. `packages/web/src/components/chat/tools/render/bash.tsx`
12. `packages/web/src/components/chat/tools/render/webfetch.tsx`
13. `packages/web/src/components/chat/tools/render/skill.tsx`
14. `packages/web/src/components/chat/tools/render/task.tsx`
15. `packages/web/src/components/chat/tools/render/question.tsx`
16. `packages/web/src/components/chat/tools/render/buddy-custom.tsx`
17. `packages/web/src/components/chat/tools/render/generic.tsx`
18. `packages/web/src/components/chat/tools/render/question-set/saved-question-set-tool.tsx`
19. `packages/web/src/components/chat/tools/render/render-figure.tsx`
20. `packages/web/src/components/chat/tools/render/mermaid.tsx`

### Open Questions

1. Should built-in renderer definitions use `names: [...]` as above, or do you want one renderer export per exact built-in tool name?

2. For metadata-only dynamic tools, is the generic brief fold row enough, or do you want a richer metadata contract for preview/details later?

3. Should `question` remain a special case in `assistantPartRenderable`, or should its renderer definition eventually own that logic?

4. Is the built-in/dynamic split now the right mental model for the whole frontend API?

## Iteration 5

This iteration supersedes Iteration 4.

It reflects the decisions made after reviewing the current frontend code and the dynamic-tool metadata plan.

### Final Direction For Frontend API

- exact-name built-in map only
- no `names: []`
- no frontend map for dynamic tools
- dynamic tools still render through the frontend, but through generic rendering fallback
- metadata only controls fold behavior and labels for dynamic tools
- `createToolRenderer(...)` is internal wiring for built-in definitions, not a public-feeling API with repeated custom callbacks everywhere
- fold behavior should mostly come from a small set of named internal fold styles, not repeated `label / preview / details` functions

### Core Model

There are four frontend buckets:

1. **Hidden tools**
   Built-in tools that should not appear at all.

2. **Built-in generic tools**
   Tools with an exact-name frontend entry, but whose UI component is still shared/generic.
   Example: `learning_tool_load` can still use the generic card renderer.

3. **Built-in custom tools**
   Tools with an exact-name frontend entry and a custom or specialized shared renderer.
   Example: `read`, `bash`, `skill`, `search_standards`.

4. **Dynamic tools**
   No frontend entry.
   They use generic rendering fallback plus `metadata.buddy.toolUi` for fold behavior.

### Important Clarification

Dynamic tools are **not** "metadata only" in the sense of skipping frontend rendering.

They still render in the frontend.

What is metadata-only is the classification path:

- no built-in map entry
- no dedicated renderer registration
- no frontend alias wiring
- only fold behavior / labels come from metadata

The actual visual card still comes from the generic tool fallback path.

### Why This Is Simpler

- built-in tools stay explicit and easy to scan
- dynamic tools stay unbounded without any frontend maintenance
- shared generic renderers are still reused where appropriate
- no unnecessary abstraction like `names: []`
- no fake unification between built-in and dynamic tools

### Type Shape

```ts
// registry.ts
export const TOOL_FOLD_STYLES = ["none", "search", "read", "brief", "artifact"] as const

export type ToolFoldStyle = (typeof TOOL_FOLD_STYLES)[number]

export type ToolRendererDefinition = {
  hidden?: boolean
  component?: (props: ToolPartProps) => ReactNode
  fold?: ToolFoldStyle
}

export type ToolRenderer = ToolRendererDefinition

export function createToolRenderer(definition: ToolRendererDefinition): ToolRenderer {
  return definition
}
```

### Built-In Tool Map

One exact name per built-in entry.

```ts
// tools.tsx
export const builtInTools: Record<string, ToolRenderer> = {
  read: createToolRenderer({
    component: ReadToolCard,
    fold: "read",
  }),

  list: createToolRenderer({
    component: SearchToolCard,
    fold: "search",
  }),

  glob: createToolRenderer({
    component: SearchToolCard,
    fold: "search",
  }),

  grep: createToolRenderer({
    component: SearchToolCard,
    fold: "search",
  }),

  websearch: createToolRenderer({
    component: ExaSearchToolCard,
    fold: "search",
  }),

  codesearch: createToolRenderer({
    component: ExaSearchToolCard,
    fold: "search",
  }),

  edit: createToolRenderer({
    component: EditToolCard,
  }),

  write: createToolRenderer({
    component: EditToolCard,
  }),

  apply_patch: createToolRenderer({
    component: ApplyPatchToolCard,
  }),

  bash: createToolRenderer({
    component: BashToolCard,
    fold: "brief",
  }),

  webfetch: createToolRenderer({
    component: WebfetchToolCard,
    fold: "brief",
  }),

  task: createToolRenderer({
    component: TaskToolCard,
  }),

  skill: createToolRenderer({
    component: SkillToolCard,
    fold: "brief",
  }),

  learning_tool_search: createToolRenderer({
    component: GenericToolCard,
    fold: "search",
  }),

  learning_tool_load: createToolRenderer({
    component: GenericToolCard,
    fold: "brief",
  }),

  search_standards: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  get_standard: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  get_learning_components: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  get_prerequisites: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  get_next_standards: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  get_crosswalk: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  query_standards_sql: createToolRenderer({
    component: KnowledgeGraphToolCard,
    fold: "brief",
  }),

  pedagogy_resource_ingest_full_text: createToolRenderer({
    component: BuddyCustomToolCard,
    fold: "brief",
  }),

  learner_snapshot_read: createToolRenderer({
    component: BuddyCustomToolCard,
    fold: "artifact",
  }),

  question: createToolRenderer({
    component: QuestionToolCard,
  }),

  render_figure: createToolRenderer({
    component: RenderFigureToolCard,
  }),

  render_freeform_figure: createToolRenderer({
    component: RenderFigureToolCard,
  }),

  render_mermaid: createToolRenderer({
    component: RenderMermaidToolCard,
  }),

  render_saved_question_set: createToolRenderer({
    component: SavedQuestionSetToolCard,
  }),

  todowrite: createToolRenderer({
    hidden: true,
  }),

  todoread: createToolRenderer({
    hidden: true,
  }),
}
```

### Why Exact Entries Are Fine

Even when multiple built-in tools share the same component and fold style, exact entries are still easier to understand than `names: []` or alias helpers.

This is deliberate duplication in service of readability.

### Internal Fold Style Resolution

This is where the repeated `label / preview / details` logic moves.

It becomes internal wiring, not per-tool API surface.

```ts
// fold-styles.ts
export type ResolvedFold = {
  label: string
  preview?: string
  details?: string[]
  suppressError?: boolean
}

export function resolveBuiltInFold(
  style: ToolFoldStyle,
  props: ToolPartProps,
): ResolvedFold | undefined {
  switch (style) {
    case "none":
      return undefined
    case "search":
      return {
        label: buildLabel(props.info.title, searchInputText(props)),
        preview:
          summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? searchInputText(props),
      }
    case "read":
      return {
        label: buildLabel(props.info.title, props.info.subtitle),
        preview: summarizeText(props.state.output, PREVIEW_MAX_CHARS),
        details: [props.info.subtitle, summarizeText(props.state.output, PREVIEW_MAX_CHARS)].filter(
          isNonEmptyString,
        ),
        suppressError: true,
      }
    case "brief":
      return {
        label: props.info.title,
        details: [props.info.subtitle, props.info.summary].filter(isNonEmptyString),
        suppressError: true,
      }
    case "artifact":
      return {
        label: props.info.title,
        details: [
          readNonEmptyString(props.state.metadata.artifact),
          summarizeText(props.state.output, PREVIEW_MAX_CHARS),
        ].filter(isNonEmptyString),
        suppressError: true,
      }
  }
}
```

### Full Frontend Flow

#### 1. `tools.tsx`

Becomes a simple exact-name built-in map.

This file answers only one question:

"Does this exact built-in tool name have special frontend behavior?"

It does **not** attempt to model dynamic tools.

#### 2. `registry.ts`

Becomes a thin helper module around `builtInTools`.

```ts
export function getBuiltInToolRenderer(tool: string): ToolRenderer | undefined {
  return builtInTools[tool]
}

export function isHiddenTool(tool: string): boolean {
  return builtInTools[tool]?.hidden === true
}

export function hasBuiltInFold(tool: string): boolean {
  return builtInTools[tool]?.fold !== undefined
}
```

#### 3. `tool-part.tsx`

Built-in lookup first. Otherwise generic fallback.

```tsx
export const ToolPartCard = memo(function ToolPartCard({ part, ... }) {
  if (isHiddenTool(part.tool)) {
    return null
  }

  const renderer = getBuiltInToolRenderer(part.tool)
  if (renderer?.component) {
    const Component = renderer.component
    return <Component {...props} />
  }

  if (isBuddyCustomTool(part.tool) && part.tool !== "python_calculator") {
    return <BuddyCustomTool {...props} />
  }

  return <GenericTool {...props} />
})
```

Meaning:

- built-in exact match gets special frontend UI
- everything else still renders generically
- dynamic tools work without frontend registration

#### 4. `message-utils.ts`

Tool grouping checks two paths:

- built-in fold style
- dynamic metadata fallback

```ts
function isFoldTool(part: ChatToolPart): boolean {
  if (hasBuiltInFold(part.tool)) {
    return true
  }

  return parseToolUiMetadata(parseToolState(part).metadata)?.presentation === "hidden-summary"
}
```

That removes `ABSTRACTABLE_TOOLS` without pretending every tool is built-in.

#### 5. `hidden-steps/index.tsx`

This is the main integration point.

It creates fold entries like this:

1. if built-in tool has `fold`, resolve it via `resolveBuiltInFold(style, props)`
2. else if metadata says `hidden-summary`, create generic dynamic fold entry
3. else no fold entry

```ts
function createEntry(part: MessagePart): FoldEntry {
  if (part.type !== "tool") {
    return { part, brief: false }
  }

  const state = parseToolState(part)
  const info = getToolInfo(String(part.tool ?? ""), state)
  const tool = String(part.tool ?? "")
  const renderer = getBuiltInToolRenderer(tool)
  const props: ToolPartProps = { part, state, info, tool }
  const toolUi = parseToolUiMetadata(state.metadata)

  if (renderer?.fold) {
    return {
      part,
      state,
      info,
      fold: resolveBuiltInFold(renderer.fold, props),
      brief: renderer.component === undefined || renderer.fold === "brief" || renderer.fold === "artifact",
    }
  }

  if (toolUi?.presentation === "hidden-summary") {
    return {
      part,
      state,
      info,
      fold: {
        label: toolUi.labels?.idle ?? info.title,
        details: [info.subtitle, info.summary].filter(isNonEmptyString),
      },
      brief: true,
    }
  }

  return { part, state, info, brief: false }
}
```

#### 6. Dynamic tool behavior

Dynamic tools use existing frontend pieces:

- generic tool card renderer for full rendering
- metadata parser for fold behavior
- generic brief row inside the fold block

No custom renderer entry is required.

#### 7. Generic vs custom mapping

This answers your duplication concern.

We do **not** write a custom renderer for every built-in tool.

Instead:

- many built-in entries point to shared generic components
- some point to specialized shared components
- only a few are truly custom

Examples from current code:

- `learning_tool_load` can stay on `GenericToolCard`
- knowledge-graph tools stay on `KnowledgeGraphToolCard`
- `pedagogy_resource_ingest_full_text` and `learner_snapshot_read` stay on `BuddyCustomToolCard`
- dynamic tools stay on generic fallback with metadata-driven folding

So the map is not "one renderer per tool".
It is "one exact built-in entry per tool name, pointing at a shared or custom renderer".

### Files to Touch

1. `packages/web/src/components/chat/tools/tools.tsx`
2. `packages/web/src/components/chat/tools/registry.ts`
3. `packages/web/src/components/chat/tools/fold-styles.ts` (new)
4. `packages/web/src/components/chat/parts/assistant-part/tool-part.tsx`
5. `packages/web/src/components/chat/utils/message-utils.ts`
6. `packages/web/src/components/chat/tools/hidden-steps/index.tsx`
7. `packages/web/src/components/chat/utils/constants.ts`
8. `packages/web/src/components/chat/tools/parse-tool-ui-metadata.ts`

Possible light-touch renderer file edits only if we want each file to export a `createToolRenderer(...)` definition later:

9. `packages/web/src/components/chat/tools/render/read.tsx`
10. `packages/web/src/components/chat/tools/render/search.tsx`
11. `packages/web/src/components/chat/tools/render/skill.tsx`
12. `packages/web/src/components/chat/tools/render/buddy-custom.tsx`
13. `packages/web/src/components/chat/tools/render/knowledge-graph.tsx`
14. `packages/web/src/components/chat/tools/render/generic.tsx`

### Open Questions

1. Should `createToolRenderer(...)` stay at all, or should `builtInTools` just be plain objects since the helper is now almost zero-value?

2. Do you like the named fold styles (`"search" | "read" | "brief" | "artifact"`), or do you want fewer / different names?

3. For metadata-driven dynamic fold entries, is `label + details` enough for now, or do you want generic preview support too?

4. Should `question` remain a special case in `assistantPartRenderable`, or should we leave that out of this refactor and revisit later?

## Iteration 6

This iteration supersedes Iteration 5.

### Principle

- built-in tools use an exact-name frontend config
- dynamic tools do not use a frontend config
- dynamic tools still render on the frontend, but through generic fallback
- `createToolRenderer(...)` is internal wiring for built-in tools
- summary behavior should be named by what the UI does, not vague fold jargon

### API Shape

```ts
type ToolSummaryEntry = "row" | "card"

type ToolSummarySource = "info" | "query" | "read" | "artifact"

type ToolSummary = {
  entry: ToolSummaryEntry
  source: ToolSummarySource
  suppressError?: boolean
}

type ToolRenderer = {
  hidden?: boolean
  card?: (props: ToolPartProps) => ReactNode
  summary?: ToolSummary
}

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}
```

Meaning:

- `hidden` means do not render the tool at all
- `card` is the full tool renderer
- `summary.entry: "row"` means the tool shows as a compact row inside the summary block
- `summary.entry: "card"` means the tool shows in the summary block and expands to its full card
- `summary.source` is internal wiring for how label / preview / details are derived

### Example 1: built-in generic tool

```ts
const builtInTools = {
  learning_tool_load: createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "row",
      source: "info",
      suppressError: true,
    },
  }),
}
```

This is still a built-in tool because we want explicit frontend behavior.
But it does not need a custom card. It reuses the shared generic card.

### Example 2: built-in tool with renderer

```ts
const builtInTools = {
  list: createToolRenderer({
    card: SearchToolCard,
    summary: {
      entry: "card",
      source: "query",
    },
  }),
}
```

This tool has explicit frontend behavior and uses a specialized renderer.

### Example 3: dynamic tool

Dynamic tool has no frontend entry:

```ts
metadata: {
  buddy: {
    toolUi: {
      presentation: "hidden-summary",
      labels: {
        idle: "Reflection",
        running: "Guiding reflection",
      },
    },
  },
}
```

This tool still renders on the frontend.

What it does not have is:

- a built-in map entry
- a dedicated renderer registration
- any alias wiring

It uses generic fallback plus metadata-driven summary behavior.

### One tool end to end: `list`

1. A message part arrives with `tool: "list"`.
2. The frontend checks the exact-name built-in map and finds `builtInTools.list`.
3. Because `summary` exists, `list` is grouped into the summary block instead of rendering inline.
4. `summary.source === "query"` tells the internal summary resolver to build the label/preview from query-like inputs and output.
5. Because `summary.entry === "card"`, expanding the summary block renders the full `SearchToolCard`.
6. No metadata is needed for this tool's summary behavior because it is built-in.

### Dynamic tool flow

1. A message part arrives with some dynamic tool name that is not in `builtInTools`.
2. Built-in lookup misses.
3. The frontend parses `metadata.buddy.toolUi`.
4. If `presentation === "hidden-summary"`, the tool is grouped into the summary block.
5. The summary row uses generic metadata-aware fallback logic.
6. If a full card is needed, the tool still uses the existing generic tool fallback, not a dedicated renderer entry.

### Internal summary resolution

The repeated `label / preview / details` logic should not be exposed on every tool definition.

That logic moves behind one internal resolver:

```ts
type ResolvedSummary = {
  label: string
  preview?: string
  details?: string[]
  suppressError?: boolean
}

function resolveBuiltInSummary(
  summary: ToolSummary,
  props: ToolPartProps,
): ResolvedSummary {
  switch (summary.source) {
    case "info":
      return {
        label: props.info.title,
        details: [props.info.subtitle, props.info.summary].filter(isNonEmptyString),
        suppressError: summary.suppressError,
      }
    case "query":
      return {
        label: buildLabel(props.info.title, searchInputText(props)),
        preview:
          summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? searchInputText(props),
        suppressError: summary.suppressError,
      }
    case "read":
      return {
        label: buildLabel(props.info.title, props.info.subtitle),
        preview: summarizeText(props.state.output, PREVIEW_MAX_CHARS),
        details: [props.info.subtitle, summarizeText(props.state.output, PREVIEW_MAX_CHARS)].filter(
          isNonEmptyString,
        ),
        suppressError: summary.suppressError,
      }
    case "artifact":
      return {
        label: props.info.title,
        details: [
          readNonEmptyString(props.state.metadata.artifact),
          summarizeText(props.state.output, PREVIEW_MAX_CHARS),
        ].filter(isNonEmptyString),
        suppressError: summary.suppressError,
      }
  }
}
```

This is internal wiring.

The per-tool API stays small.

### What changed from the previous iteration

- no `names: []`
- no grouped tool registrations
- no pretending dynamic tools are part of the built-in map
- no repeated per-tool callback soup
- summary behavior is described in UI terms: `row` vs `card`

### Open Questions

1. Are `summary.entry: "row" | "card"` the right UI words?

2. Are `summary.source: "info" | "query" | "read" | "artifact"` the right internal names, or do you want better names there too?

3. Does this iteration finally match the split you want: built-in exact map, generic fallback for dynamic tools, and minimal per-tool API?

## Iteration 7

This iteration supersedes Iteration 6.

### Idea

Use one frontend API after resolution:

```ts
type ResolvedToolUi = {
  hidden: boolean
  card: "none" | "generic" | ((props: ToolPartProps) => ReactNode)
  summary?: {
    entry: "row" | "card"
    label: string
    preview?: string
    details?: string[]
    suppressError?: boolean
  }
}
```

The important change is:

- built-in config and dynamic metadata are just inputs
- transcript rendering only reads `ResolvedToolUi`

### Inputs

Built-in tool config:

```ts
const builtInTools = {
  list: {
    card: SearchToolCard,
    summary: { entry: "card", source: "query" },
  },
  learning_tool_load: {
    card: "generic",
    summary: { entry: "row", source: "info", suppressError: true },
  },
  todowrite: {
    card: "none",
    hidden: true,
  },
}
```

Dynamic tool metadata:

```ts
metadata: {
  buddy: {
    toolUi: {
      presentation: "hidden-summary",
      labels: {
        idle: "Reflection",
        running: "Guiding reflection",
      },
    },
  },
}
```

### Resolver

```ts
function resolveToolUi(part: ChatToolPart): ResolvedToolUi {
  const state = parseToolState(part)
  const info = getToolInfo(part.tool, state)
  const builtIn = builtInTools[part.tool]
  const toolUi = parseToolUiMetadata(state.metadata)

  if (builtIn?.hidden) {
    return {
      hidden: true,
      card: "none",
    }
  }

  if (builtIn) {
    return resolveBuiltInToolUi(builtIn, { part, state, info, tool: part.tool })
  }

  if (toolUi?.presentation === "hidden-summary") {
    return {
      hidden: false,
      card: "generic",
      summary: {
        entry: "row",
        label: toolUi.labels?.idle ?? info.title,
        details: [info.subtitle, info.summary].filter(isNonEmptyString),
      },
    }
  }

  return {
    hidden: false,
    card: "generic",
  }
}
```

### One end-to-end flow: `list`

1. tool part arrives with `tool: "list"`
2. `resolveToolUi(part)` finds built-in config for `list`
3. resolver returns:

```ts
{
  hidden: false,
  card: SearchToolCard,
  summary: {
    entry: "card",
    label: "List: src/components",
    preview: "...",
  },
}
```

4. transcript groups it into the summary block because `summary` exists
5. expanded rendering uses the full `SearchToolCard` because `summary.entry === "card"`

### One end-to-end flow: dynamic tool

1. tool part arrives with a dynamic tool name not in `builtInTools`
2. `resolveToolUi(part)` misses built-in config
3. resolver reads `metadata.buddy.toolUi`
4. resolver returns:

```ts
{
  hidden: false,
  card: "generic",
  summary: {
    entry: "row",
    label: "Reflection",
    details: ["..."],
  },
}
```

5. transcript groups it into the summary block
6. if rendered as a card elsewhere, it still uses the generic tool card path

### Why This Is Better

- one presentation model for built-in and dynamic tools
- no frontend registration for dynamic tools
- no transcript code branching on "built-in vs dynamic" everywhere
- built-in config stays small
- metadata stays the source for dynamic tool presentation

### Open Questions

1. Is `ResolvedToolUi` the right center of gravity for the frontend API?
2. Are `card: "none" | "generic" | component` and `summary.entry: "row" | "card"` good names?
3. If this is right, I should delete the older iterations or mark them clearly as obsolete in the doc. Do you want that?

## Iteration 8

This iteration supersedes Iteration 7.

Iteration 7 was wrong because it threw away the typed renderer system and replaced it with a loose `card: "none" | "generic" | component` union.

The correct direction is:

- keep typed renderers
- extend the renderer system to dynamic tools too
- do that with a shared dynamic renderer, not per-tool frontend registration

### API

```ts
type ResolvedToolSummary = {
  entry: "row" | "card"
  label: string
  preview?: string
  details?: string[]
  suppressError?: boolean
}

type ToolRenderer = {
  renderCard: (props: ToolPartProps) => ReactNode
  resolveSummary?: (props: ToolPartProps) => ResolvedToolSummary | undefined
  hidden?: boolean
}

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}

type ResolvedToolUi = {
  hidden: boolean
  renderer: ToolRenderer
  summary?: ResolvedToolSummary
}
```

### Shared renderers

```ts
const genericToolRenderer = createToolRenderer({
  renderCard: renderGenericTool,
})

const dynamicToolRenderer = createToolRenderer({
  renderCard: renderGenericTool,
  resolveSummary: (props) => {
    const toolUi = parseToolUiMetadata(props.state.metadata)
    if (toolUi?.presentation !== "hidden-summary") {
      return undefined
    }

    return {
      entry: "row",
      label: toolUi.labels?.idle ?? props.info.title,
      details: [props.info.subtitle, props.info.summary].filter(isNonEmptyString),
    }
  },
})

const searchToolRenderer = createToolRenderer({
  renderCard: renderSearchTool,
  resolveSummary: (props) => resolveNamedSummary("query", props),
})

const readToolRenderer = createToolRenderer({
  renderCard: renderReadTool,
  resolveSummary: (props) => resolveNamedSummary("read", props),
})

const hiddenToolRenderer = createToolRenderer({
  renderCard: () => null,
  hidden: true,
})
```

The repeated `label / preview / details` logic stays internal inside helpers like `resolveNamedSummary(...)`.
It does not leak into every tool entry.

### Built-in exact-name map

```ts
const builtInTools: Record<string, ToolRenderer> = {
  read: readToolRenderer,
  list: searchToolRenderer,
  glob: searchToolRenderer,
  grep: searchToolRenderer,
  learning_tool_load: genericSummaryToolRenderer,
  search_standards: knowledgeGraphToolRenderer,
  get_standard: knowledgeGraphToolRenderer,
  pedagogy_resource_ingest_full_text: buddyCustomToolRenderer,
  learner_snapshot_read: learnerSnapshotToolRenderer,
  todowrite: hiddenToolRenderer,
  todoread: hiddenToolRenderer,
}
```

This stays explicit.
Dynamic tools are not listed here.

### Resolver

```ts
function resolveToolUi(part: ChatToolPart): ResolvedToolUi {
  const state = parseToolState(part)
  const info = getToolInfo(part.tool, state)
  const props: ToolPartProps = { part, state, info, tool: part.tool }

  const renderer =
    builtInTools[part.tool] ??
    (parseToolUiMetadata(state.metadata)?.presentation === "hidden-summary"
      ? dynamicToolRenderer
      : genericToolRenderer)

  return {
    hidden: renderer.hidden === true,
    renderer,
    summary: renderer.resolveSummary?.(props),
  }
}
```

### One built-in flow: `list`

1. `resolveToolUi(part)` finds `builtInTools.list`
2. that returns `searchToolRenderer`
3. `searchToolRenderer.resolveSummary(...)` returns a `summary` with `entry: "card"`
4. transcript groups it into the summary block
5. expanded rendering uses `searchToolRenderer.renderCard`

### One dynamic flow

1. no built-in renderer is found
2. metadata says `presentation: "hidden-summary"`
3. resolver picks `dynamicToolRenderer`
4. dynamic renderer produces a row summary from metadata + generic info
5. full card rendering still uses the generic tool card

### Why this is better

- dynamic tools join the same renderer system
- typed renderers stay intact
- built-in map stays small and explicit
- dynamic tools still need no frontend registration
- transcript code can consume one resolved shape

### Open Questions

1. Is this the right center of gravity: `resolveToolUi(part)` returning a typed renderer plus resolved summary?
2. Do you want `entry: "row" | "card"` renamed?
3. If this is the right direction, I should stop iterating on the loose union versions and collapse the doc around this model.

## Iteration 9

This iteration supersedes Iteration 8.

Use Iteration 6 as the base model, with one addition:

- keep `createToolRenderer(...)` for built-in tools
- add a small `createDynamicToolRenderer(...)` helper for metadata-driven tools
- do not invent a second renderer system
- do not remove typed renderers

### API Shape

```ts
type ToolSummaryEntry = "row" | "card"

type ToolSummarySource = "info" | "query" | "read" | "artifact"

type ToolSummary = {
  entry: ToolSummaryEntry
  source: ToolSummarySource
  suppressError?: boolean
}

type ToolRenderer = {
  hidden?: boolean
  card?: (props: ToolPartProps) => ReactNode
  summary?: ToolSummary
}

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}

function createDynamicToolRenderer(metadata: ParsedToolUiMetadata | undefined): ToolRenderer {
  if (metadata?.presentation !== "hidden-summary") {
    return createToolRenderer({
      card: GenericToolCard,
    })
  }

  return createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "row",
      source: "info",
    },
  })
}
```

### Built-in tool example

```ts
const builtInTools = {
  list: createToolRenderer({
    card: SearchToolCard,
    summary: {
      entry: "card",
      source: "query",
    },
  }),

  learning_tool_load: createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "row",
      source: "info",
      suppressError: true,
    },
  }),

  todowrite: createToolRenderer({
    hidden: true,
  }),
}
```

### Dynamic tool example

```ts
const toolUi = parseToolUiMetadata(state.metadata)
const renderer = createDynamicToolRenderer(toolUi)
```

Dynamic tools still render through the same renderer shape.
The only difference is that their renderer is resolved from metadata instead of a built-in map entry.

### One end-to-end flow: `list`

1. `part.tool === "list"`
2. exact-name built-in lookup returns `builtInTools.list`
3. `summary.entry === "card"` puts it inside the summary block
4. `summary.source === "query"` resolves the label/preview from query-like inputs
5. expanded rendering uses `SearchToolCard`

### One end-to-end flow: dynamic tool

1. built-in lookup misses
2. frontend parses `metadata.buddy.toolUi`
3. frontend calls `createDynamicToolRenderer(toolUi)`
4. if `presentation === "hidden-summary"`, the returned renderer includes `summary: { entry: "row", source: "info" }`
5. tool still renders through `GenericToolCard`

### Why this is the right direction

- same typed renderer shape for built-in and dynamic tools
- built-in tools stay explicit
- dynamic tools still require no frontend registration
- Iteration 6 simplicity stays intact
- dynamic tools get a tiny bridge helper instead of a whole new model

### Open Questions

1. Is `createDynamicToolRenderer(...)` the right addition, or do you want the dynamic path to resolve directly to a `ToolRenderer` without a named helper?
2. Should `summary.source: "info"` be the default for dynamic tools, or do you want a separate source name for metadata-driven tools?
3. If this is right, I should ignore Iterations 7 and 8 and continue from this model only.

## Iteration 10

This iteration uses the Iteration 6 model with a small dynamic bridge.

### API

```ts
type ToolSummaryEntry = "row" | "card"

type ToolSummarySource = "info" | "query" | "read" | "artifact"

type ToolSummary = {
  entry: ToolSummaryEntry
  source: ToolSummarySource
  suppressError?: boolean
}

type ToolRenderer = {
  hidden?: boolean
  card?: (props: ToolPartProps) => ReactNode
  summary?: ToolSummary
}

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}

function createDynamicToolRenderer(metadata: ParsedToolUiMetadata | undefined): ToolRenderer {
  if (metadata?.presentation !== "hidden-summary") {
    return createToolRenderer({
      card: GenericToolCard,
    })
  }

  return createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "row",
      source: "info",
    },
  })
}
```

### Example 1: custom built-in tool

```ts
const builtInTools = {
  list: createToolRenderer({
    card: SearchToolCard,
    summary: {
      entry: "card",
      source: "query",
    },
  }),
}
```

End-to-end flow:

1. a part arrives with `tool: "list"`
2. exact-name built-in lookup hits `builtInTools.list`
3. `summary.source = "query"` tells the internal summary resolver to derive label/preview from query-like inputs and output
4. `summary.entry = "card"` means the tool is grouped into the summary block
5. when the summary block is expanded, it renders `SearchToolCard`

### Example 2: generic built-in tool

```ts
const builtInTools = {
  learning_tool_search: createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "card",
      source: "query",
    },
  }),
}
```

End-to-end flow:

1. a part arrives with `tool: "learning_tool_search"`
2. exact-name built-in lookup hits `builtInTools.learning_tool_search`
3. the same internal `query` summary resolver builds the label/preview
4. `summary.entry = "card"` means the tool is grouped into the summary block
5. when expanded, it renders the shared `GenericToolCard`, not a custom tool component

### Example 3: dynamic tool

Backend metadata:

```ts
metadata: {
  buddy: {
    toolUi: {
      presentation: "hidden-summary",
      labels: {
        idle: "Reflection",
        running: "Guiding reflection",
      },
    },
  },
}
```

Runtime bridge:

```ts
const toolUi = parseToolUiMetadata(state.metadata)
const renderer = createDynamicToolRenderer(toolUi)
```

End-to-end flow:

1. a part arrives with a tool name that is not in `builtInTools`
2. built-in lookup misses
3. the frontend parses `metadata.buddy.toolUi`
4. `createDynamicToolRenderer(...)` returns the same typed `ToolRenderer` shape
5. because `presentation = "hidden-summary"`, it returns `summary: { entry: "row", source: "info" }`
6. the tool is grouped into the summary block
7. its card renderer still stays `GenericToolCard`

### Why this matches the current direction

- built-in tools stay explicit
- dynamic tools use the same typed renderer shape
- dynamic tools still need no frontend registration
- shared generic renderers stay shared
- repeated summary derivation stays internal

## Iteration 11

Use Iteration 10 as the base model, with three completion rules for the remaining tools.

### Rule 1: inline-only tools stay simple

If a tool is currently inline-only, keep it as:

```ts
createToolRenderer({
  card: SomeToolCard,
})
```

No `summary` field.

This covers, without UI or behavior change:

- `edit`
- `write`
- `apply_patch`
- `task`
- `python_calculator`
- `question`
- `render_figure`
- `render_freeform_figure`
- `render_mermaid`
- `render_saved_question_set`

### Rule 2: add two summary sources that match current behavior

Add:

```ts
type ToolSummarySource =
  | "info"
  | "query"
  | "read"
  | "artifact"
  | "command"
  | "link"
```

Use them like this:

```ts
bash: createToolRenderer({
  card: BashToolCard,
  summary: {
    entry: "row",
    source: "command",
  },
})

webfetch: createToolRenderer({
  card: WebfetchToolCard,
  summary: {
    entry: "row",
    source: "link",
    suppressError: true,
  },
})
```

This keeps their current summary behavior without forcing them into the wrong source bucket.

### Rule 3: keep dynamic tools minimal

Do not promise richer dynamic summary behavior yet.

Keep the bridge minimal:

```ts
function createDynamicToolRenderer(metadata: ParsedToolUiMetadata | undefined): ToolRenderer {
  if (metadata?.presentation !== "hidden-summary") {
    return createToolRenderer({
      card: GenericToolCard,
    })
  }

  return createToolRenderer({
    card: GenericToolCard,
    summary: {
      entry: "row",
      source: "info",
    },
  })
}
```

This matches current behavior:

- hidden-summary dynamic tools become summary rows
- everything else stays on generic rendering
- no frontend dynamic-tool map is introduced

### Result

With these three rules, the Iteration 10 model covers the current renderer set without changing UI or behavior.
