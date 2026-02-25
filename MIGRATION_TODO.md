# Buddy -> Vendored OpenCode Migration TODO

## Ground Rule
- Target architecture: Buddy product layer + adapter only.
- No core logic should remain implemented inside `packages/buddy/src` mapped parity-core files.
- Core runtime must execute from vendored OpenCode modules.

## Phase 0 - Docs First (Requested)
- [x] Update parity docs to state direct vendoring as primary model.
- [x] Record current migration entry in `opencore-pairity/sync-log.md`.
- [ ] Add explicit "parity maintenance retired" note in `opencore-pairity/CONTEXT.md`.

## Phase 1 - Runtime Foundation
- [x] Vendor OpenCode monorepo mirror:
  - [x] `vendor/opencode` (contains `packages/opencode`, `packages/util`, `packages/plugin`, `packages/sdk`, `packages/script`)
- [x] Configure root workspaces/catalog so vendored packages install.
- [x] Verify vendored core can be imported and executed at runtime.

## Phase 2 - Adapter Wiring (In Progress)
- [x] Recreate `@buddy/opencode-adapter` package.
- [x] Route provider transform through adapter.
- [x] Execute vendor `ProviderTransform.message` at runtime via adapter.
- [ ] Add adapter modules for core namespaces:
  - [ ] `SessionProcessor`
  - [ ] `SessionPrompt`
  - [ ] `LLM`
  - [ ] `ToolRegistry`
  - [ ] `Tool`
  - [ ] `PermissionNext`
  - [ ] `Agent`
  - [ ] `Instance`

## Phase 3 - Remove Core Implementations From Buddy Source
- [ ] Replace Buddy core files with thin re-export wrappers to adapter modules (no local core logic).
- [ ] Ensure mapped parity-core files in `packages/buddy/src/**` are wrappers only.
- [ ] Keep Buddy-product-only modules local.

## Phase 4 - Validation Gates
- [x] `bun run typecheck` passes.
- [x] `bun run test` passes.
- [ ] Re-run after each core namespace cutover batch.
- [ ] Smoke-check agent loop manually to confirm no "reasoning_content missing" regression.

## Phase 5 - Final Cleanup
- [ ] Remove obsolete parity drift workflow language from docs/scripts.
- [ ] Add "vendor refresh + adapter compatibility" runbook.
- [ ] Commit in logical batches:
  - [ ] docs/contracts
  - [ ] vendored deps + workspace config
  - [ ] adapter + buddy wrapper cutover
  - [ ] tests/validation fixes
