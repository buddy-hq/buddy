# Frontend Tool UI Final Blueprint

Implementation-ready blueprint for cleaning up frontend tool UI naming and classification without changing current UI or behavior.

This file supersedes the exploratory iterations in `docs/artifacts/plans/tool-ui-display-api-plan.md`.

## Goals

- Keep current tool cards exactly as they are.
- Keep current transcript placement exactly as it is.
- Replace scattered classification (`HIDDEN_TOOLS`, `ABSTRACTABLE_TOOLS`, `hiddenSteps`, metadata fallback) with one typed renderer model.
- Keep built-in tools explicit with exact-name entries.
- Do not introduce any frontend map for dynamic tool IDs.
- Keep `getToolInfo()` responsibilities unchanged.

## Non-Goals

- Do not redesign any card UI.
- Do not change `getToolInfo()` semantics.
- Do not change summary header aggregation (`Read N files`, `Searched N times`, reasoning grouping).
- Do not move the `question` pending/running hide behavior.
- Do not fix unrelated pre-existing naming bugs unless explicitly doing that as separate work.

## Current Behavior That Must Stay True

- Built-in tools are identified by exact tool name.
- Unregistered tools do not all use the same card fallback today.
  Buddy-prefixed tools use `BuddyCustomTool`; other unregistered tools use `GenericTool`.
- `learning_tool_search` and `learning_tool_load` are currently inline, even though they have `hiddenSteps` presenters registered.
- `getToolInfo()` is a shared info helper, but not the sole owner of visible card trigger text.
  Some cards still derive title/subtitle details from raw state.
- Summary preview/detail rendering is currently mixed:
  some content is plain text, some is markdown.
- There is a pre-existing tool-name mismatch between registered `render_saved_question_set` and `getToolInfo()` handling `save_question_set`.
  This blueprint must not widen that bug.

## Final Model

There is one typed renderer shape in the frontend.

- Built-in tools get renderer information from an exact-name map.
- Unregistered tools use current fallback precedence for inline cards.
- Summary behavior has its own precedence, which is not identical to inline card precedence.
- Dynamic tools are part of the unregistered path.
- Dynamic metadata only affects summary placement and summary labels on that unregistered path.

This means dynamic tools join the same renderer model without per-tool frontend registration, but the model must preserve the current split between inline card ownership and summary ownership.

## Final Types

```ts
type ToolSummaryDisplay = "row" | "card"

type ToolSummaryPattern =
  | "info"
  | "metadata"
  | "query"
  | "read"
  | "artifact"
  | "command"
  | "link"

type ToolSummary = {
  display: ToolSummaryDisplay
  pattern: ToolSummaryPattern
  suppressError?: boolean
}

type ToolCardRenderer = (props: ToolPartProps) => ReactNode

type ToolRenderer = {
  hidden?: boolean
  card?: ToolCardRenderer
  summary?: ToolSummary
}

function createToolRenderer(definition: ToolRenderer): ToolRenderer {
  return definition
}
```

## Built-In Exact-Name Map

Use exact-name entries only.

- no `names: []`
- no alias helpers
- deliberate duplication is preferred over an abstraction that makes the map harder to scan

Representative shape:

```ts
const hiddenToolRenderer = createToolRenderer({
  hidden: true,
})

const builtInTools: Record<string, ToolRenderer> = {
  read: createToolRenderer({
    card: ReadToolCard,
    summary: { display: "row", pattern: "read", suppressError: true },
  }),

  list: createToolRenderer({
    card: SearchToolCard,
    summary: { display: "card", pattern: "query" },
  }),

  learning_tool_search: createToolRenderer({
    card: GenericToolCard,
  }),

  learning_tool_load: createToolRenderer({
    card: GenericToolCard,
  }),

  bash: createToolRenderer({
    card: BashToolCard,
    summary: { display: "row", pattern: "command" },
  }),

  edit: createToolRenderer({
    card: EditToolCard,
  }),

  todowrite: hiddenToolRenderer,
}
```

## Inline Card Resolution

Inline card resolution must preserve current precedence exactly.

```ts
const genericToolRenderer = createToolRenderer({
  card: GenericToolCard,
})

const buddyCustomFallbackRenderer = createToolRenderer({
  card: BuddyCustomToolCard,
})

function resolveInlineCardRenderer(tool: string): ToolCardRenderer {
  if (isBuddyCustomTool(tool) && tool !== "python_calculator") {
    return BuddyCustomToolCard
  }

  return GenericToolCard
}

function resolveInlineToolRenderer(tool: string): ToolRenderer {
  const builtIn = builtInTools[tool]
  if (builtIn) {
    return builtIn
  }

  return createToolRenderer({
    card: resolveInlineCardRenderer(tool),
  })
}

## Summary Resolution Precedence

Summary resolution must preserve current precedence exactly.

- built-in summary behavior wins first
- metadata fallback applies only when no built-in summary behavior exists

function createFallbackSummary(
  toolUi: ParsedToolUiMetadata | undefined,
): ToolSummary | undefined {
  if (toolUi?.presentation !== "hidden-summary") {
    return undefined
  }

  return {
    display: "row",
    pattern: "metadata",
  }
}

function resolveSummaryDefinition(
  tool: string,
  toolUi: ParsedToolUiMetadata | undefined,
): ToolSummary | undefined {
  const builtIn = builtInTools[tool]
  return builtIn?.summary ?? createFallbackSummary(toolUi)
}

function resolveToolRenderer(
  tool: string,
  toolUi: ParsedToolUiMetadata | undefined,
): ToolRenderer {
  const inlineRenderer = resolveInlineToolRenderer(tool)

  return {
    ...inlineRenderer,
    summary: resolveSummaryDefinition(tool, toolUi),
  }
}
```

Why this split is correct:

- built-in tools stay explicit
- dynamic tools need no frontend registration
- Buddy-prefixed unregistered tools preserve their current inline `BuddyCustomTool` precedence over registry lookup
- plain unregistered tools preserve their current inline `GenericTool` fallback
- registered summary behavior still wins before metadata fallback

Important ownership rule:

- inline card choice is preserved by current precedence rules
- summary behavior is preserved by its own precedence rules
- fallback card trigger/title behavior is also preserved by current renderer ownership rules
- this refactor must not force unregistered Buddy-prefixed tools to start using metadata-driven inline card titles if they do not do so today

## Internal Summary Resolution

The public per-tool API stays small.

All label / preview / details derivation stays internal in one resolver.

The internal resolved summary shape must preserve the current text-vs-markdown distinction.

```ts
type ResolvedSummaryContentFormat = "text" | "markdown"

type ResolvedSummaryContent = {
  value: string
  format: ResolvedSummaryContentFormat
}

type ResolvedToolSummary = {
  display: ToolSummaryDisplay
  label: string
  preview?: ResolvedSummaryContent
  details?: ResolvedSummaryContent[]
  errorPreview?: string
  errorVisibility: "visible" | "suppressed"
  suppressError?: boolean
}

function resolveSummaryErrorPreview(props: ToolPartProps): string | undefined {
  const errorText = stripAnsi(String(props.state.error ?? "")).trim()
  if (errorText) {
    return errorText
  }

  const outputText = stripAnsi(String(props.state.output ?? "")).trim()
  if (outputText) {
    return outputText
  }

  if (props.tool === "bash") {
    return `${language.t("chatTools.shell")} failed.`
  }

  return props.info.title ? `${props.info.title} failed.` : "Step failed."
}

function resolveToolSummary(
  summary: ToolSummary,
  props: ToolPartProps,
): ResolvedToolSummary {
  switch (summary.pattern) {
    case "info":
      return {
        display: summary.display,
        label: buildLabel(props.info.title, props.info.summary ?? props.info.subtitle),
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }

    case "metadata":
      return {
        display: summary.display,
        label: props.info.title,
        details: [props.info.subtitle, props.info.summary]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }

    case "query": {
      const queryText =
        props.info.summary ??
        searchInputText(props) ??
        props.info.subtitle

      return {
        display: summary.display,
        label: buildLabel(props.info.title, queryText),
        preview: queryText
          ? {
              value: summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? queryText,
              format: "text",
            }
          : undefined,
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }
    }

    case "read": {
      const fileName = props.info.subtitle
      const fileDirectory = props.info.detail
      const snippet = summarizeText(props.state.output, SUMMARY_ROW_PREVIEW_MAX_CHARS)
      const markdown = isMarkdownRead(props)
      const heading = markdown ? reasoningHeading(props.state.output ?? "") : undefined
      const format: ResolvedSummaryContentFormat = markdown ? "markdown" : "text"

      return {
        display: summary.display,
        label: buildLabel(props.info.title, heading ?? fileName),
        preview:
          summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? fileName
            ? {
                value: summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? fileName ?? "",
                format,
              }
            : undefined,
        details: [fileName, fileDirectory]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" }))
          .concat(
            snippet
              ? [
                  {
                    value: snippet,
                    format,
                  },
                ]
              : [],
          ),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }
    }

    case "artifact": {
      const artifact = readNonEmptyString(props.state.metadata.artifact)
      const preview = summarizeText(props.state.output, PREVIEW_MAX_CHARS)

      return {
        display: summary.display,
        label: buildLabel(props.info.title, artifact ?? preview),
        details: [artifact, preview]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }
    }

    case "command": {
      const command =
        readNonEmptyString(props.state.input.command) ??
        props.info.subtitle

      return {
        display: summary.display,
        label: buildLabel(props.info.title, command),
        preview:
          summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? command
            ? {
                value: summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? command ?? "",
                format: "text",
              }
            : undefined,
        details: [command]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }
    }

    case "link": {
      const link = readNonEmptyString(props.state.input.url) ?? props.info.subtitle

      return {
        display: summary.display,
        label: buildLabel(props.info.title, link),
        preview:
          summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? link
            ? {
                value: summarizeText(props.state.output, PREVIEW_MAX_CHARS) ?? link ?? "",
                format: "text",
              }
            : undefined,
        details: [link]
          .filter(isNonEmptyString)
          .map((value) => ({ value, format: "text" })),
        errorPreview: summary.suppressError ? undefined : resolveSummaryErrorPreview(props),
        errorVisibility: summary.suppressError ? "suppressed" : "visible",
        suppressError: summary.suppressError,
      }
    }
  }
}
```

Error-state parity rule:

- `errorVisibility: "suppressed"` must mean the same thing current `HiddenSteps` suppression means
- suppressed errors must not count as visible hidden-step errors
- suppressed errors must not trigger hidden-step error preview styling
- suppressed errors must not contribute to hidden-step auto-open behavior
- visible errors must continue to drive current red preview styling, visible error counting, and auto-open behavior
- `errorPreview` must preserve the current fallback ladder exactly:
  `state.error` -> `state.output` -> bash-specific fallback -> `${info.title} failed.` -> `Step failed.`

## Current Tool Coverage

This is the correct model for the current registered tools if behavior must not change.

### Hidden

- `todowrite` -> hidden
- `todoread` -> hidden

### Inline-Only

- `edit` -> `EditToolCard`
- `write` -> `EditToolCard`
- `apply_patch` -> `ApplyPatchToolCard`
- `task` -> `TaskToolCard`
- `python_calculator` -> `PythonCalculatorToolCard`
- `question` -> `QuestionToolCard`
- `render_figure` -> `RenderFigureToolCard`
- `render_freeform_figure` -> `RenderFigureToolCard`
- `render_mermaid` -> `RenderMermaidToolCard`
- `render_saved_question_set` -> `SavedQuestionSetToolCard`
- `learning_tool_search` -> `GenericToolCard`
- `learning_tool_load` -> `GenericToolCard`

Important:

- `learning_tool_search` and `learning_tool_load` stay inline in this blueprint.
- Their current registered `hiddenSteps` presenters are not treated as active transcript behavior, because `ABSTRACTABLE_TOOLS` does not currently abstract them.

### Summary Card

- `list` -> `SearchToolCard`, `summary: { display: "card", pattern: "query" }`
- `glob` -> `SearchToolCard`, `summary: { display: "card", pattern: "query" }`
- `grep` -> `SearchToolCard`, `summary: { display: "card", pattern: "query" }`
- `websearch` -> `ExaSearchToolCard`, `summary: { display: "card", pattern: "query" }`
- `codesearch` -> `ExaSearchToolCard`, `summary: { display: "card", pattern: "query" }`

### Summary Row

- `read` -> `ReadToolCard`, `summary: { display: "row", pattern: "read", suppressError: true }`
- `bash` -> `BashToolCard`, `summary: { display: "row", pattern: "command" }`
- `webfetch` -> `WebfetchToolCard`, `summary: { display: "row", pattern: "link", suppressError: true }`
- `skill` -> `SkillToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `search_standards` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `get_standard` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `get_learning_components` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `get_prerequisites` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `get_next_standards` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `get_crosswalk` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `query_standards_sql` -> `KnowledgeGraphToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `pedagogy_resource_ingest_full_text` -> `BuddyCustomToolCard`, `summary: { display: "row", pattern: "info", suppressError: true }`
- `learner_snapshot_read` -> `BuddyCustomToolCard`, `summary: { display: "row", pattern: "artifact", suppressError: true }`

### Unregistered / Dynamic

- not present in `builtInTools`
- card precedence comes from `resolveInlineCardRenderer(tool)`
- summary precedence comes from `resolveSummaryDefinition(tool, parseToolUiMetadata(state.metadata))`
- `presentation: "hidden-summary"` -> `summary: { display: "row", pattern: "metadata" }`
- otherwise no summary
- fallback card stays `BuddyCustomToolCard` for Buddy-prefixed names, otherwise `GenericToolCard`

## End-to-End Examples

### 1. Custom Built-In Tool: `list`

```ts
list: createToolRenderer({
  card: SearchToolCard,
  summary: { display: "card", pattern: "query" },
})
```

Flow:

1. A part arrives with `tool: "list"`.
2. `getToolInfo("list", state)` runs first and produces the current title/subtitle/summary.
3. `resolveToolRenderer("list", toolUi)` hits the exact-name built-in entry.
4. Because `summary` exists, the part is grouped into the summary block.
5. `resolveToolSummary(...)` uses the `query` pattern to derive the current label and preview.
6. Because `display: "card"`, expanding the summary block renders `SearchToolCard`.

### 2. Generic Built-In Tool: `learning_tool_load`

```ts
learning_tool_load: createToolRenderer({
  card: GenericToolCard,
})
```

Flow:

1. A part arrives with `tool: "learning_tool_load"`.
2. Exact-name built-in lookup hits.
3. The renderer has no `summary` field, so the tool stays inline.
4. `ToolPartCard` renders the shared `GenericToolCard`.
5. This preserves current behavior even though the tool has a registered `hiddenSteps` presenter today.

### 3. Dynamic Tool: `pedagogy_reflection_v2`

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

Flow:

1. A part arrives with `tool: "pedagogy_reflection_v2"`.
2. Exact-name built-in lookup misses.
3. `parseToolUiMetadata(state.metadata)` reads the metadata.
4. `resolveInlineCardRenderer("pedagogy_reflection_v2")` returns `BuddyCustomToolCard` because the tool name matches the current Buddy custom prefix rules.
5. `resolveSummaryDefinition("pedagogy_reflection_v2", toolUi)` returns `summary: { display: "row", pattern: "metadata" }`.
6. The part is grouped into the summary block.
7. `getToolInfo()` already applies idle/running metadata labels into `info.title`, so the summary row label stays correct.
8. If the card renderer is needed, it still uses `BuddyCustomToolCard`, not `GenericToolCard`.
9. Its inline card trigger/title behavior remains whatever `BuddyCustomToolCard` currently owns. This refactor must not change that ownership.

## Edge Cases

### Hidden Tools

`todowrite` and `todoread` remain completely omitted from the transcript.

### Question Tool

Keep current behavior exactly:

- pending/running question tools are not rendered
- completed/error question tools render inline through `QuestionToolCard`

Do not move this logic as part of this refactor.

### Unregistered Plain Tool

If a tool is not in `builtInTools`, is not Buddy-prefixed, and has no `presentation: "hidden-summary"` metadata, it remains:

- visible
- inline
- rendered by `GenericToolCard`

### Unregistered Buddy-Prefixed Tool

If a tool is not in `builtInTools`, does match current Buddy custom prefixes, and has no `presentation: "hidden-summary"` metadata, it remains:

- visible
- inline
- rendered by `BuddyCustomToolCard`

### Summary Preview Fallback

If `resolveToolSummary(...)` does not provide a `preview`, the summary block preview continues to fall back to the existing `state.output` behavior.

This is important for:

- `skill`
- knowledge-graph tools
- `pedagogy_resource_ingest_full_text`
- `learner_snapshot_read`
- dynamic hidden-summary tools

### Error Preview Suppression

Preserve current behavior exactly:

- `read` -> suppressed
- `webfetch` -> suppressed
- `skill` -> suppressed
- knowledge-graph tools -> suppressed
- `pedagogy_resource_ingest_full_text` -> suppressed
- `learner_snapshot_read` -> suppressed
- `bash` -> not suppressed
- dynamic hidden-summary tools -> not suppressed

Suppression semantics include all of the following, not only preview text choice:

- whether the error is treated as visible in hidden-step error counting
- whether the hidden-step preview uses error styling
- whether completed hidden-step errors auto-open the summary block

### Mixed Text And Markdown Rendering

Do not convert all summary content to Markdown.

Preserve the current distinction:

- `read` markdown previews/details stay markdown when the file content is currently treated as markdown
- most other previews/details stay plain text
- command/snippet-style content stays plain text / monospace as it does today

Summary labels remain plain strings.

### Renderer-Owned Trigger Text

This refactor does not centralize all visible card trigger text under `getToolInfo()`.

Current renderer-owned trigger/header behavior must stay where it currently lives unless intentionally changed later.

That includes at least:

- `BuddyCustomToolCard`
- `BashToolCard`
- `SkillToolCard`
- saved-question-set renderer paths that currently derive their own trigger text

### Saved Question Set Naming Mismatch

There is a pre-existing mismatch:

- tool registration uses `render_saved_question_set`
- `getToolInfo()` has a `save_question_set` case

This blueprint does not depend on that mismatch being fixed.
Implementation should avoid widening it, but fixing it is separate work.

## Transcript Integration

The new model is only for placement and summary rendering.

Everything else stays as-is.

### `assistantPartRenderable`

- hidden renderer -> not renderable
- keep the existing `question` pending/running special case
- otherwise unchanged

### `assistantPartStartsFollowup`

- a tool does not start a followup section if its resolved renderer has a `summary`
- keep the existing `question` special case unchanged

### `groupAssistantParts`

- a tool is abstracted only if its resolved renderer has a `summary`
- reasoning handling stays unchanged
- this means `learning_tool_search` and `learning_tool_load` stay inline unless their behavior is intentionally changed later

### Summary Block Body

- `display: "row"` -> render a summary row
- `display: "card"` -> render the renderer's card in the summary block

### Summary Aggregation Header

Keep the existing grouping heuristics unchanged.

This blueprint changes renderer classification, not the current `Read N files` / `Searched N times` aggregation rules.

## Implementation Steps

Implement in this order.

### 1. Introduce the new typed renderer shape

In the frontend tool registry layer:

- add `ToolSummaryDisplay`, `ToolSummaryPattern`, `ToolSummary`, and `ToolRenderer`
- add `createToolRenderer(...)`
- do not remove the current registry yet

Goal:

- make the new renderer model available without changing behavior yet

### 2. Add the built-in exact-name map

Create `builtInTools` with exact-name entries for all currently registered tools.

Important:

- `learning_tool_search` and `learning_tool_load` must stay inline
- `todowrite` and `todoread` must stay hidden
- unregistered tools must not be forced into this map

Goal:

- encode current built-in renderer ownership explicitly

### 3. Add the fallback bridge for unregistered tools

Implement:

- `resolveInlineCardRenderer(tool)`
- `resolveSummaryDefinition(tool, toolUi)`
- `resolveToolRenderer(tool, toolUi)`

Important:

- Buddy-prefixed unregistered tools must still resolve to `BuddyCustomToolCard`
- other unregistered tools must still resolve to `GenericToolCard`
- `presentation: "hidden-summary"` must only affect summary placement, not card ownership

Goal:

- bring dynamic tools and other unregistered tools into the same typed renderer system without registration

### 4. Add internal summary resolution

Implement `resolveToolSummary(...)` and its resolved output type.

Important:

- keep text-vs-markdown distinction
- add `command` and `link` summary patterns
- do not expose callback soup on every tool entry
- model hidden-step error visibility explicitly, not just preview text

Goal:

- centralize summary label / preview / details derivation

### 5. Switch transcript placement code to the new renderer model

Update transcript logic to use resolved renderer summary presence instead of the current scattered sets.

Specifically:

- `assistantPartRenderable`
- `assistantPartStartsFollowup`
- `groupAssistantParts`

Important:

- preserve `question` special-case behavior
- keep reasoning handling unchanged
- keep `learning_tool_search` and `learning_tool_load` inline

Goal:

- replace `HIDDEN_TOOLS` and `ABSTRACTABLE_TOOLS` decisions with the new split renderer path:
  inline card precedence plus summary precedence

### 6. Switch summary block rendering to resolved summaries

Update `HiddenSteps` internals to consume the resolved summary object.

Important:

- `display: "row"` must render the compact row path
- `display: "card"` must render the full card path inside the summary block
- preview fallback to `state.output` must stay as it is today when no preview is provided
- text and markdown content must keep current rendering behavior
- error visibility must preserve current error counting, red preview styling, and auto-open behavior

Goal:

- replace `hiddenSteps` presenter wiring with the new resolved summary model

### 7. Remove obsolete classification paths

After the new path is working:

- remove `HIDDEN_TOOLS`
- remove `ABSTRACTABLE_TOOLS`
- remove `CONTEXT_TOOLS` and `isContextTool`
- remove old `hiddenSteps`-specific registration fields

Important:

- only remove these after the new path fully covers current behavior

Goal:

- complete the cleanup without changing behavior

### 8. Verify against current behavior

Verify all of the following before considering the refactor done:

- hidden tools still do not render
- `learning_tool_search` and `learning_tool_load` still render inline
- Buddy-prefixed unregistered tools still use `BuddyCustomToolCard`
- Buddy-prefixed unregistered tools still keep their current inline trigger/title behavior
- dynamic hidden-summary tools still group into the summary block
- `question` pending/running still stays hidden
- summary header aggregation still behaves the same
- read markdown summary content still renders as markdown only where it does today
- bash and webfetch summary behavior still matches current output
- hidden-step error counting still matches current behavior
- hidden-step error preview styling still matches current behavior
- hidden-step auto-open on completed errors still matches current behavior

### 9. Run required checks

- `bun fmt`
- `bun lint`
- `bun typecheck`

## End-State Checklist

- [ ] Every current built-in tool name has an exact entry in `builtInTools`
- [ ] `todowrite` and `todoread` still resolve to hidden renderers
- [ ] `learning_tool_search` stays inline
- [ ] `learning_tool_load` stays inline
- [ ] `read` resolves to summary row behavior with `read` pattern
- [ ] `bash` resolves to summary row behavior with `command` pattern
- [ ] `webfetch` resolves to summary row behavior with `link` pattern
- [ ] search-like tools (`list`, `glob`, `grep`, `websearch`, `codesearch`) resolve to summary card behavior with `query` pattern
- [ ] knowledge-graph tools resolve to summary row behavior with `info` pattern
- [ ] `learner_snapshot_read` resolves to summary row behavior with `artifact` pattern
- [ ] inline-only tools still have no summary behavior
- [ ] unregistered Buddy-prefixed tools still use `BuddyCustomToolCard`
- [ ] unregistered Buddy-prefixed tools still keep their current inline trigger/title behavior
- [ ] other unregistered tools still use `GenericToolCard`
- [ ] dynamic `presentation: "hidden-summary"` still produces summary row behavior
- [ ] dynamic `presentation: "default"` or missing metadata stays inline
- [ ] `getToolInfo()` behavior is unchanged
- [ ] renderer-owned header/subtitle behavior is unchanged
- [ ] `question` pending/running visibility behavior is unchanged
- [ ] text-vs-markdown summary rendering behavior is unchanged
- [ ] summary preview fallback behavior is unchanged
- [ ] hidden-step error counting behavior is unchanged
- [ ] hidden-step error preview styling is unchanged
- [ ] hidden-step auto-open behavior on completed errors is unchanged
- [ ] summary header aggregation behavior is unchanged
- [ ] `HIDDEN_TOOLS`, `ABSTRACTABLE_TOOLS`, and old hidden-step classification are removed only after parity is reached
- [ ] `bun fmt` passes
- [ ] `bun lint` passes
- [ ] `bun typecheck` passes

## Implementation Invariants

- No UI regression.
- No behavior regression.
- No frontend dynamic-tool map.
- No `names: []` abstraction.
- No alias helper abstraction.
- Do not force renderer-owned header/subtitle logic into `getToolInfo()`.
- Do not force renderer-owned trigger/title behavior into `getToolInfo()`.
- Do not activate currently inactive summary behavior for `learning_tool_search` or `learning_tool_load`.
- Do not collapse Buddy-prefixed unregistered tools into generic fallback.
- Do not remove the current text-vs-markdown summary rendering distinction.
- Do not regress hidden-step error counting, styling, or auto-open behavior.

## Blocker Check

No conceptual API blocker remains, but implementation is only safe if the precedence and ownership rules in this file are followed exactly.

One known pre-existing issue remains outside this refactor:

- `render_saved_question_set` vs `save_question_set`

Implementation is safe only if the ownership and error-state rules above are followed exactly.
