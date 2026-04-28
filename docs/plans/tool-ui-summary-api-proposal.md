# Tool UI Summary API Proposal

## Current Code

Current pipeline in `packages/web/src/components/chat/tools`:

1. `built-in-tool-renderers.ts` defines tools with `createToolRenderer({ card, summary })`
2. `tool-registry-types.ts` defines:
   - `ToolRenderer = { hidden?, card?, summary? }`
   - `ToolSummary = { display, pattern, suppressError? }`
3. `tool-summary-resolver.ts` resolves one summarized entry from `summary.pattern`
4. `hidden-steps/entries.ts` separately groups repeated summarized entries with `BUCKET_REGISTRY`

That split is the current problem.

## What The Code Supports

These claims are grounded in the current code:

- `createToolRenderer({ card, summary })` should stay the public API
- `summary.pattern` already owns single-entry compact rendering
- repeated-call aggregation is currently a second system in `entries.ts`
- card renderer reuse is not a valid aggregation key

Examples from the current tool table:

- `learning_tool_search` and `learning_tool_load` both use `renderGenericTool`, but should not aggregate together
- `pedagogy_resource_ingest_full_text` and `learner_snapshot_read` both use `renderBuddyCustomTool`, but should not aggregate together
- `list` / `glob` / `grep` and `websearch` / `codesearch` should aggregate together even though they use different card renderers

## Recommendation

Keep `summary.pattern` for single-entry rendering.

Add `summary.aggregate` so the same tool-owned `summary` config also drives repeated-call aggregation.

For the first slice, do **not** move title or phase-label ownership out of `tool-info.ts`.

In this slice:

- `tool-info.ts` stays the source of truth for current titles and localized phase labels
- `summary.aggregate` only replaces the repeated-call bucket registry
- `summary.pattern` stays as-is for single-entry rendering

This is the first safe slice because it stays close to the current code.

It does **not** require:

- a new wrapper like `chrome`
- a new `group` abstraction
- deriving aggregation from renderers
- rewriting all pattern logic at once

## Proposed First-Slice Types

```ts
type ToolSummary = {
  display: ToolSummaryDisplay
  pattern: ToolSummaryPattern
  suppressError?: boolean
  aggregate?: ToolSummaryAggregate
}

type ToolSummaryAggregate =
  | { key: string; mode: "none" }
  | { key: string; mode: "label-times"; label: string }
  | { key: string; mode: "action-times"; action: string }
  | {
      key: string
      mode: "count-items"
      past: string
      singular: string
      plural: string
    }

type ResolvedToolSummary = {
  display: ToolSummaryDisplay
  label: string
  preview?: ResolvedSummaryContent
  details?: ResolvedSummaryContent[]
  errorPreview?: string
  errorVisibility: "visible" | "suppressed"
  suppressError?: boolean
  aggregate?: ResolvedToolSummaryAggregate
}

type ResolvedToolSummaryAggregate =
  | { key: string; mode: "label-times"; label: string }
  | { key: string; mode: "action-times"; action: string }
  | {
      key: string
      mode: "count-items"
      past: string
      singular: string
      plural: string
    }
```

Notes:

- `pattern` stays because `tool-summary-resolver.ts` already uses it
- `aggregate` is new and replaces the tool-name bucket registry
- `aggregate.key` is explicit so grouping identity does not depend on UI copy

## Concrete Examples

```ts
grep: createToolRenderer({
  card: renderSearchTool,
  summary: {
    display: "card",
    pattern: "query",
    aggregate: {
      key: "search",
      mode: "action-times",
      action: "Searched",
    },
  },
})

websearch: createToolRenderer({
  card: renderExaSearchTool,
  summary: {
    display: "card",
    pattern: "query",
    aggregate: {
      key: "search",
      mode: "action-times",
      action: "Searched",
    },
  },
})

bash: createToolRenderer({
  card: renderBashTool,
  summary: {
    display: "row",
    pattern: "command",
    aggregate: {
      key: "terminal",
      mode: "label-times",
      label: "Terminal",
    },
  },
})

read: createToolRenderer({
  card: renderReadTool,
  summary: {
    display: "row",
    pattern: "read",
    suppressError: true,
    aggregate: {
      key: "read",
      mode: "count-items",
      past: "Read",
      singular: "file",
      plural: "files",
    },
  },
})

learning_tool_search: createToolRenderer({
  card: renderGenericTool,
  summary: {
    display: "row",
    pattern: "info",
    aggregate: {
      key: "tool-search",
      mode: "label-times",
      label: "Search Tools",
    },
  },
})
```

This example set is intentionally limited to tools that are already bucketed today.

## Resolver Changes

`tool-summary-resolver.ts` should do two things:

1. keep resolving `label`, `preview`, `details`, and `errorVisibility` from `pattern`
2. also resolve `summary.aggregate` into `ResolvedToolSummary.aggregate`

That means repeated-call aggregation no longer needs a tool-name registry.

Suggested resolution rules:

- fallback label remains `props.info.title`
- `ResolvedToolSummary.aggregate.key` comes from `summary.aggregate.key`
- backend `toolUi.labels` stays out of scope for this slice

## Hidden Steps Changes

`hidden-steps/entries.ts` should stop owning tool families.

Instead:

- if `entry.summary.aggregate` exists, use its `key`
- format aggregate text from `entry.summary.aggregate.mode`
- otherwise fall back to the current `label:${label}` behavior

That removes:

- `BUCKET_REGISTRY`
- `TOOL_BUCKET_MAP`
- all tool-name sets in `entries.ts`

## Step-By-Step Implementation Plan

1. Extend `ToolSummary` and `ResolvedToolSummary` in `tool-registry-types.ts` with `aggregate`.
2. Teach `tool-summary-resolver.ts` to emit `ResolvedToolSummary.aggregate`.
3. Replace `BUCKET_REGISTRY` usage in `hidden-steps/entries.ts` with generic formatting based on `entry.summary.aggregate`.
4. Preserve the current fallback behavior for non-aggregated tools by keeping `label:${label}` grouping.
5. Migrate `built-in-tool-renderers.ts` to set `summary.aggregate` only for the tools already bucketed today.
6. Keep `tool-info.ts` unchanged for this slice except where strictly needed by touched files.
7. Update or add targeted frontend tests around hidden-steps summaries.
8. Run scoped `bun fmt`, scoped `bun lint`, and scoped `bun typecheck`, and only act on errors from touched files.

## Open Questions

These are intentionally left open for a later slice:

- whether `pattern` should later be renamed to something like `build`
- whether more aggregate modes are needed
- whether labels should later move under `summary`
- how fallback/custom hidden-summary tools should opt into aggregate behavior later
