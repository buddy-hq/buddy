# W-T — feature-tool tests on v2

## Outcome

The owned harness and test migrations are implemented. Fifteen of the twenty-one requested files pass, totalling 110 tests. Six files that import the full Buddy app still fail before test execution because unowned forwarding code imports removed v1 adapter dependencies. These tests keep their route assertions and remain available to expose the integration blocker. Full W-T acceptance is pending those six files turning green.

No production tool, shim, plugin, vendor, config, session, route, adapter, transcript, web, generated, or dependency files were edited. No newly exposed feature-tool behaviour bug required a source fix. Existing concurrent edits were preserved.

## Design and public seams

`test/helpers/tools.ts` now offers two levels:

- `createBuddyToolContext({ directory, agent, sessionID?, messageID? }): BuddyToolContext` supplies Buddy-owned strings and Promise callbacks. Omitted IDs use the existing Buddy `generateObjectID()` helper with `ses_` and `msg_` prefixes. `createToolContext` remains an alias with the same input. There are no v1 IDs, registry types, Effect callbacks, or injected `extra` values.
- `listBuddyTools(): Promise<BuddyTool[]>` and `requireTool<T extends { id: string }>(tools: readonly T[], id: string): T` locate authored definitions for direct `BuddyTool.run(args, context)` tests. They exercise author parsing, normalization, permissions and feature behaviour without booting a host.
- `ensureBuddyPluginTools(directory: string, plugins: readonly Plugin.Plugin[] = [])` returns a disposable `{ host: OpenCodeHost, listTools(), [Symbol.asyncDispose]() }`. It uses W-G1's `createNotebookTestHost`, the production `createBuddyRuntimePlugin`, notebook config sync and `withBuddyToolPermissionReplies`. `listTools()` calls the public plugin `ctx.tool.list()`. Execute through the returned host's `session.create`, `session.prompt`, `session.wait` and `message.list`; use `await using` to close it. This helper no longer primes a global registry.
- `test/helpers/scripted-tool-model.ts` exports `scriptedToolModel({ name: string, arguments: object }): Plugin.Plugin`, a deterministic AISDK v3 model behind the public adapter plugin seam. Configure a `scripted` provider in the temporary notebook. It issues the requested feature tool once, then finishes after receiving the tool result. No external model service is contacted.
- `TEST_TOOL_MODEL` remains a plain-string fixture for remaining unowned consumers. Owned tests no longer need a model fixture to run an authored tool.

Schema coverage reads the Standard JSON Schema input functions on tools returned by the actual v2 plugin catalog. It checks complete Buddy registration and independent expected action contracts, omission rules and required fields. There is no v1 Effect-schema conversion fallback.

Real turns cover large full-text ingestion without runtime truncation and an external `present_media` request. The permission test verifies `external_directory`, authored file metadata and tool-call provenance, rejects with feedback through the wrapped host, and proves that no media object or pending permission remains.

Full-text unit cases obtain model capacities through the real v2 model catalog using message model references; all `ctx.extra.model` injection has been removed. Existing native-PDF deduplication, capacity ceiling, live usage, stale-estimate and concise-response assertions are preserved.

## Coverage changes

- Removed v1 registry boot/config priming and ambient Instance scaffolding from owned direct tests. Registration assertions are exercised in the actual catalog tests instead.
- Replaced the v1 proxy/internal status request regression with public host `session.active()` plus notebook config resync, checking that the feature tools remain registered.
- Replaced the old registry truncation-repair case with a real v2 turn checking the entire 1,200-line full-text payload and `metadata.truncated === false`.
- Removed v1 plugin context and `createCompatiblePluginAskHandler` fixture construction; actual v2 asks are covered by the external media turn. No product permission assertion was deleted.
- Replaced the Bench SQL guidance expectation for the v1 `message` table with v2 `session_message(id, session_id, type, seq, time_created, data JSON)`.
- Mermaid repair-turn message fixtures use the Buddy transcript contract's string IDs directly. Whiteboard fixtures use the shared Buddy context builder.
- HTML widget, question-set and browser tests already execute Buddy definitions directly; they consume the rewritten helper without source changes. The skill-tool test was already migrated by W-G1 and was verified without editing it.

## Files

Created:

- `packages/buddy/test/helpers/scripted-tool-model.ts`
- This report and `docs/architecture/v2-upstream/v2-migration/handoff-W-T.md`.

Created/changed implementation and test inventory:

- `packages/buddy/test/helpers/tools.ts`
- `packages/buddy/test/helpers/scripted-tool-model.ts`
- `packages/buddy/test/curriculum/goals-archive.test.ts`
- `packages/buddy/test/curriculum/goals-tools.test.ts`
- `packages/buddy/test/figures/freeform-tools.test.ts`
- `packages/buddy/test/figures/tools.test.ts`
- `packages/buddy/test/flashcard/flashcard-tools-routes.test.ts`
- `packages/buddy/test/learning/bench-present.test.ts`
- `packages/buddy/test/learning/bench-read-context.test.ts`
- `packages/buddy/test/learning/external-file-tool-permissions.test.ts`
- `packages/buddy/test/learning/ingest-full-text-plugin.test.ts`
- `packages/buddy/test/learning/knowledge-graph-tools.test.ts`
- `packages/buddy/test/learning/pedagogy-tools.test.ts`
- `packages/buddy/test/learning/tool-schema-compatibility.test.ts`
- `packages/buddy/test/media/present-media.test.ts`
- `packages/buddy/test/mermaid/render-tool.test.ts`
- `packages/buddy/test/mermaid/inline-objects.test.ts`
- `packages/buddy/test/whiteboard/program.test.ts`
- `packages/buddy/test/proxy-registration.test.ts`

Deleted: none. All files above other than the scripted model helper were changed. The Bench presentation test's pre-existing transcript-contract import belongs to another workstream and was preserved.

Unchanged requested files verified: `test/html-widgets/html-widgets.test.ts`, `test/learning/in-app-browser-open.test.ts`, `test/question-set/question-set-tools-routes.test.ts`, `test/skills/tool-visibility.test.ts`.

## Per-file focused results

Every row was run in its own sandboxed test process with the package command below. A blocked row means no test assertions ran; it is not counted as passing or skipped.

| File, relative to packages/buddy | Result |
| --- | --- |
| `test/curriculum/goals-archive.test.ts` | 1 passed |
| `test/curriculum/goals-tools.test.ts` | 3 passed |
| `test/figures/freeform-tools.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/figures/tools.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/flashcard/flashcard-tools-routes.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/html-widgets/html-widgets.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/learning/bench-present.test.ts` | 27 passed |
| `test/learning/bench-read-context.test.ts` | 8 passed |
| `test/learning/external-file-tool-permissions.test.ts` | 7 passed |
| `test/learning/in-app-browser-open.test.ts` | 3 passed |
| `test/learning/knowledge-graph-tools.test.ts` | 4 passed |
| `test/learning/pedagogy-tools.test.ts` | 1 passed |
| `test/media/present-media.test.ts` | 8 passed |
| `test/mermaid/render-tool.test.ts` | 3 passed |
| `test/mermaid/inline-objects.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/question-set/question-set-tools-routes.test.ts` | Blocked before tests: removed v1 runtime import |
| `test/skills/tool-visibility.test.ts` | 1 passed |
| `test/whiteboard/program.test.ts` | 35 passed |
| `test/proxy-registration.test.ts` | 1 passed |
| `test/learning/ingest-full-text-plugin.test.ts` | 6 passed |
| `test/learning/tool-schema-compatibility.test.ts` | 2 passed |

## Integration work still required

The six app-backed files import `src/index.ts` / `src/node.ts` and fail while evaluating their application dependency graph. The observed missing modules are `opencode/agent/agent` from `packages/opencode-adapter/src/agent.ts`, `opencode/session/schema` from `packages/opencode-adapter/src/id.ts`, and `opencode/session/session` from `packages/opencode-adapter/src/session.ts`; which one appears first varies with current shared-worktree module evaluation order.

Concrete retained forwarding importers:

- `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts` and `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts` still import `resolveSubagentToolForwarding` from the old `transforms/subagent-tool-forwarding.ts`.
- That old transform imports adapter `agent`, `id`, `instance`, `registry` and `session`.
- `packages/buddy/src/opencode-runtime/subagent-forwarding.ts` imports adapter `instance` and `registry` and dynamically imports `subagent-tool-forwarding-runtime.ts`.
- `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts` imports adapter `id`, `instance` and `session`, the old transform, and refers to the old registry types.
- Unowned `test/learning/subagent-tool-forwarding.test.ts` still imports `id`, `instance` and `registry`; `test/opencode-runtime/session-live.test.ts` still imports `id`.
- Adapter `registry.ts` imports `agent.ts` and `instance.ts`; `agent.ts` and `effect-runtime.ts` also import `instance.ts`. Adapter `index.ts` still re-exports the old `id.ts`, `message.ts` and `session.ts`, and `session-prompt.ts` still refers to the old MessageV2 type.

W-E1 / the orchestrator must remove or replace these active v1 consumers before deleting the corresponding adapter files. No adapter module was deleted by W-T. Re-run the six blocked rows after that integration; do not replace the real Buddy app with mocked routes to hide the failure.

## Traps and limits

- Standalone feature/persona imports currently have an initialization cycle. The direct-tool loader imports the runtime client before loading the feature catalog. Bench tools and the ingestion tool are loaded after the test's other static dependencies, retaining their real implementations. This follows the production runtime-first entry order; it is not a source fix for the existing cycle reported by W-F1.
- The generated public permission method uses `decision`, not `reply`, and `permission.list` returns an array directly. `message.list` and `model.list` return objects with `data`.
- The ingestion turn currently logs upstream snapshot warnings (`Location is outside the project`) for the temporary notebook. The asserted tool result is complete and the test passes; snapshot capture itself was not validated.
- Actual Windows execution, browser/computer verification and deployed desktop migration were not performed. Existing path fixtures remain; no platform-specific production behaviour was introduced.

## Decisions for the user

None. No product defaults changed and no new dependencies are required.

## Verification

From `packages/buddy`, one file per invocation:

```sh
bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts <file>
```

Results: the table above; 110 tests pass in 15 files, 6 files blocked by unowned v1 imports. Complete ingestion and permission turn results were checked after the final functional changes.

From the root:

```sh
xargs bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json < /tmp/buddy-wt-inventory.txt
bun ./script/check-import-contract.ts
bun run --cwd packages/buddy typecheck
```

Changed-file oxlint: PASS. Import-contract check: PASS repository-wide. Package typecheck: exits 2 on remaining migration errors, with no diagnostics in the inventory above. Typechecks were serial and run through the package script. Scoped `git diff --check`: PASS.

The exact source/test lint inventory is reproduced in this report, so it can be rebuilt if `/tmp` is cleared. Detailed focused output is in `/tmp/buddy-wt-*.txt`, the last package check in `/tmp/buddy-wt-typecheck.txt`, and the per-file result cache in `/tmp/buddy-wt-results.json`.

No root lint/typecheck, full suite, vendor tests, install, `bun fmt`, browser verification, git-worktree mutation or real Buddy state access was performed.
