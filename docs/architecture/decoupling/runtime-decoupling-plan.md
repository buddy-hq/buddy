# Buddy runtime decoupling plan

Written 2026-10-21; code citations refer to the v2 branch as of that date. Evidence came from a code, data and Pi survey, with key claims spot-checked against the code.

## Goal

Decouple Buddy from OpenCode as far as possible today, without changing any behaviour:

1. **One boundary.** All Buddy code talks to Buddy-owned interfaces (ports), and OpenCode lives entirely behind the adapter that implements them.
2. **A runtime switch sheet.** A written list of what any replacement runtime must provide, and what Buddy would have to add by hand if it doesn't. If Pi or anything else comes tomorrow, the work is already known.

## Non-goals

- Making Pi, or any other runtime, work.
- Buddy taking over jobs OpenCode does today. No Buddy permission engine, no Buddy subagent system, no Buddy credential store, no Buddy chat archive.
- Moving user data out of OpenCode's storage. Data stays where it is; the switch sheet records what would need moving.
- Patching `vendor/opencode`.

## Rules

1. **Baseline first.** Phase 0 records a passing baseline, and every change keeps it passing.
2. **No behaviour change.** Moving code behind a port must change nothing users see. Ports copy OpenCode's current behaviour exactly.
3. **Every platform we ship:** macOS and Windows, on the Node runtime the desktop app uses as well as Bun in dev.
4. **Split the work for speed.** Run as much in parallel as limits allow. The only limit is that agents running at the same time don't edit the same files.

## Phase 0: Safety net

| ID | Work | Done when |
|---|---|---|
| 0.1 | **Port conformance suite.** Black-box tests through Buddy's HTTP API against a real v2 host in temporary roots, one file per port, covering the behaviour in the port table below. It doubles as the spec any future runtime must pass. | Passes on the current snapshot. |
| 0.2 | **E2E baseline.** Run the 37-case computer-use spec and record the results. Re-run it at the end of each phase. | Baseline recorded. |
| 0.3 | **Both runtimes in CI.** Run the headless Node backend smoke (`script/node-backend-smoke.ts`) on macOS and Windows, alongside the Bun runs. | Runs on every push. |

## Phase 1: Ports

### The ports (`@buddy/agent-runtime`, new package)

The package holds types and contracts only, in Buddy's own terms, depending on Effect/Zod and `@buddy/transcript-contract`.

| Port | Covers | Today's code |
|---|---|---|
| Conversations | create, get, list, tree, fork, revert, remove, history order, session metadata | `opencode-adapter/src/gateway/session.ts`, `message.ts` |
| Execution | admit/queue/steer/cancel prompts, commands, no-reply, completion | `gateway/write.ts`, `execution.ts`, `command.ts`; `buddy/src/session/orchestration/*` |
| Events | ordered stream, deltas plus snapshots, resync, hydration, terminal sealing; the events Buddy features react to (turn finished, title changed) | `gateway/event.ts`, `stream.ts`; web `use-chat-sync.ts`; `buddy-runtime-plugin.ts:95`, `notes/session-title-sync.ts` |
| Approvals | hiding and denying tools, approval requests, batched replies with feedback, saved grants | `gateway/permission.ts`, `opencode-runtime/tool-permission.ts` |
| Subagents | child chat set up before its first step, foreground/background, stop, parent told when a child finishes | `gateway/subagent.ts`, `opencode-runtime/plugins/buddy-subagents.ts` |
| Catalog | agents/personas, skills, commands, Buddy tools, per-notebook policy, reload barriers | `learning/runtime/create-buddy-tool.ts`, `feature-registry.ts`, `config/runtime/notebook-config-plugin.ts` |
| Context | per-prompt system context, teaching-state injection, compaction settings | `learning/agent-execution/transforms/prompt-context.ts`, plugin context hooks |
| Providers & auth | model catalog (capabilities, variants, limits), connect/OAuth/refresh, ChatGPT accounts, credential reuse for images | `gateway/provider.ts`, `integration.ts`, `plugins/openai-codex-auth.ts`, `image-generation/service/codex-images.ts` |
| MCP | server definitions, status, connect/auth | `buddy/src/routes/mcp.ts` |
| Forms | questions that can be listed, answered or cancelled after reconnect | `gateway/form.ts`, `buddy/src/routes/question.ts` |
| References | reference catalog and composer reference parts | `buddy/src/routes/reference.ts` |

### Work

| ID | Work | Done when |
|---|---|---|
| 1.1 | **Design the ports** above. | Package with reviewed types. |
| 1.2 | **Implement every port for OpenCode** inside `@buddy/opencode-adapter`, by wrapping the existing `gateway/*` functions. | Conformance suite passes through the ports. |
| 1.3 | **Move all backend callers onto the ports:** sessions and routes, agent execution, notes and memory, config, MCP, image generation. | No backend code uses `OpenCodeTypes` or the plugin API. |
| 1.4 | **Split the Buddy plugin** (`opencode-runtime/plugins/*`). Buddy's hooks (on prompt, on context, on tool call, on child setup, on turn finished) become Buddy-typed functions, and only their wiring to OpenCode stays in the adapter. | Plugin logic is testable without an OpenCode host. |
| 1.5 | **Close the doors.** The adapter stops re-exporting `@opencode/client` types (`host.ts:9`) and drops its `plugin.ts`/`config.ts` barrels. One composition-root file in `packages/buddy` is the only importer of the adapter, and `script/check-import-contract.ts` enforces it. | The import check fails on any new leak. |

## Phase 2: Remove the remaining leaks

Each item stops Buddy code from depending on OpenCode's formats or names. None of them moves data or adds a replacement feature.

| ID | Leak | Fix |
|---|---|---|
| 2.1 | Bench tells agents to query OpenCode's `session_v2`/`session_message` tables (`bench/chat-transcripts.ts:29`). | A Buddy chat-reading tool over the Conversations port. |
| 2.2 | Memory consolidation saves OpenCode's export format (`memory/consolidation.ts:348`). | Save the transcript-contract format, and keep reading old archives. |
| 2.3 | Teaching state is written straight into OpenCode session metadata (`teaching-session-metadata.ts:62`). | Read and write it through a Conversations port method. Storage doesn't change. |
| 2.4 | The config plan uses OpenCode's Agent/Model/MCP/Skill/Permission types (`config/runtime/notebook-runtime-plan.ts:5`). | Buddy types in the plan; translate inside the adapter. |
| 2.5 | OpenCode-free helpers live in the adapter: permission evaluator, wildcard, file watcher, tool presentation. | Move them into Buddy packages. |
| 2.6 | The web reads raw tool names, arguments and `metadata.filediff` (`file-change-details.tsx`, `tool-info.ts`). | The adapter maps tool results into normalized fields in transcript-contract. |
| 2.7 | The web sorts parts by lexical ID (`transcript-repository.ts:266`). | Explicit ordering fields in transcript-contract. |
| 2.8 | The web uses OpenCode permission names (`opencode_*`, `external_directory`). | Buddy's permission vocabulary, mapped in the adapter. |
| 2.9 | The web special-cases `providerID=opencode`, free models and Zen errors (`chat-actions.ts:817`, `chat-error-model.ts`). | A Buddy provider and error contract, mapped in the backend. |
| 2.10 | References use OpenCode's SDK types (`reference-query.ts`, `opencode-reference` part). | A Buddy reference contract. Saved drafts keep working. |
| 2.11 | Theme files and provider icons come from the vendored UI (`opencode-adapter/src/theme.ts`, `provider-icon.ts`). | Copy the assets into a Buddy UI package (MIT, keep the attribution). Keep the existing localStorage keys. |

## Phase 3: Runtime switch sheet

A document next to this plan, written once Phases 1–2 settle. It has two parts.

**Per port:**
- what OpenCode provides today
- what any runtime must provide (the conformance suite is the test)
- what Buddy would have to add by hand if the runtime doesn't

The survey already shows the main gaps for Pi:
- Approvals: Pi has only a `tool_call` hook.
- Subagents: Pi has none.
- Chat storage: Pi stores chats only in its own JSONL files, unless the host supplies a `SessionManager`.

**User data that would need moving at switch time,** ranked by impact:
1. chats and attachments
2. notebook artifact links
3. teaching and subagent lineage
4. credentials, MCP and config
5. snapshots and full tool output
6. grants and drafts
7. plugin storage

For each item, the sheet says where it lives, its format, and how it would be exported.

## Staffing

- **Design and review:** design the ports (1.1), write the switch sheet (Phase 3), and do the final review of each phase.
- **Implementation:** split across as many agents as limits allow.

## Calls this plan makes

Say if you disagree with any of these:

1. **User data stays in OpenCode's storage for now.** The switch sheet records how to move it.
2. **The ports copy OpenCode's current behaviour exactly,** including queueing, permissions and subagents.
3. **Bench agents read chats through a Buddy tool.**

## Separate from this plan

The v1→v2 chat migration for desktop is a v2-shipping task, not decoupling. Read the pre-upgrade backup, import through OpenCode's public `session.import`, and keep the backup.
