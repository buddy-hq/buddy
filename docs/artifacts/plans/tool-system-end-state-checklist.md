# Tool System End-State Checklist (Static + Dynamic)

This checklist defines the target wiring end state for Buddy learning tools.

Scope:

- This is a tool-definition and registration cleanup.
- End-user-visible static/dynamic tool behavior should remain the same.
- The goal is to remove redundant metadata, redundant registration steps, and naming conventions that exist only to make internal wiring convenient.

## Goals

- `createBuddyTool` is the single source of truth for tool identity and behavior.
- Static and dynamic tool authoring use the same top-level API shape.
- Tool definitions, not naming conventions, determine whether a tool is dynamic.
- Registry/catalog/permission inputs are derived from actual tool definitions wherever possible.
- No separate hand-maintained metadata list should exist if the same data can be derived.
- No extra dynamic "catalog registration" step should be required beyond registering/exporting the tool itself.

## Static Tools End State Checklist

- [x] Static tool identity (`id`, `description`, `parameters`, `capability`) is defined only in `createBuddyTool` callsites.
- [x] Static tool grouping is defined in one registry mapping.
- [x] Static tool metadata used by permission compilation is derived from the same registry source used for runtime registration.
- [x] Group-level runtime policies (warnings/dependencies) live in a dedicated policy module, separate from tool IDs.
- [x] Static tool contract tests validate:
- Runtime registration list matches permission-compiled list.
- Duplicate IDs fail fast.
- [x] Persona tool defaults reference registry-derived tool IDs rather than parallel hand-maintained ID exports.

## Dynamic Tools End State Checklist

- [x] Dynamic classification is derived from `BuddyTool.dynamic` metadata, not a forced ID prefix.
- [x] Dynamic search catalog is derived from exported/registered deferred tool definitions, not a hand-maintained ID list.
- [x] `learning_tool_search` remains discovery-only (no implicit tool exposure).
- [x] `learning_tool_load` remains explicit exposure-only (exact ID selection from latest search candidates).
- [x] Session-scoped dynamic allows remain persisted in session permission rules.
- [x] Dynamic tool visibility remains deny-by-default for Buddy agents/sessions unless explicitly loaded.
- [x] Dynamic tool cleanup remains deterministic on archive/remove/end-session paths.
- [x] Dynamic tool IDs are free-form and do not need a namespace prefix to participate in dynamic loading.
- [x] Dynamic tool tests validate:
- Next-loop visibility after load.
- Later-turn visibility in same session.
- Isolation across sessions.
- Cleanup on session end/archive.

## API Cleanliness Checklist

- [x] `createBuddyTool` remains the only authoring API for both static and dynamic tools.
- [x] Dynamic metadata lives inside `dynamic` on the same top-level definition object.
- [x] No extra manual "catalog registration" step is required for dynamic tools in end state.
- [x] Tool files export actual tool objects directly instead of wrapper factories plus separate exported ID constants.
- [x] Call sites use `tool.id` when they need a tool ID, instead of importing standalone ID constants.
- [x] No hardcoded prefix requirement is needed to mark a tool as dynamic in end state.

## Implementation Checklist

- [x] Add explicit end-state checklist document for static + dynamic tools.
- [x] Extract shared static tool group policy/type definitions into a single module.
- [x] Rewire existing imports to the shared policy module without changing behavior.
- [x] Remove dynamic classification based on namespace/prefix helpers.
- [x] Derive dynamic-tool deny/allow management from actual dynamic tool IDs rather than wildcard namespace rules.
- [x] Derive dynamic search catalog from deferred tool exports.
- [x] Derive static metadata from the static registry instead of a hand-maintained metadata table.
- [x] Flatten tool definition files so direct `createBuddyTool(...)` exports are the source of truth.
- [x] Remove stale standalone dynamic ID export modules if no longer needed.
- [x] Run focused tests plus `bun fmt`, `bun lint`, and `bun typecheck`.

## Non-Goals

- Do not redesign the external search/load UX.
- Do not change vendor code.
- Do not introduce parallel metadata systems to preserve old wiring.
