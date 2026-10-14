# Headless Node-bundle smoke (2026-10-08 ~12:10 IST)

## What ran

The desktop artifact backend (`packages/buddy/dist/node/node.js`, rebuilt from current source) ran under Node 26.7 (the desktop app runs it under Electron 41's Node 24). It was driven over HTTP with a real free OpenCode model (`opencode/fledge-alpha-free`) and no credentials.

Isolation:
- `HOME`, `USERPROFILE`, `OPENCODE_TEST_HOME`, `TMPDIR` and the four `XDG_*` roots all pointed into `/private/tmp/buddy-v2-headless/`.
- Allowed roots were limited to `/private/tmp/buddy-v2-headless/notebooks`.
- The desktop's dev resource variables were mirrored from `desktop-electron/src/main/cli.ts`: `BUDDY_BACKEND_RESOURCES_DIR=packages/buddy/src`, tessdata, migration directory, `OPENCODE_DB`, `OPENCODE_CLIENT=desktop`, and the file watcher.
- No keychain use exists in the backend.

The driver is `scratchpad/headless/smoke.ts` in the orchestrator session. It is not in the repo.

## Results: 12/12 valid cases pass

| Case | Result | Notes |
|---|---|---|
| boot | PASS | health 200 |
| open notebook | PASS | |
| free models | PASS | `opencode` connected with only `*-free` models plus `big-pickle`. The onboarding default `deepseek-v4-flash-free` is no longer in the upstream free list; onboarding falls back through `resolveCatalogProviderModelSelection` (catalog drift, not a migration issue) |
| commands immediately after open | PASS | 3 commands and 14 skills on the first call (the "empty until plugins load" note did not reproduce) |
| session create | PASS | |
| basic chat | PASS | Streams a reply. The learner-context reminder is a separate user text part with `synthetic: true`, so it is hidden by `message-visibility` |
| shell in notebook | PASS | `ls -la` ran (shell parser wasm loaded under Node); no ask, matching v1 (`"*": "allow"`) |
| edit in notebook | PASS | Applied without an ask, matching the v1 default |
| edit "deny" | invalid case | There is no ask for in-notebook edits by design, so the driver had nothing to deny. Spec D2–D4 corrected |
| external directory | PASS | Reading `/etc/hosts` raised `external_directory` `["/etc/*"]`; reject was honoured |
| abort | PASS | 200 `true`; status idle afterwards |
| prompt after abort | PASS | |
| blocking subagent (flashcards) | PASS | Native `subagent` tool; `ToolPart.subagent` = `{agentID: "flashcard-author", background: false, workerStatus: "complete", childSessionID…}`; one child session; deck created |

Backend log for the full run: no 4xx/5xx and no errors. The only noise is the skill artifact refresh, which needs `catalog.json` and is disabled in this harness.

## Harness lesson

Without `BUDDY_BACKEND_RESOURCES_DIR`, every provider route returns 500 ("Skill catalog not found at dist/node/catalog.json"). The desktop always sets it, so this is not a product bug, but any headless or CLI use of the Node artifact must set it.

## Not covered here

The UI, forms/questions, background subagents and their completion row, settings/MCP, compaction and Bench are left to `e2e-computer-use-spec.md`.
