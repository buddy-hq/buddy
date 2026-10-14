# W-F2 report

## Design and status

W-F2's owned routes use the v2 promise host, explicit per-call locations, and Buddy response schemas. MCP definitions persist through W-G1's project config service. OAuth uses native integration attempts and OpenCode's callback listener, keeps browser opening and polling, rejects pasted codes, cancels replaced/removed attempts, and maps unsupported client registration to `McpClientRegistrationRequired`. Credential removal resolves connection IDs without returning secret values. The browser opener uses argument arrays on macOS and an environment variable with PowerShell on Windows.

Questions retain the web list/reply/reject contract over native session forms. Answer translation uses each native field key and option value; replies and cancellation require a pending form in the authorized notebook. The new pure event mapper bridges native form events to existing question events. W-C2 still needs to call it in the event stream; that code is outside W-F2 ownership.

Reference reads synchronize canonical notebook configuration and join `location.get` with the reference catalog to preserve Buddy's project-bearing response. W-G1 still needs forced reference reload, as detailed below. `/global/dispose` now refreshes active notebook config instead of closing runtime locations; the real-host question regression proves that a pending form survives this route.

Projects project native `canonical` and `time.active` into Buddy's existing `worktree` and `time.initialized` fields. Current project uses the native Location→Project association. Native clone associations remain intact; Buddy no longer writes a `.git/opencode` cache from these routes. Independent review finding 7 is fixed: native `ProjectNotFoundError` becomes HTTP 404 with the intended missing-project response. A real-host regression uses a valid PATCH body and nonexistent project ID.

Compatibility health/commands use native catalogs. Raw file reads use Buddy utilities and reject lexical traversal, absolute paths outside the notebook, and symlink escapes before serving bytes. `globalEvents: { subscribe: subscribeGlobalEvent }` remains intact. Both desktop entrypoints already use Buddy-owned server helpers and had no remaining adapter server imports; they required no edits.

## W-F2 file inventory

Created:

- `packages/opencode-adapter/src/gateway/form.ts`
- `packages/opencode-adapter/test/gateway-form.test.ts`
- `packages/buddy/src/project/contract.ts`
- `packages/buddy/test/question-routes.test.ts`
- `packages/buddy/test/compatibility-routes.test.ts`
- `packages/buddy/test/mcp/oauth-routes.test.ts`
- This report and `reports/w-f2-seams.md`.

Changed:

- `packages/buddy/src/routes/{mcp,global,question,reference,project,compatibility}.ts`
- `packages/buddy/src/project/orchestration/project-operations.ts`
- `packages/buddy/test/{project-routes,reference-routes,open-project-routes,local-runtimes-routes,presented-media-routes}.test.ts`
- `packages/buddy/test/mcp/routes.test.ts`
- `packages/opencode-adapter/src/index.ts` and `package.json`: only removed exports for deleted W-F2 modules.

Deleted after checking importers across packages:

- `packages/opencode-adapter/src/{command,mcp,mcp-oauth-branding,server}.ts`
- `packages/opencode-adapter/test/mcp-oauth-branding.test.ts`, superseded by real native OAuth route coverage rather than global HTML-patch assertions.

Retained: adapter `project.ts` has the remaining type importer `packages/opencode-adapter/src/instance.ts:8`. The importer is W-G1-owned. No W-F2 consumer imports it. Other workstreams' edits in the dirty worktree are excluded from this inventory.

## Integration seams

1. W-C2: import `toBuddyQuestionEvent(event: OpenCodeEvent, directory: string): BuddyEvent | undefined` from `@buddy/opencode-adapter/gateway/form` into `subscribeBuddyEvents`. Call for `form.created/replied/cancelled` after directory authorization. Created forms use `event.data.form.sessionID`; settlement uses `event.data.sessionID`. If location is absent, resolve the owning session and enforce canonical directory containment, not project-ID equality alone. Global MCP elicitation forms are filtered. See `w-f2-seams.md`.
2. W-G1: in `registerNotebookConfig(ctx)`'s sync RPC, call `await ctx.reference.reload()` on `input.force`, including the late-transform reinstall branch. This completes `syncOpenCodeProjectConfig(directory: string, force?: boolean): Promise<void>` for the existing reference retry. Add a regression for references changing after initialization while a pending form survives. No new service signature is needed.
3. W-G1: remove the `instance.ts` type dependency before deleting adapter `project.ts` and its exports.
4. Orchestrator: regenerate Buddy SDK from these route schemas. Named `Project` and `McpStatus` schema identities are preserved; the public question shape remains stable. The MCP status schema adds native `pending`; OAuth start adds `attemptID` and callback supports waiting without a pasted code.

Consumed W-G1 services: `putProjectMcpConfig({ directory, name, payload })` and `refreshActiveNotebookConfigs(): Promise<void>`. No dependency additions or installation are needed.

## Decisions for the user

None requiring a new product choice. Existing question/project shapes, imported project associations, built-in OAuth branding, and callback-based authentication follow the brief. Pasted-code callback requests now fail explicitly rather than misleadingly claiming success.

## Verification

All runtime tests used the configured test sandbox and temporary notebooks; OAuth used a local fixture and injected browser opener. No real Buddy/Electron/XDG state or real credentials were used.

From `packages/buddy`, ran each file in a separate process with `bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts <file>`:

| File | Result |
| --- | --- |
| `test/question-routes.test.ts` | 2 pass |
| `test/project-routes.test.ts` | 4 pass, including finding 7 |
| `test/reference-routes.test.ts` | 2 pass |
| `test/compatibility-routes.test.ts` | 3 pass |
| `test/mcp/routes.test.ts` | 3 pass, including config persistence over host restart |
| `test/mcp/oauth-routes.test.ts` | 1 pass, browser callback, polling, cancellation, credential removal, registration error, pasted-code rejection |
| `test/open-project-routes.test.ts` | Blocked before tests by `opencode/agent/agent` import in adapter `agent.ts` |
| `test/local-runtimes-routes.test.ts` | Same external module-load blocker |
| `test/presented-media-routes.test.ts` | Same external module-load blocker |

`bun run --cwd packages/opencode-adapter test test/gateway-form.test.ts --test-name-pattern 'projects question option labels|does not turn MCP elicitation'`: 2 pass, 32 filtered, 0 fail. The adapter script fixes the `test` directory in its command; an initial run with only a file argument expanded to all 34 discovered tests, yielding 33 pass and an unrelated `theme-contrast` failure. The subsequent name filter restricted execution to W-F2 cases.

`bun run --cwd packages/web test test/mcp-config-schema.test.ts test/mcp-settings.test.ts test/mcp-settings-concurrency.test.tsx`: 18 pass across schema/settings tests; concurrency test could not load missing generated SDK `types.gen.js`. SDK regeneration belongs to integration.

`bun run --cwd packages/buddy typecheck` and `bun run --cwd packages/opencode-adapter typecheck` ran serially: nonzero from remaining migration files, no diagnostics in W-F2-owned source/tests. A later Buddy recheck was refused because another agent held the typecheck lock; the lock was respected.

`bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json <W-F2 source and test files>`: 0 diagnostics. Scoped `git diff --check`: pass. `bun ./script/check-import-contract.ts`: the only finding was the out-of-scope `packages/buddy/test/learning/ingest-full-text-plugin.test.ts` import of `@opencode-ai/plugin`; no W-F2 findings.

Unverified: native browser launching on macOS/Windows, full desktop packaging, web question event delivery until W-C2 integrates the mapper, forced reference refresh until W-G1 supplies the reload, and the three blocked full-app test files. No root lint/typecheck, install, formatting, vendor edits, or git mutation was performed.
