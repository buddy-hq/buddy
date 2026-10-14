# W-T handoff

The test harness and owned migrations are implemented; final acceptance is blocked by six full-app import failures outside W-T ownership. The complete design, inventory, coverage account, per-file status table, public helper signatures and verification are in [reports/w-t-report.md](reports/w-t-report.md).

## Done

- Direct Buddy contexts and authored-definition execution, with Buddy-owned IDs and no v1 runtime types.
- Disposable v2 catalog host through the real runtime plugin, notebook configuration and wrapped permission replies.
- Deterministic scripted feature-tool turns.
- Migration of every owned v1 harness consumer; existing direct tests use the rewritten helper.
- Actual registered-schema assertions, full-text capacity cases without `ctx.extra`, real large-output turn and external-media permission rejection.
- Fifteen requested files green: 110 tests. The six failures occur before test assertions.
- Changed-file lint and import-contract checks green. Package typecheck has no diagnostics in W-T's inventory; other migration errors remain.

## Decisions

No user decisions, production behaviour changes, new dependencies or source patches.

## Status table

See the complete 21-row table in [the report](reports/w-t-report.md#per-file-focused-results). Blocked files:

1. `test/figures/freeform-tools.test.ts`
2. `test/figures/tools.test.ts`
3. `test/flashcard/flashcard-tools-routes.test.ts`
4. `test/html-widgets/html-widgets.test.ts`
5. `test/mermaid/inline-objects.test.ts`
6. `test/question-set/question-set-tools-routes.test.ts`

## What remains, in order

1. W-E1 / the orchestrator finishes removing active v1 forwarding consumers in `learning/prompt/message-prompt-pipeline.ts`, `learning/agent-execution/transforms/command-transform.ts` and the old forwarding runtime/transform. The report lists every remaining relevant importer.
2. Once no importers remain, the module owner can remove obsolete adapter `agent`, `id`, `instance`, `registry` and related v1 exports. W-T did not delete them.
3. Re-run each blocked file with the focused package command. Fix any feature-tool regression it then exposes; preserve all route assertions.
4. Re-run scoped lint/import checks and serial package typecheck only if further code changes require it. The orchestrator performs root integration lint/typecheck.
5. Update the report when all 21 files are green.

## Traps

Use `await using runtime = await ensureBuddyPluginTools(directory, plugins)`; the helper returns a local sandbox host, not global registry initialization. `createToolContext` is now a Buddy context alias and requires `directory`. Unit tests should use `BuddyTool.run`.

Use the existing runtime-first load order before standalone feature catalogs because the current feature/persona graph has a known initialization cycle. Test code uses actual implementations and no module mocks.

Permission replies use `{ decision: "reject", message? }`. `permission.list` returns an array; model/message list methods return `{ data }`. Use the wrapped host so reject-with-feedback is retained.

The large ingestion turn logs temporary-notebook snapshot warnings; tool output assertions pass. Snapshot capture and actual Windows execution remain unverified.

## Verification

From `packages/buddy`:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts <file>
```

All 21 files were attempted individually: 15 green / 110 tests, 6 blocked before execution on `opencode/agent/agent`, `opencode/session/schema` or `opencode/session/session`. Root changed-file oxlint and import-contract check pass. `bun run --cwd packages/buddy typecheck` exits 2 on other migration files; no W-T inventory diagnostics. Scoped diff whitespace check passes.

No real Buddy home, Electron userData, XDG state or notebook state was accessed. Test state is created by the required preload/sandbox and temporary-directory helpers. No vendor/route/runtime/config edits, root verification, install, formatting, commits or browser actions were performed.
