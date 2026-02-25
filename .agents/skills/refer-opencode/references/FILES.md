# Key Reference Files (Stable)

This file is intentionally stable.

Do not copy changing operational data here. Read it from `opencore-pairity/` at runtime.

## OpenCode Location

- Primary: `~/code/opencode`
- Fallback: `~/Code/opencode`

## Buddy Vendoring Runbook Location

- `opencore-pairity/README.md`
- `opencore-pairity/sync-checklist.md`
- `opencore-pairity/sync-log.md`
- `opencore-pairity/CONTEXT.md`

## Runtime Authority Directories

Use vendored code first when investigating core runtime behavior:

- `vendor/opencode-core/src/session/`
- `vendor/opencode-core/src/tool/`
- `vendor/opencode-core/src/permission/`
- `vendor/opencode-core/src/agent/`
- `vendor/opencode-core/src/provider/`
- `vendor/opencode-core/src/server/routes/`
- `vendor/opencode-core/src/config/`
- `vendor/opencode-core/src/project/`
- `vendor/opencode-core/src/global/`

Auxiliary vendored dependencies:

- `vendor/opencode-util/`
- `vendor/opencode-plugin/`
- `vendor/opencode-sdk/`
- `vendor/opencode-script/`

## Buddy Product/Facade Directories

- `packages/buddy/src/index.ts` (compatibility facade routing)
- `packages/buddy/src/routes/` (Buddy-owned endpoints)
- `packages/buddy/src/curriculum/` (learning product behavior)
- `packages/buddy/src/opencode/` (runtime bootstrap + extension hooks)
- `packages/opencode-adapter/src/` (thin adapter seams)

## Legacy References

- `opencore-pairity/pairs.tsv`
- `opencore-pairity/test-pairs.tsv`

These are historical/migration references, not the primary operating workflow.
