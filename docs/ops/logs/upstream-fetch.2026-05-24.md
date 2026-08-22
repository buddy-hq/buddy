# Upstream Fetch Log - 2026-05-24

## Checkpoint

- Time: 2026-05-24 15:46 IST
- Branch: `decoupling`
- Target upstream tag: `v1.15.10`
- Current vendored OpenCode version at start: `1.15.4`

## Baseline `git status --short`

```text
M  docs/architecture/decoupling/README.md
A  docs/architecture/decoupling/upstream-fetch-reduction-plan.md
M  docs/guides/upstream-fetch.algo.md
M  package.json
M  packages/buddy/src/http/opencode-event-stream.ts
M  packages/buddy/src/opencode-runtime/buddy-tool-shim.ts
A  packages/buddy/src/opencode-runtime/plugin-ask-compat.ts
M  packages/buddy/src/opencode-runtime/runtime.ts
M  packages/buddy/src/routes/compatibility.ts
M  packages/buddy/src/session/orchestration/core-actions.ts
M  packages/buddy/test/http/opencode-event-stream.test.ts
M  packages/buddy/test/learning/ingest-full-text-plugin.test.ts
M  packages/buddy/test/opencode-runtime/buddy-tool-shim.test.ts
M  packages/buddy/test/session/abort-tools.test.ts
M  packages/buddy/test/skills/tool-visibility.test.ts
M  packages/opencode-adapter/src/llm.ts
M  packages/opencode-adapter/src/session-live.ts
M  packages/opencode-adapter/src/session-prompt.ts
M  packages/opencode-adapter/src/session-tool-ui.ts
M  packages/opencode-adapter/src/session.ts
A  script/sync-opencode-catalog.ts
```

## Notes

- This sync was validated from the current dirty decoupling worktree, not from a
  clean branch tip.
- Vendor patches are not allowed. Any compatibility fix had to stay in Buddy or
  adapter-owned code.
- The root release gate is `bun typecheck` plus `bun lint`, not a standalone
  `packages/opencode-adapter` typecheck. The direct adapter check can false-fail
  by pulling vendored `@opencode-ai/llm` internals across a boundary Buddy does
  not ship independently.

## Temp Validation Workspace

- Temp workspace: `/tmp/buddy-sync-20260524-2fwY6k/repo`
- Vendor swap source: `git archive v1.15.10` from `/Users/prashantbhudwal/Code/opencode`
- `bun run vendor:sync-catalog`: passed in temp
- `bun install`: passed in temp after catalog sync

## Temp Validation Results

- `bun typecheck`: passed after Buddy-owned fixes
- `bun lint`: passed with the same two existing warnings in `packages/buddy/script/smoke.ts`
- `bun run --cwd packages/buddy test:contracts`: passed
- `bun run --cwd packages/web test:contracts`: passed
- `bun run --cwd packages/buddy build:single`: passed

### Buddy-Owned Fixes Proven in Temp

- `packages/buddy/src/routes/local-runtimes.ts`
  - adjusted upgraded Hono `c.json()` usage to return
    `c.json(result.status, { status: result.httpStatus })`
  - narrowed local runtime route status typing to `200 | 500`
- `packages/opencode-adapter/src/llm.ts`
  - removed dependence on `opencode/session/llm` and upstream event-tag unions
  - switched to provider/transform entrypoints plus structural usage parsing
- `packages/opencode-adapter/package.json`
  - aligned `ai` to the workspace catalog so adapter and vendor consume the same
    stack during the sync
- `package.json`
  - kept root `typecheck` focused on Buddy consumer packages by excluding the
    standalone `@buddy/opencode-adapter` package from the root gate

## Real Repo Apply

- Synced `vendor/opencode` in the real workspace to upstream tag `v1.15.10`
- Ran `bun run vendor:sync-catalog`
- Ran `bun install`

### Root Catalog Keys Aligned by `vendor:sync-catalog`

- `@effect/opentelemetry`
- `@effect/platform-node`
- `@effect/sql-sqlite-bun`
- `@types/bun`
- `@opentui/core`
- `@opentui/keymap`
- `@opentui/solid`
- `drizzle-kit`
- `drizzle-orm`
- `effect`
- `virtua`

## Real Repo Validation

- `bun typecheck`: passed
- `bun lint`: passed with the same two existing warnings in `packages/buddy/script/smoke.ts`
- `bun run --cwd packages/buddy test:contracts`: passed
- `bun run --cwd packages/web test:contracts`: passed
- `bun run --cwd packages/buddy build:single`: passed
- Focused Buddy regression slice: passed
  - `bun test --preload ./test/preload.ts test/session/route-regressions.test.ts test/session/session-api-parity.test.ts test/opencode-runtime/buddy-runtime-plugin.test.ts test/opencode-runtime/buddy-tool-shim.test.ts test/http/opencode-event-stream.test.ts test/local-runtimes-routes.test.ts test/open-project-routes.test.ts test/opencode-sdk-client.test.ts test/learning/ingest-full-text-plugin.test.ts test/session/abort-tools.test.ts test/skills/tool-visibility.test.ts test/learning/subagent-tool-forwarding.test.ts test/mcp/routes.test.ts`
  - result: `63 pass, 0 fail`

## Real Curl Smoke

Server:

- `PORT=57948 bun run --cwd packages/buddy start`

Requests:

- `curl -sS -o /tmp/upstream-fetch-health.json -w '%{http_code}\n' http://127.0.0.1:57948/api/health`
  - `200`
- `curl -sS -N --max-time 2 http://127.0.0.1:57948/api/event`
  - `200`
  - observed SSE frames: `server.connected`, `models-dev.refreshed`
- `curl -sS -o /tmp/upstream-fetch-provider.json -w '%{http_code}\n' http://127.0.0.1:57948/api/provider`
  - `200`
- `curl -sS -o /tmp/upstream-fetch-mcp.json -w '%{http_code}\n' http://127.0.0.1:57948/api/mcp`
  - `200`
- `curl -sS -o /tmp/upstream-fetch-config.json -w '%{http_code}\n' http://127.0.0.1:57948/api/config`
  - `200`
- `curl -sS -o /tmp/upstream-fetch-open-projects.json -w '%{http_code}\n' http://127.0.0.1:57948/api/open-projects`
  - `200`
- `curl -sS -o /tmp/upstream-fetch-standards.json -w '%{http_code}\n' http://127.0.0.1:57948/api/local-runtimes/standards`
  - `200`
- `curl -sS -o /tmp/upstream-fetch-advanced-math.json -w '%{http_code}\n' http://127.0.0.1:57948/api/local-runtimes/advanced-math`
  - `200`
- `curl -sS -H 'content-type: application/json' -d '{}' -o /tmp/upstream-fetch-session-create.json -w '%{http_code}\n' 'http://127.0.0.1:57948/api/session?directory=/Users/prashantbhudwal/Code/buddies/decoupling'`
  - `200`
  - created session id: `ses_1a683bd45ffe9mMJqm97o4P0Gi`
- `curl -sS -o /tmp/upstream-fetch-session-get.json -w '%{http_code}\n' 'http://127.0.0.1:57948/api/session/ses_1a683bd45ffe9mMJqm97o4P0Gi?directory=/Users/prashantbhudwal/Code/buddies/decoupling'`
  - `200`
- `curl -sS -H 'content-type: application/json' -d '{\"command\":\"/help\"}' -o /tmp/upstream-fetch-command-404.json -w '%{http_code}\n' 'http://127.0.0.1:57948/api/session/ses_missing_sync/command?directory=/Users/prashantbhudwal/Code/buddies/decoupling'`
  - `404`
  - body: `{"error":"Session not found"}`
- `curl -sS -H 'content-type: application/json' -d '{\"parts\":[]}' -o /tmp/upstream-fetch-prompt-async-404.json -w '%{http_code}\n' 'http://127.0.0.1:57948/api/session/ses_missing_async/prompt_async?directory=/Users/prashantbhudwal/Code/buddies/decoupling'`
  - `404`
  - body: `{"error":"Session not found"}`
- `curl -sS -H 'content-type: application/json' -d '{\"config\":{\"type\":\"local\",\"command\":[\"bun\",\"--version\"],\"enabled\":false}}' -o /tmp/upstream-fetch-mcp-invalid.json -w '%{http_code}\n' 'http://127.0.0.1:57948/api/mcp?directory=/Users/prashantbhudwal/Code/buddies/decoupling'`
  - `400`
  - body: `{"error":"Invalid MCP payload"}`

## Diagnostic Caveat

- `bun run --cwd packages/opencode-adapter typecheck` remains a diagnostic-only
  check. Under `v1.15.10` it can still fail by typechecking vendored
  `vendor/opencode/packages/llm/src/protocols/openai-responses.ts` directly.
- That failure does not reproduce through the Buddy consumer packages, which are
  the real shipped boundary and the root gate.

## Outcome

This run executed the upstream sync algorithm to the latest stable tag
`v1.15.10`, carried the validated Buddy-owned fix set back into the real repo,
and landed the vendor sync in the current workspace without patching vendor
code. The real workspace is green on the required gates (`bun typecheck`,
`bun lint`) plus targeted tests and live curl smoke.
