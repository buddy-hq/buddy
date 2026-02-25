# OpenCore Vendoring Kit

This folder defines how Buddy consumes OpenCode core directly through vendored packages.

## Scope

Buddy no longer uses parity drift tracking as the primary operating model.
`pairs.tsv` and `test-pairs.tsv` are retained as migration/history references.

`scripts/diff-pairs.sh`, `scripts/screen-coverage.sh`, and `scripts/test-coverage.sh`
are legacy parity-audit tooling. They are optional for historical audits and not
required for normal vendored-core development.

## Vendored OpenCode Core Snapshot

Buddy now vendors `packages/opencode` into:

- `vendor/opencode-core`
- `vendor/opencode-util`
- `vendor/opencode-plugin`
- `vendor/opencode-sdk`
- `vendor/opencode-script`

This is imported via `git subtree` from a `subtree split` of OpenCode's
`packages/opencode` path. We use `--squash` so Buddy history stays compact.
Auxiliary OpenCode workspace packages are vendored so `workspace:*` + `catalog:`
dependencies resolve when Buddy executes vendored core modules.

### Initial Import (already done)

```bash
# in a temp clone of OpenCode
git subtree split --prefix=packages/opencode HEAD

# in Buddy
git subtree add \
  --prefix=vendor/opencode-core \
  <opencode-temp-clone-path> \
  <split_sha> \
  --squash
```

### Update Vendor Snapshot

```bash
# 1) prepare split commit from latest OpenCode
git clone <opencode-path> /tmp/opencode-core-split-update
cd /tmp/opencode-core-split-update
SPLIT_SHA=$(git subtree split --prefix=packages/opencode HEAD)

# 2) pull into Buddy vendor path
cd /path/to/buddy
git subtree pull \
  --prefix=vendor/opencode-core \
  /tmp/opencode-core-split-update \
  "$SPLIT_SHA" \
  --squash
```

`git subtree add/pull` requires a clean Buddy worktree. If your tree is dirty,
stash and pop around the command.

## Vendor Workspace Dependencies

OpenCode core depends on additional OpenCode workspace packages. Buddy vendors:

- `vendor/opencode-util` (`@opencode-ai/util`)
- `vendor/opencode-plugin` (`@opencode-ai/plugin`)
- `vendor/opencode-sdk` (`@opencode-ai/sdk`)
- `vendor/opencode-script` (`@opencode-ai/script`)

Buddy root `package.json` workspace/catalog config is responsible for resolving
these dependencies during `bun install`.

## Operating Model

- Core runtime behavior should execute from vendored OpenCode modules.
- Buddy backend/web should call these via thin adapter seams.
- Buddy-owned code should focus on product-specific behavior.

## Maintenance Contract

- Update `sync-log.md` for each vendor refresh or core migration batch.
- Keep adapter seams thin and avoid re-implementing vendored core logic in Buddy.
- Validate with `bun run typecheck` and `bun run test` after each batch.

## Quick Start

1. Refresh vendored OpenCode packages.
2. Run `bun install`.
3. Run `bun run typecheck`.
4. Run `bun run test`.
5. Log batch details in `sync-log.md`.

## Path Resolution

Scripts resolve OpenCode from:

1. `--opencode-dir <path>` option
2. `OPENCODE_DIR` environment variable
3. `~/code/opencode`
4. `~/Code/opencode`

## Suggested Cadence

- Refresh vendor snapshots on a planned cadence (or before major core work).
- Perform migration in small wrapper batches with full test gates each batch.

Use `sync-checklist.md` as the operational runbook.

## Intentions And Risks Context

See `CONTEXT.md` for the original intent behind this folder and the known failure modes future agents should account for.

## Definition Of Done For Vendor Migration Work

1. Buddy core wrapper modules call vendored OpenCode implementations.
2. No duplicated core logic remains in targeted Buddy source modules.
3. `sync-log.md` includes refs + validation.
4. `bun run typecheck` and `bun run test` pass.
