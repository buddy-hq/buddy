# OpenCore Pairity Sync Log

Append-only log for parity runs and parity contract changes.

## Entry Template

```md
## YYYY-MM-DD - <short title>

- Type: parity-sync | contract-change
- Buddy refs: <branch/commit/pr>
- OpenCode refs: <commit sha list or range>
- Pairs touched:
  - packages/buddy/src/... -> packages/opencode/src/...
- Summary:
  - <what changed and why>
- Validation:
  - diff-pairs: <command + result>
  - upstream-history: <command + result>
  - backend checks: <commands + result>
- Decision:
  - synced | partial-sync | deferred
- Next step:
  - <follow-up action>
```

## 2026-02-22 - Bootstrap sync kit

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - new mapping created in `pairs.tsv` (13 files)
- Summary:
  - Initialized parity kit with file mappings, drift/history scripts, checklist, and governance contract.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=13 missing=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 3` -> success
  - backend checks: not run in this task
- Decision:
  - synced
- Next step:
  - use this log for every parity task and include upstream SHAs for actual code syncs.

## 2026-02-22 - Add intent and risk context for future agents

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - none (documentation-only parity governance update)
- Summary:
  - Added explicit bidirectional maintenance contract language for future parity-core additions.
  - Added `CONTEXT.md` documenting original intent, product boundary, and known risks.
  - Updated checklist to classify new OpenCode features as parity-core vs buddy-product.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=13 missing=0` (exit 1 by design)
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks: not run in this docs-only task
- Decision:
  - synced
- Next step:
  - for the next parity-core feature port, add/adjust `pairs.tsv` first, then log upstream SHAs in a parity-sync entry.

## 2026-02-22 - Methodical final screening and mapping expansion

- Type: contract-change
- Buddy refs: working tree
- OpenCode refs: local `/Users/prashantbhudwal/code/opencode` HEAD at run time
- Pairs touched:
  - expanded `pairs.tsv` from 13 to 40 mappings
  - added route rename mappings (`routes/*` -> `server/routes/*`)
  - added list/system/global/message-v2 rename mappings
  - added exact-path coverage rows for remaining core-compatible files
- Summary:
  - Performed full Buddy/OpenCode backend file screening.
  - Found unmapped parity-relevant files in tools, bus, config, routes, schema, and bootstrap layers.
  - Added `screen-coverage.sh` to automate exact-path and known-rename coverage checks.
  - Updated README/checklist contract to require coverage screening alongside drift/history checks.
- Validation:
  - coverage (before expansion): `./opencore-pairity/scripts/screen-coverage.sh` -> `unmapped_exact=5`
  - coverage (after expansion): `./opencore-pairity/scripts/screen-coverage.sh` -> `unmapped_exact=0, unmapped_rename=0`
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=40 match=1 diff=39 missing=0` (exit 1 by design)
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 2` -> success
  - backend checks: not run in this parity-governance task
- Decision:
  - synced
- Next step:
  - keep new parity-core files blocked on adding a `pairs.tsv` row and green `screen-coverage.sh`.

## 2026-02-22 - Add glob/grep/bash parity tools and close prompt mismatch

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/src/tool/glob.ts`
  - `packages/opencode/src/tool/grep.ts`
  - `packages/opencode/src/tool/bash.ts`
  - latest history sampled via `./opencore-pairity/scripts/upstream-history.sh --max-count 5`
- Pairs touched:
  - `packages/buddy/src/tool/glob.ts` -> `packages/opencode/src/tool/glob.ts`
  - `packages/buddy/src/tool/grep.ts` -> `packages/opencode/src/tool/grep.ts`
  - `packages/buddy/src/tool/bash.ts` -> `packages/opencode/src/tool/bash.ts`
  - `packages/buddy/src/tool/registry.ts` -> `packages/opencode/src/tool/registry.ts`
  - `packages/buddy/src/session/prompts/learning-companion.txt` (Buddy-side prompt/tool contract alignment)
- Summary:
  - Added missing parity-core tools (`glob`, `grep`, `bash`) to close runtime/prompt mismatch.
  - Wired tools into `ToolRegistry` and added tool descriptions under `packages/buddy/src/tool/*.txt`.
  - Updated prompt policy to prefer new specialized search tools before bash.
  - Added backend tests for registry presence and execution behavior (`packages/buddy/test/tooling-parity.test.ts`).
  - Expanded `pairs.tsv` with new parity mappings for `glob`, `grep`, and `bash`.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=43 match=1 diff=42 missing=0` (exit 1 by design)
  - coverage: `./opencore-pairity/scripts/screen-coverage.sh` -> `Exact summary total=35 mapped=35 unmapped=0`, `Rename summary total=8 unmapped=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks:
    - `bun run --cwd packages/buddy typecheck` -> pass
    - `bun run --cwd packages/buddy test` -> pass
    - `bun run typecheck` -> pass
    - `bun test` -> pass
- Decision:
  - synced
- Next step:
  - evaluate next parity-core additions (`edit`/`apply_patch`) or keep prompt/tool contract scoped to currently shipped tools.

## 2026-02-22 - Add edit/apply_patch core tooling parity

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/src/tool/edit.ts` (recent upstream: `02a949506`, `270b807cd`, `624dd94b5`)
  - `packages/opencode/src/tool/apply_patch.ts` (recent upstream: `021d9d105`, `f4cf3f497`, `74bd52e8a`)
  - `packages/opencode/src/patch/index.ts` (recent upstream: `2dcca4755`, `b7ad6bd83`, `41ce56494`)
- Pairs touched:
  - `packages/buddy/src/tool/edit.ts` -> `packages/opencode/src/tool/edit.ts`
  - `packages/buddy/src/tool/apply_patch.ts` -> `packages/opencode/src/tool/apply_patch.ts`
  - `packages/buddy/src/patch/index.ts` -> `packages/opencode/src/patch/index.ts`
  - `packages/buddy/src/tool/registry.ts` -> `packages/opencode/src/tool/registry.ts`
  - `packages/buddy/src/session/prompts/learning-companion.txt` (Buddy prompt/tool contract alignment)
- Summary:
  - Added Buddy-native parity ports for `edit` and `apply_patch` with OpenCode-compatible input contracts.
  - Ported a minimal patch parser/chunk applier in `src/patch/index.ts` to support patch envelope operations.
  - Registered tools in `ToolRegistry`, added tool docs, and extended backend parity tests.
  - Updated parity mappings so coverage scripts track the newly ported core files.
- Validation:
  - diff-pairs: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=46 match=1 diff=45 missing=0` (exit 1 by design)
  - coverage: `./opencore-pairity/scripts/screen-coverage.sh` -> `Exact summary total=38 mapped=38 unmapped=0`, `Rename summary total=8 unmapped=0`
  - upstream-history: `./opencore-pairity/scripts/upstream-history.sh --max-count 5` -> success
  - backend checks:
    - `bun run --cwd packages/buddy typecheck` -> pass
    - `bun run --cwd packages/buddy test` -> pass
  - workspace checks:
    - `bun run typecheck` -> pass
    - `bun test` -> pass
    - `bun run build` -> pass
- Decision:
  - synced
- Next step:
  - evaluate parity gaps for `multiedit`/`todo`/`question` once Buddy product scope requires them.

## 2026-02-23 - Add backend+web testing parity harness and blocking gates

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/test/**` parity targets listed in `opencore-pairity/test-pairs.tsv`
  - `packages/app/src/**/*.test.ts` parity targets listed in `opencore-pairity/test-pairs.tsv`
- Pairs touched:
  - backend parity suite: `packages/buddy/test/parity/**` -> `packages/opencode/test/**`
  - web parity suite: `packages/web/test/parity/**` -> `packages/app/src/**/*.test.ts`
  - parity contract: `opencore-pairity/test-pairs.tsv`
  - parity validation script: `opencore-pairity/scripts/test-coverage.sh`
- Summary:
  - Fixed curriculum default-read baseline regression so backend test baseline is green.
  - Added backend test preload isolation (`bunfig.toml`, `test/preload.ts`) and reusable tmp fixture.
  - Added web Happy DOM preload and parity test files for layout/prompt/store/runtime/persistence helpers.
  - Added parity mapping contract `test-pairs.tsv` and strict coverage checker `test-coverage.sh`.
  - Added blocking parity scripts (`test:parity`, `check:parity`) at root and package level.
- Validation:
  - backend tests: `bun run --cwd packages/buddy test` -> pass (67/67)
  - web tests: `bun run --cwd packages/web test` -> pass (51/51)
  - parity tests: `bun run test:parity` -> pass (backend 42/42, web 42/42)
  - test coverage: `./opencore-pairity/scripts/test-coverage.sh` -> pass (`rows=77 ported=41 na=36 deferred=0`)
  - coverage screen: `./opencore-pairity/scripts/screen-coverage.sh` -> pass (`unmapped_exact=0`, `unmapped_rename=0`)
  - drift report: `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `diff=45 missing=0` (expected non-zero until further core syncs)
  - full gate: `bun run check:parity` -> fail by design on current pair drift (diff stage)
- Decision:
  - synced
- Next step:
  - continue parity-core file syncing to reduce `diff-pairs` drift and move `check:parity` toward green.

## 2026-02-23 - Reset + message/provider parity foundation for token context

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - baseline HEAD: `206d81e02c5953f6652fdadfc69f5826943da08c`
  - referenced counterparts:
    - `packages/opencode/src/session/message-v2.ts`
    - `packages/opencode/src/provider/models.ts`
    - `packages/opencode/src/provider/provider.ts`
    - `packages/opencode/src/server/routes/config.ts`
- Pairs touched:
  - `packages/buddy/src/index.ts` -> `packages/opencode/src/index.ts`
  - `packages/buddy/src/session/message-v2/index.ts` -> `packages/opencode/src/session/message-v2.ts`
  - `packages/buddy/src/routes/config.ts` -> `packages/opencode/src/server/routes/config.ts`
  - `packages/buddy/src/session/prompt.ts` -> `packages/opencode/src/session/prompt.ts`
  - `packages/buddy/src/session/processor.ts` -> `packages/opencode/src/session/processor.ts`
  - `packages/buddy/src/session/llm.ts` -> `packages/opencode/src/session/llm.ts`
  - `packages/buddy/src/provider/models.ts` -> `packages/opencode/src/provider/models.ts` (new mapping)
  - `packages/buddy/src/provider/provider.ts` -> `packages/opencode/src/provider/provider.ts` (new mapping)
- Summary:
  - Added one-time destructive parity reset on backend boot with marker + `BUDDY_SKIP_PARITY_RESET=1`.
  - Tightened Buddy `message-v2` schema to OpenCode-style assistant envelope/tool-state strictness and structured error objects.
  - Added models.dev-backed provider metadata layer and switched config providers endpoint to metadata-rich payload with `limit.context`.
  - Replaced hardcoded overflow-context usage in runtime with model-resolved limits and threaded token context data into web transcript meta (`used` + `remaining` fallback).
  - Expanded parity mapping to include provider model registry + provider lookup files.
- Validation:
  - baseline reports:
    - `./opencore-pairity/scripts/diff-pairs.sh --changed-only` -> `total=48 match=1 diff=47 missing=0` (exit 1 by design)
    - `./opencore-pairity/scripts/screen-coverage.sh` -> `Exact summary total=40 mapped=40 unmapped=0`, `Rename summary total=8 unmapped=0`
    - `./opencore-pairity/scripts/upstream-history.sh --max-count 8` -> success
  - checks after implementation:
    - `bun run typecheck -- --filter=@buddy/backend` -> pass
    - `bun run typecheck -- --filter=@buddy/web` -> pass
    - `bun run test:parity` -> pass
    - `./opencore-pairity/scripts/test-coverage.sh` -> pass (`rows=77 ported=41 na=36 deferred=0`)
- Decision:
  - partial-sync
- Next step:
  - complete the remaining mapped P0/P1 runtime/tool/bus parity ports to reduce `diff-pairs` drift while keeping new message/provider contracts stable.

## 2026-02-24 - Port OpenCode interleaved reasoning replay handling for Kimi tool loops

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `packages/opencode/src/provider/provider.ts`
  - `packages/opencode/src/provider/transform.ts`
  - `packages/opencode/src/session/llm.ts`
  - `packages/opencode/src/session/processor.ts`
- Pairs touched:
  - `packages/buddy/src/session/processor.ts` -> `packages/opencode/src/session/processor.ts`
  - `packages/buddy/src/session/llm.ts` -> `packages/opencode/src/session/llm.ts`
  - `packages/buddy/src/provider/provider.ts` -> `packages/opencode/src/provider/provider.ts`
- Summary:
  - Ported OpenCode parity behavior to preserve text/reasoning provider metadata during stream deltas and avoid end-event metadata clobbering.
  - Ported OpenCode-style message normalization/rewrite path for interleaved models: Anthropic empty-content cleanup, Claude toolCallId sanitization, and assistant reasoning->`providerOptions.openaiCompatible.{reasoning_content|reasoning_details}` conversion based on model `interleaved.field`.
  - Updated Buddy provider model mapping to carry `interleaved` capability through from models.dev so the same OpenCode transform gating can be used.
  - Wired LLM message transform to use resolved provider model metadata (OpenCode style) instead of Buddy-only model ID heuristic.
  - Added parity tests for interleaved rewrite behavior and Anthropic empty-content normalization.
- Validation:
  - `bun run typecheck -- --filter=@buddy/backend` -> pass
  - `bun test packages/buddy/test/parity/session/provider-transform.test.ts` -> pass
  - `bun test packages/buddy/test/parity/session/message-v2.test.ts packages/buddy/test/parity/session/processor-loop.test.ts packages/buddy/test/parity/session/provider-transform.test.ts` -> pass
- Decision:
  - synced
- Next step:
  - reproduce against the reported `/Users/prashantbhudwal/Code/buddybooks/typescript` session after backend restart and confirm no further `reasoning_content is missing` failures.

## 2026-02-24 - Vendor OpenCode core via subtree split/squash workflow

- Type: contract-change
- Buddy refs:
  - `8ecce357` (subtree add commit for `vendor/opencode-core`)
  - working tree docs update (`opencore-pairity/README.md`, `opencore-pairity/sync-checklist.md`)
- OpenCode refs:
  - source repo: `/Users/prashantbhudwal/code/opencode`
  - split source clone: `/tmp/opencode-core-split-1771962514`
  - split SHA: `1c52b9e792c31d7e050e249524a53ad0f68e83cc` (`packages/opencode` subtree)
- Pairs touched:
  - vendored snapshot added: `vendor/opencode-core/**` (squashed import of `packages/opencode`)
  - parity runbook docs:
    - `opencore-pairity/README.md`
    - `opencore-pairity/sync-checklist.md`
- Summary:
  - Imported OpenCode core package into Buddy using `git subtree add --squash` so future updates can use `subtree pull` instead of manual file-by-file copy.
  - Kept Buddy's existing dirty worktree intact by stashing around subtree import and restoring it after import.
  - Documented exact split/pull commands and clean-worktree requirement for repeatable future syncs.
- Validation:
  - subtree import:
    - `git subtree add --prefix=vendor/opencode-core /tmp/opencode-core-split-1771962514 1c52b9e792c31d7e050e249524a53ad0f68e83cc --squash` -> success
  - worktree safety:
    - pre-existing local modifications restored after subtree import
  - parity scripts:
    - pending in this task (run in next parity sync step due current local WIP state)
- Decision:
  - synced
- Next step:
  - run parity scripts (`diff-pairs`, `screen-coverage`, `test-coverage`, `upstream-history`) in a clean parity branch and start migrating Buddy runtime hooks to consume vendored core surfaces incrementally.

## 2026-02-24 - Introduce adapter package and route ProviderTransform through it

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - vendored snapshot: `vendor/opencode-core` (from split SHA `1c52b9e792c31d7e050e249524a53ad0f68e83cc`)
  - parity source logic: `packages/opencode/src/provider/transform.ts`
- Pairs touched:
  - `packages/buddy/src/session/provider-transform.ts` -> `packages/opencode/src/provider/transform.ts`
  - new workspace adapter package:
    - `packages/opencode-adapter/src/provider-transform.ts`
    - `packages/opencode-adapter/src/index.ts`
    - `packages/opencode-adapter/package.json`
    - `packages/opencode-adapter/tsconfig.json`
- Summary:
  - Added a real workspace adapter package (`@buddy/opencode-adapter`) to host OpenCode-derived core logic behind a stable Buddy-owned seam.
  - Routed Buddy runtime `ProviderTransform` to call adapter functions for:
    - `maxOutputTokens`
    - anthropic Kimi `providerOptions`
    - message normalization/reasoning rewrites
  - Kept Buddy API/runtime contracts intact while shifting internals to adapter-based upstream porting flow.
  - Fixed a strict message schema fixture in `session-store` test to include required `agent` and `model` fields.
- Validation:
  - `bun run typecheck` -> pass
  - `bun run test` -> pass
- Decision:
  - synced
- Next step:
  - continue moving additional parity-core modules (e.g. `session/llm`, `session/processor`, `tool/registry`) behind `@buddy/opencode-adapter` in incremental slices with full test gates after each slice.

## 2026-02-24 - Execute vendored OpenCode runtime path and install upstream workspace deps

- Type: parity-sync
- Buddy refs: working tree
- OpenCode refs:
  - `vendor/opencode-core/src/provider/transform.ts` (runtime import target)
  - `/Users/prashantbhudwal/code/opencode/packages/{util,plugin,sdk/js,script}` (vendored workspace deps)
- Pairs touched:
  - `packages/buddy/src/session/provider-transform.ts` -> `packages/opencode/src/provider/transform.ts`
  - `packages/buddy/src/session/llm.ts` -> `packages/opencode/src/session/llm.ts`
  - `packages/buddy/src/provider/provider.ts` -> `packages/opencode/src/provider/provider.ts`
- Summary:
  - Added vendored OpenCode workspace dependencies required by core runtime resolution:
    - `vendor/opencode-util`
    - `vendor/opencode-plugin`
    - `vendor/opencode-sdk`
    - `vendor/opencode-script`
  - Updated Buddy root workspace + catalog config so vendored OpenCode packages resolve `workspace:*` and `catalog:` dependencies.
  - Switched adapter message normalization path to execute vendored OpenCode `ProviderTransform.message` at runtime.
  - Kept Buddy-facing API surface stable while replacing local message-normalization core logic with upstream runtime behavior.
  - Updated project root detection to support object-form `workspaces` in `package.json` (required by catalog-based setup).
- Validation:
  - vendored runtime import check:
    - `cd vendor/opencode-core && bun -e "import { ProviderTransform } from './src/provider/transform.ts'; console.log('vendor-ok', typeof ProviderTransform.message)"` -> `vendor-ok function`
  - `bun run typecheck` -> pass
  - `bun run test` -> pass
- Decision:
  - synced
- Next step:
  - continue migrating additional mapped parity-core files so Buddy source becomes wrapper-only for core infra and executes vendored OpenCode implementations through `@buddy/opencode-adapter`.
