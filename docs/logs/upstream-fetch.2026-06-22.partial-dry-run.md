# Upstream Fetch Partial Dry Run - 2026-06-22

## Scope

- Time: 2026-06-22 01:59 IST
- Main repo: `/Users/prashantbhudwal/Code/buddy`
- Dry-run worktree: `/Users/prashantbhudwal/Code/buddy/.tmp-vendor-check-0622`
- Dry-run branch: `codex/vendor-check-0622`
- Dry-run HEAD: `5a450c2119`
- Starting vendored OpenCode version: `1.16.2`
- Dry-run vendored OpenCode version: `1.17.9`
- Result: evaluation only. No vendor sync was applied to the real worktree.

## Size

The dry-run diff is mechanically large but mostly contained to `vendor/opencode`.

```text
1120 files changed, 35031 insertions(+), 120379 deletions(-)
```

Vendor-only tracked diff:

```text
1107 files changed, 34610 insertions(+), 116849 deletions(-)
```

Additional untracked files in the dry-run worktree:

```text
478
```

Top changed vendor areas by tracked path count:

```text
481 vendor/opencode/packages/opencode
241 vendor/opencode/packages/core
113 vendor/opencode/packages/app
 44 vendor/opencode/packages/web
 37 vendor/opencode/packages/console
 32 vendor/opencode/packages/ui
 32 vendor/opencode/packages/server
 31 vendor/opencode/packages/llm
 21 vendor/opencode/packages/stats
 17 vendor/opencode/packages/desktop
```

Largest untracked vendor area:

```text
235 vendor/opencode/packages/tui
```

## Non-vendor anomaly

The dry run also showed 13 tracked paths outside `vendor/opencode`:

```text
.githooks/pre-commit
.githooks/pre-push
.zed/settings.json
COMMANDS.AGENTS.md
LICENSE
bun.lock
cspell-words.txt
cspell.json
designs/provider-dialog.html
designs/provider-flow.html
package.json
packages/buddy/package.json
skills-lock.json
```

Most of these are suspicious top-level deletions and should not be carried into
a real sync. Expected non-vendor carry-over should be limited to root package
metadata and lockfile changes required by the upstream package graph, plus any
Buddy-owned compatibility fixes.

## Validation Results

| Check | Result | Notes |
|-------|--------|-------|
| `bun typecheck` | **FAIL** | Narrow `@buddy/backend` failures listed below |
| `bun ./script/typecheck-lock.ts -- bun ./node_modules/turbo/bin/turbo run typecheck --filter='@buddy/*' --only --concurrency=1 --output-logs=errors-only --continue` | **FAIL** | Confirms only `@buddy/backend` failed; other Buddy packages in scope were green or cached green |
| `bun lint` | **FAIL** | Expected vendor guard failure because dry-run vendor diff is intentional |
| `ALLOW_VENDOR_SYNC=1 bun lint` | **PASS** | Theme audit passed; oxlint passed |

## Typecheck Breakage

Buddy-owned failures:

- `packages/buddy/src/learning/features/memory/session-source.ts`
  - `SessionV2` user message shape changed.
  - `file.source`, `agent.source`, and `message.references` no longer exist in the shape Buddy was reading.
  - This is a small learner-memory extraction adaptation, not a runtime migration.
- `packages/opencode-adapter/src/registry.ts`
  - `makeRuntime(...defaultLayer)` now sees a different Effect layer requirement.
- `packages/opencode-adapter/src/session-prompt.ts`
  - Same Effect layer signature drift as `registry.ts`.

Vendor-only failure:

- `vendor/opencode/packages/opencode/src/mcp/catalog.ts`
  - `result.content` is now typed as `unknown` through the upgraded MCP SDK path.
  - Prefer an upstream tag where this is fixed. If unavoidable, treat any local fix as an intentional tracked vendor patch, not as ordinary Buddy compatibility work.

## Required Buddy-side Work

Expected real work is a medium compatibility pass:

- update learner-memory `SessionV2` message extraction;
- update two adapter Effect runtime wrappers;
- carry over package catalog / install metadata for new upstream dependencies such as `@ff-labs/fff-bun`, `@tanstack/solid-virtual`, and `shiki@4`;
- re-run the normal sync gates after those changes.

This does not look like a broad Buddy product rewrite. It is large to review
because the vendor tree moved a lot, especially around core/session, server,
MCP, filesystem, and the new split-out TUI package.

## Plugin Assessment

No required Buddy plugin migration was found in this dry run.

The current Buddy runtime plugin still matches the upstream `@opencode-ai/plugin`
surface for the hooks Buddy uses:

- `tool`
- `command.execute.before`
- `experimental.chat.messages.transform`
- `experimental.chat.system.transform`

`ToolContext.ask()` is still Promise-shaped in the published plugin type. The
existing Buddy `plugin-ask-compat.ts` boundary can stay; no individual Buddy
tools need to change for plugin return-style compatibility based on this dry
run.

## V2 Assessment

Do not migrate Buddy to OpenCode v2 as part of this sync.

This snapshot has more v2 infrastructure than the previous `1.16.2` vendor:

- `SessionV2.create` is implemented against core session storage.
- `SessionV2.prompt` admits durable session input and wakes the new runner.
- `PermissionV2` routes and events exist in the new server/core path.

However, upstream `vendor/opencode/specs/v2/todo.md` still describes v2 as
mid-launch, with active work remaining in the runner, compaction, plugin API,
config, and event exposure. Buddy's own `docs/v2/permission-v2-adoption-decision.md`
still applies: permissions should move to v2 only as an end-to-end runtime
change, not by mixing `PermissionV2` into the current v1 Buddy loop.

Practical conclusion:

- keep Buddy on the current v1 runtime integration for this sync;
- do not migrate Buddy permission replies to v2 now;
- do not rewrite Buddy tools/plugins to `PluginV2` now;
- treat full v2 adoption as a separate project once the upstream active prompt,
  permission, events, and config paths are coherent for Buddy's shipped web and
  desktop flows.

## Verdict

Sync effort: **medium**.

The vendor update is large, but the observed Buddy-owned compile breakage is
small and localized. The main cost is careful validation around known sync-risk
surfaces:

- session message extraction and memory;
- dynamic tool visibility;
- permission prompt/reply flow;
- SSE tool UI decoration;
- config/tool/permission overlay isolation;
- desktop renderer assets after upstream package moves;
- package graph and lockfile alignment.

Before applying to the real worktree, fix the dry-run issues, eliminate the
non-vendor top-level deletion anomaly, and rerun the upstream-fetch validation
suite from `docs/guides/upstream-fetch.algo.md`.
