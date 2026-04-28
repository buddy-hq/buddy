# Upstream Fetch Audit

Date: 2026-03-20
Repo: `/Users/prashantbhudwal/Code/buddy`
Mode used for the audit: read-only survey only until this file write

## Scope

This audit answers the user's question: if Buddy updates `vendor/opencode` to the current upstream `dev` tree, what is likely to break, what is safe, and whether any issue appears fundamentally unfixable.

No fetch, pull, subtree update, build, install, test, rsync, or other workspace mutation was performed during the audit itself. The only mutation performed in this session is creation of this file.

## Inputs And Reference Points

- Buddy repo root: `/Users/prashantbhudwal/Code/buddy`
- Current vendored OpenCode path: `/Users/prashantbhudwal/Code/buddy/vendor/opencode`
- Local upstream clone: `/Users/prashantbhudwal/Code/opencode`
- Target upstream branch: `dev`
- Expected remotes from the user's algorithm: `opencode-upstream` and `local_opencode`

## Survey Method

The survey followed the spirit of the user's algorithm without actually fetching or syncing:

1. Inspect current Buddy git state and known remote refs already present locally.
2. Compare current `vendor/opencode` against the already-known `local_opencode/dev` and `opencode-upstream/dev` refs without updating them.
3. Compare specific high-risk files directly between Buddy's vendored snapshot and the local upstream clone.
4. Inspect Buddy adapter seams in `packages/opencode-adapter`.
5. Inspect Buddy runtime/build files that directly depend on OpenCode internals.
6. Inspect upstream OpenCode files affecting server startup, migrations, DB pathing, plugins, and prompt assembly.
7. Use a separate code-exploration subagent to cross-check likely adapter/runtime breakages.

## Baseline Observations

### Current repo state

The audit checked the current git workspace state via `git status --short`, current branch via `git branch --show-current`, remotes via `git remote -v`, and known remote-tracking refs via `git rev-parse --verify refs/remotes/...`.

Key conclusions from those checks:

- The Buddy workspace is already a git repo and may be dirty.
- The survey did not reset, clean, or alter unrelated changes.
- Both `refs/remotes/opencode-upstream/dev` and `refs/remotes/local_opencode/dev` already exist locally.
- The locally known `opencode-upstream/dev` and `local_opencode/dev` refs point at the same tree, so for this survey there is no visible divergence between the GitHub mirror and the local upstream clone.

### Vendor lag status

The current vendored OpenCode snapshot is behind the upstream `dev` tree.

Evidence gathered:

- `vendor/opencode/packages/opencode/package.json` in Buddy reports version `1.2.17`.
- `/Users/prashantbhudwal/Code/opencode/packages/opencode/package.json` in the local upstream clone reports version `1.2.24`.
- A broad tree comparison and direct file reads showed meaningful differences in source and dependency metadata.

## Important Direct Comparisons

### `package.json` drift

Buddy vendored OpenCode package:

- File: `vendor/opencode/packages/opencode/package.json`
- Version: `1.2.17`

Local upstream clone package:

- File: `/Users/prashantbhudwal/Code/opencode/packages/opencode/package.json`
- Version: `1.2.24`

Notable upstream package changes observed:

- Added `effect`
- Added `semver`
- Added `which`
- Added `@effect/language-service`
- Added `@types/semver`
- Added `@types/which`
- `drizzle-kit` and `drizzle-orm` moved from `1.0.0-beta.12-a5629fb` to `1.0.0-beta.16-ea816b6`
- `@opentui/core` and `@opentui/solid` moved from `0.1.86` to `0.1.87`

These package-level changes matter mostly because Buddy sidecar/build flows depend on the vendored package metadata and because the migration/runtime code changed alongside the dependency bump.

### `db.ts` drift

Buddy vendored database runtime:

- File: `vendor/opencode/packages/opencode/src/storage/db.ts`

Local upstream database runtime:

- File: `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`

Important upstream changes relative to Buddy vendor:

- Added imports from `../installation`, `../flag/flag`, and `@/util/iife`.
- `OPENCODE_MIGRATIONS` type changed from `{ sql: string; timestamp: number }[]` to `{ sql: string; timestamp: number; name: string }[]`.
- Database path logic no longer always uses `opencode.db`; it can derive `opencode-<channel>.db` depending on installation channel unless `Flag.OPENCODE_DISABLE_CHANNEL_DB` is set.
- Upstream now logs and opens the database using the computed `Path` constant rather than a hardcoded `path.join(Global.Path.data, "opencode.db")`.
- Upstream `drizzle({ client: sqlite })` no longer passes `schema` into `drizzle` at that callsite.
- Upstream can skip migrations by mutating each entry's SQL to `select 1;` when `Flag.OPENCODE_SKIP_MIGRATIONS` is set.
- Upstream widened transaction typing using `SQLiteTransaction<"sync", void, any, any> | Client` and uses a cast in `Client().transaction`.

### `OPENCODE_MIGRATION_DIR` check

The audit searched Buddy's vendored OpenCode source for `OPENCODE_MIGRATION_DIR` and did not find it in `vendor/opencode/packages/opencode/src`.

Conclusion:

- The known historical vendor patch point around `OPENCODE_MIGRATION_DIR` is not currently present in the vendored OpenCode source.
- This is good news: that specific old patch drift does not appear to be blocking an upstream sync.

## Adapter Surface Audit

Buddy routes most OpenCode access through `packages/opencode-adapter`.

Files in the adapter currently re-export or wrap these upstream modules:

- `opencode/plugin/index`
- `opencode/session/instruction`
- `opencode/session/system`
- `opencode/provider/auth`
- `opencode/session/message-v2`
- `opencode/mcp/index`
- `opencode/command/index`
- `opencode/auth/index`
- `opencode/util/wildcard`
- `opencode/session/prompt`
- `opencode/provider/provider`
- `opencode/session/index`
- `opencode/server/server`
- `opencode/tool/tool`
- `opencode/tool/truncation`
- `opencode/tool/edit`
- `opencode/tool/write`
- `opencode/file/time`
- `opencode/tool/registry`
- `opencode/lsp/index`
- `opencode/project/project`
- `opencode/permission/next`
- `opencode/provider/transform`
- `opencode/project/instance`
- `opencode/agent/agent`
- `opencode/config/config`

Result:

- Every current adapter import target still exists upstream.
- No adapter import path examined during this audit has disappeared upstream.
- This means the likely breakages are API-shape and behavior changes, not path-removal failures.

## Buddy Files That Directly Depend On Vendor Internals

The audit found Buddy files outside the adapter that depend directly on vendored OpenCode internals or packaging layout:

- `packages/buddy/script/build-compiled-binary.ts`
- `packages/buddy/script/build-single.ts`
- `packages/buddy/script/build-sidecar.ts`
- `packages/desktop/scripts/utils.ts`
- `packages/buddy/src/opencode-runtime/runtime.ts`
- `packages/buddy/src/opencode-runtime/env.ts`
- `packages/buddy/src/learning/agent-execution/state/full-system-prompt.ts`

These files are the main risk concentration for a vendor sync.

## Likely Breakages

### 1. Server entrypoint mismatch

Severity: High

Buddy files affected:

- `packages/buddy/src/opencode-runtime/runtime.ts:28`
- `packages/opencode-adapter/src/server.ts`

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/server/server.ts`

What Buddy does now:

- `packages/buddy/src/opencode-runtime/runtime.ts` calls `Server.App()` inside `loadOpenCodeApp()`.
- `packages/opencode-adapter/src/server.ts` re-exports `Server` from `opencode/server/server`.

What upstream now exposes:

- `Server.Default = lazy(() => createApp({}))`
- `Server.createApp(opts)`

Why this is likely to break:

- The subagent inspection found upstream moved away from the old `App()` shape.
- Buddy still expects `Server.App()`.
- If the vendor sync lands without changing Buddy runtime code, runtime boot and/or typechecking are likely to fail because Buddy will call a no-longer-supported server entrypoint shape.

Fixability assessment:

- Fixable with a small Buddy-side runtime/adapter refactor.
- Not a fundamental incompatibility.

### 2. Embedded OpenCode migration payload shape is stale

Severity: High

Buddy files affected:

- `packages/buddy/script/build-compiled-binary.ts:4`
- `packages/buddy/script/build-single.ts`
- `packages/buddy/script/build-sidecar.ts`
- `packages/desktop/scripts/utils.ts`
- potentially the desktop packaging flow that consumes the built sidecar bundle/resources

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts`
- `/Users/prashantbhudwal/Code/opencode/packages/opencode/migration`

What Buddy does now:

- `packages/buddy/script/build-compiled-binary.ts` defines `MigrationEntry` as:

```ts
type MigrationEntry = {
  sql: string
  timestamp: number
}
```

- It reads OpenCode migration folders and embeds them into compile-time defines as `OPENCODE_MIGRATIONS: JSON.stringify(opencodeMigrations)`.

What upstream now expects:

- `declare const OPENCODE_MIGRATIONS: { sql: string; timestamp: number; name: string }[] | undefined`

Why this is likely to break:

- Buddy currently embeds entries without `name`.
- Upstream runtime now expects and uses the widened shape.
- If Buddy syncs vendor without updating the build script, compiled binaries may fail at typecheck/build time or behave incorrectly at runtime depending on how Bun inlines the define and how the value is consumed.

Fixability assessment:

- Fixable by updating Buddy's migration embedding code.
- Not a fundamental incompatibility.

### 3. OpenCode migration set is newer upstream than in current vendor

Severity: High

Buddy files affected:

- `packages/buddy/script/build-compiled-binary.ts`
- desktop sidecar packaging flows that rely on embedded OpenCode migrations

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/migration`

Observed risk:

- The exploration agent found the local upstream clone contains newer OpenCode migrations than the current vendored snapshot, including `20260228203230_blue_harpoon` and `20260309230000_move_org_to_state`.

Why this is likely to break or misbehave:

- Buddy desktop resources only copy Buddy migrations into `src-tauri/resources/migrations/buddy` through `packages/desktop/scripts/utils.ts:199`.
- OpenCode migrations for sidecars are expected to come from the compile-time embedded `OPENCODE_MIGRATIONS` define.
- If the embedded payload is stale or malformed, there is no obvious secondary desktop resource copy path for OpenCode migrations.

Fixability assessment:

- Fixable by updating the embedded migration payload and validating the sidecar packaging path.
- Not a fundamental incompatibility.

### 4. Database file naming may change because of upstream channel-aware DB path logic

Severity: Medium

Buddy files affected:

- `packages/buddy/src/opencode-runtime/env.ts:65`
- `packages/buddy/script/build-compiled-binary.ts`
- desktop/runtime flows that assume a stable `opencode.db` name

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/storage/db.ts:31`
- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/flag/flag.ts:64`
- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/installation/index.ts`

What upstream now does:

- Computes DB path based on installation channel.
- Uses `opencode.db` only for `latest`, `beta`, or when `OPENCODE_DISABLE_CHANNEL_DB` is truthy.
- Otherwise uses a sanitized `opencode-<channel>.db` filename.

What Buddy does now:

- `packages/buddy/src/opencode-runtime/env.ts` sets XDG paths and a few OpenCode env vars.
- It does not currently set `OPENCODE_DISABLE_CHANNEL_DB`.
- A workspace search found no Buddy package code currently setting either `OPENCODE_DISABLE_CHANNEL_DB` or `OPENCODE_SKIP_MIGRATIONS`.

Why this is risky:

- Buddy may unexpectedly stop using a single predictable `opencode.db` filename.
- This can lead to DB path drift, parallel DB files, migration confusion, and tooling assumptions breaking in subtle ways.

Fixability assessment:

- Fixable either by adopting the new naming intentionally or by pinning old behavior with `OPENCODE_DISABLE_CHANNEL_DB=1`.
- Not a fundamental incompatibility.

### 5. Plugin `serverUrl` compatibility risk

Severity: Medium

Buddy files affected:

- `packages/buddy/src/learning/agent-execution/state/full-system-prompt.ts:60`
- any Buddy flow that triggers OpenCode plugin hooks and relies on plugins that expect `serverUrl`

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/plugin/index.ts:37`

What upstream now does:

- Plugin input defines `get serverUrl(): URL { throw new Error("Server URL is no longer supported in plugins") }`.

Why this is risky:

- Buddy calls `Plugin.trigger("experimental.chat.system.transform", ...)` in its prompt-building flow.
- If any installed plugin tries to read `serverUrl`, that plugin will now throw.
- This is conditional on plugin behavior, so it is a compatibility hazard rather than a guaranteed universal break.

Fixability assessment:

- Fixable by adapting plugin expectations or ensuring plugins do not depend on `serverUrl`.
- Not a fundamental incompatibility.

### 6. Buddy's mirrored full-system-prompt builder will drift further from upstream behavior

Severity: Low

Buddy files affected:

- `packages/buddy/src/learning/agent-execution/state/full-system-prompt.ts`

Upstream source causing it:

- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/session/prompt.ts:653`
- `/Users/prashantbhudwal/Code/opencode/packages/opencode/src/session/system.ts:59`

Observed upstream behavior:

- Upstream system prompt assembly now adds the skills section via `SystemPrompt.skills(agent)` between environment prompts and instruction prompts.
- `SystemPrompt.environment(model)` includes both working directory and workspace root information.

What Buddy does now:

- Buddy's `buildFullSystemPrompt()` uses `SystemPrompt.environment(model)` and `InstructionPrompt.system()`.
- It does not include the upstream `SystemPrompt.skills(agent)` call.

Why this matters:

- Buddy's displayed/debugged/derived full system prompt may not match the actual OpenCode runtime prompt after sync.
- This is mainly a parity and observability issue, not a hard runtime blocker.

Fixability assessment:

- Fixable with a prompt builder parity update.
- Not a fundamental incompatibility.

## Things That Look Safe Or Low-Risk

These items looked safe or comparatively low-risk in this survey:

- No adapter import path currently used by `packages/opencode-adapter/src/*.ts` appears to have been removed upstream.
- `packages/opencode-adapter/src/permission.ts` re-exports `PermissionNext` from `opencode/permission/next`, and that upstream area looked effectively unchanged.
- `agent`, `auth`, `command`, `provider-auth`, `session/message-v2`, `tool/registry`, `tool/tool`, and `util/wildcard` appear unchanged or close enough to be low-risk relative to the higher-priority server/migration issues.
- `Session.create` gaining optional `workspaceID` looked additive rather than breaking for Buddy's current usage patterns.
- `Project` and `Instance` changed upstream, but the survey did not find evidence that Buddy's current callsites are using removed APIs.

## What Does Not Look Unfixable

The user explicitly asked whether any issue looks fundamentally unfixable.

Conclusion:

- Nothing found in this audit appears fundamentally unfixable.
- The observed issues look like integration drift and seam changes, not a core architectural incompatibility between Buddy and upstream OpenCode.
- The likely fixes are Buddy-side refactors, mostly concentrated in runtime startup, migration embedding, sidecar packaging validation, and prompt/plugin parity.

More specifically:

- `Server.App()` to `Server.Default()` or equivalent is a straightforward runtime seam update.
- Migration payload shape updates are a contained build-script refactor.
- Channel DB naming is a configuration/runtime decision, not an upstream lockout.
- Plugin `serverUrl` removal is a compatibility adjustment, not a model-breaking change.
- Prompt assembly drift is a parity update.

The migration/build-path area is the heaviest part, but still looks fixable with careful Buddy-side changes.

## Additional Notes From The Exploration Subagent

The separate exploration subagent independently reported:

- `Server.App()` disappearance is the clearest hard break.
- Embedded OpenCode migrations are now both the wrong shape and likely incomplete.
- Channel DB logic is a silent behavior-change risk.
- Plugin `serverUrl` removal is a conditional plugin-break risk.
- The mirrored full-system-prompt builder is likely to drift from upstream actual behavior.
- Adapter import paths themselves still exist.

This matched the manual inspection and increased confidence in the findings.

## Recommended Pre-Sync Fix Order

If a future implementation pass is approved, the lowest-risk order is:

1. Update Buddy runtime startup to the new upstream server entrypoint shape.
2. Update `packages/buddy/script/build-compiled-binary.ts` to embed OpenCode migrations with the upstream shape, including `name`.
3. Validate that the newer upstream migration folders are included in the embedded payload.
4. Decide whether Buddy should preserve a single DB filename by setting `OPENCODE_DISABLE_CHANNEL_DB`, or intentionally adopt channel-specific DB files.
5. Re-check any installed or supported plugins for `serverUrl` usage.
6. Update Buddy's mirrored prompt builder to include upstream skills/prompt assembly parity if prompt introspection accuracy matters.

## Overall Verdict

If Buddy syncs `vendor/opencode` to the current upstream `dev` snapshot without Buddy-side follow-up changes, some things are likely to break.

The most concrete expected breakages are:

- server startup entrypoint mismatch
- embedded OpenCode migration payload mismatch
- sidecar/desktop migration packaging risk

But nothing discovered in this survey suggests the update is blocked by a fundamental, unfixable upstream change.

