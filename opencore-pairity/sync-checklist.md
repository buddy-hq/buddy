# OpenCore Vendor Refresh Checklist

## Goal

Use vendored OpenCode core directly, with Buddy as a thin adapter/product layer.

## Per Refresh Run

1. Refresh vendored packages from OpenCode:
   - `packages/opencode` -> `vendor/opencode-core`
   - `packages/util` -> `vendor/opencode-util`
   - `packages/plugin` -> `vendor/opencode-plugin`
   - `packages/sdk/js` -> `vendor/opencode-sdk`
   - `packages/script` -> `vendor/opencode-script`
2. Run `bun install` at Buddy root.
3. Verify vendored runtime import from Buddy execution context.
4. Re-run Buddy gates:
   - `bun run typecheck`
   - `bun run test`
5. Update `opencore-pairity/sync-log.md` with:
   - vendored package refs
   - core adapter modules touched
   - validation status

## Migration Mode (While Wrappers Are Still Being Replaced)

1. Pick a core module batch (agent/session/tool/permission/project).
2. Move Buddy implementation out of `packages/buddy/src` into adapter wrappers.
3. Route wrapper to vendored OpenCode implementation.
4. Run full test/typecheck before next batch.

## Rules

- Do not reintroduce duplicated core implementations in `packages/buddy/src`.
- Keep Buddy-only product logic separate from vendored core logic.
- No refresh/migration batch is complete without a `sync-log.md` entry.
- Legacy parity drift scripts are optional and should not block normal vendored-core updates.
