# Implementation Patterns (Vendored-Core)

Use these patterns when applying OpenCode to Buddy.

## 1) Classify First: `core-runtime` vs `buddy-product`

Use this decision table before touching code:

| Change type | Classification | Action |
| --- | --- | --- |
| tool execution, agent loop, permission matching, runtime/session plumbing | core-runtime | implement in vendored core or via thin adapter/facade wiring |
| learning UX/domain behavior, curriculum/memory strategy, React presentation | buddy-product | keep in Buddy-owned modules |

## 2) Runtime Authority Pattern

For `core-runtime` tasks, treat vendored OpenCode modules as source of truth.

- Debug/fix in `vendor/opencode-core/**` when behavior is truly core.
- Keep Buddy backend changes focused on compatibility routing, directory scoping, and product extension hooks.

## 3) Thin Adapter Pattern

Buddy adapters should translate contracts, not recreate core logic.

Good:

- Header translation (`x-buddy-directory` -> `x-opencode-directory`)
- Error/status normalization for UX compatibility
- Request body shape adaptation

Bad:

- Rebuilding full local session/processor/tool loops in `packages/buddy/src`

## 4) Vendoring Workflow Pattern

When syncing upstream:

1. refresh vendored packages
2. run install/typecheck/test gates
3. record batch in `sync-log.md`

Use `opencore-pairity/sync-checklist.md` as the executable workflow.

## 5) Divergence Logging Pattern

If you intentionally diverge from OpenCode behavior:

- keep divergence scoped to Buddy product needs
- record rationale in `sync-log.md`
- avoid silent behavior forks in adapter layers

## 6) Route/Loop Contract Pattern

When changing event/session routes:

1. preserve compatibility API behavior expected by web
2. preserve OpenCode runtime semantics underneath
3. keep transformations explicit in facade code

## 7) Message/Tool Loop Debug Pattern

For regressions in "stuck send," empty output, or tool-call loops:

1. inspect vendored OpenCode session prompt/processor path first
2. inspect Buddy facade transformations second
3. validate SSE/message resync behavior end-to-end

## 8) Legacy Mapping Pattern

`pairs.tsv` and `test-pairs.tsv` can help trace old ports, but they should not drive current implementation decisions.
