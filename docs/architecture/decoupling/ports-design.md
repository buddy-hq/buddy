# Buddy agent-runtime ports: design

Written 2026-10-21 for Phase 1 of [`runtime-decoupling-plan.md`](runtime-decoupling-plan.md). The interfaces themselves live in code, in `packages/agent-runtime/src/`. This document says why they look the way they do, what each one promises, and in which order the work lands.

## The rule

Buddy code depends on `@buddy/agent-runtime`, never on OpenCode. One file in `packages/buddy` (the composition root) builds the runtime; everything else asks the composition root for an `AgentRuntime` and uses only the port types.

```
packages/web ──@buddy/sdk──▶ packages/buddy (routes, features)
                                   │ uses
                                   ▼
                           @buddy/agent-runtime   (ports: types and contracts only)
                                   ▲ implements
                                   │
                           @buddy/opencode-adapter ──▶ @opencode/*, vendor/opencode
                                   ▲
                                   │ imports (only here)
                     packages/buddy/src/runtime/   (composition root)
```

`@buddy/agent-runtime` depends only on `@buddy/transcript-contract` and Zod. The adapter depends on both packages and on OpenCode. The adapter never imports `packages/buddy`.

## Two directions

Buddy and OpenCode talk in two directions, and the ports split the same way.

1. **Outbound: Buddy calls the runtime.** Routes and features create chats, send prompts, answer approvals, list providers and so on. This is `AgentRuntime` and its eleven ports. It is designed in full now (slice 1).
2. **Inbound: the runtime calls Buddy.** Inside the agent loop OpenCode calls Buddy's plugin: tools, the prompt/context/compaction/generate hooks, the before-tool hook for subagents, the catalog transforms that apply each notebook's agents, skills, models and MCP servers, and the Codex account RPCs. This becomes a Buddy-typed `RuntimeExtension`. It is designed after slice 1 lands (slice 2), because slice 1 settles the shared vocabulary it builds on. A sketch is at the end.

## Conventions every port follows

- **Copy today's behaviour exactly.** Each port operation wraps the existing `gateway/*` function or native call it replaces. Queueing, ordering, retries, error statuses and edge cases stay as they are. Fixes are separate, named changes.
- **Buddy vocabulary at the edge.** Types come from `@buddy/transcript-contract` where it already has them (`Session`, `MessageWithParts`, `BuddyEvent`, `PermissionRequest`, permission rules). Native names (`resume`, `inbox`, `text` for command arguments, `id` for a model's ID) are translated inside the adapter: Buddy says `noReply`, `arguments`, `modelID`.
- **IDs are opaque.** Buddy code never builds or parses runtime IDs. Known leak to close in slice 1: the prompt route requires caller message IDs to start with `msg_`; that check moves into the adapter.
- **One error type.** The adapter converts every native error at the port edge into `RuntimeError` (`kind`, optional `subject`, `cause`). Buddy's HTTP layer maps it with `runtimeErrorStatus`. This replaces `sessionErrorStatus`, `isSessionNotFound`, `isPermissionMissingError` and the status half of `providerErrorResponse`. The status table copies today's mapping, including `409` for interrupted turns and `503` for a dropped event connection.
- **Reads throw, turns return results.** Operations that today return `{ ok, value | error }` (prompt, command, compact, admit) keep returning `RuntimeResult`. Everything else throws `RuntimeError`.
- **Construction-time dependencies.** The tool presentation lookup (`directory → toolID → descriptor`) is given once when the runtime is built, instead of on every history read and stream.
- **No runtime lifecycle in the ports.** Starting and closing the host belongs to the composition root (`getAgentRuntime`, `closeAgentRuntime`).

## The ports

| Port | Operations | Replaces | Guarantees to keep |
|---|---|---|---|
| Conversations | get, list, children, create, update, patchMetadata, remove, fork, revert, unrevert, history, message, transcript | `gateway/session.ts`, `gateway/message.ts`, native `session.get/update/export` in features | archived and fork-title metadata handled inside the port; list pagination and `include` filtering as today; history newest page first, returned oldest-first with the cursor for older pages; `transcript` is the whole chat in transcript-contract shape (Bench and memory archives use it) |
| Execution | admit, prompt, command, compact, interrupt, background, statuses, wait, generate | `gateway/write.ts`, `gateway/execution.ts`, native `session.wait/generate` | per-chat serialized admission; a re-sent prompt that was already delivered is a conflict; a waiting prompt returns the final assistant message; a command that is not found falls back to the skill of that name; `noReply` returns the user message without a turn; aborted wait, interruption and dropped stream map to today's statuses |
| Events | stream, signals | `gateway/stream.ts`, `gateway/event.ts`; native `event.subscribe` in notes | `stream` yields today's `BuddyEvent` sequence per directory with hydration, replay and resync; `signals` carries the two backend facts features react to: a turn finished, a chat was renamed |
| Approvals | pending, get, reply, saved, forget, sessionRules, updateSessionRules | `gateway/permission.ts`, native permission calls in routes | rules in Buddy permission vocabulary in and out; pending across a session tree; reply feedback kept for Buddy tools; per-session rule updates serialized and reported as updated/unchanged/missing |
| Forms | pending, answer, dismiss | `gateway/form.ts`, `routes/question.ts` native calls | only agent questions are visible; answers validated against the questions; pending questions survive a reconnect |
| Catalog | agents, skills, commands | `gateway/command.ts`, native `agent.list`, `skill.list` | commands merge runtime commands and skills, commands winning on a name clash |
| Workspace | location, project, findFiles | native `location.get`, `project.list`, `file.find` | a directory resolves to the same project identity it has today |
| Providers | catalog, defaultModel, authMethods, startOAuth, completeOAuth, cancelOAuth, setKey, removeCredentials | `gateway/provider.ts`, `gateway/integration.ts`, native model/provider calls in memory | the Buddy provider DTO (`providers.ts` schemas, moved from the adapter) stays byte-compatible for the SDK and web |
| MCP | servers, connect, disconnect, startAuth, authProgress, cancelAuth, removeCredentials | native `mcp.*`, `integration.oauth.*`, `credential.remove` in `routes/mcp.ts` | the route keeps its attempt bookkeeping; the port only performs the runtime calls |
| References | list | native `reference.list` | the reference records the composer stores keep working |

**Subagents** has no outbound operations of its own. Stopping or backgrounding a child is `execution.interrupt` / `execution.background` on the child chat, children are `conversations.children`, and presentation already lives in transcript-contract (`part.subagent`, `part.completion`). Its real surface is inbound (child preparation before the first step), so it lands in slice 2.

**Context** is entirely inbound (per-prompt system context, teaching-state injection), so it also lands in slice 2. The global compaction setting stays host configuration until then.

**Workspace** is new compared with the plan's table. The survey listed project/location identity as coupling outside the requested capabilities; the routes need it, so it gets its own small port instead of hiding inside Conversations.

## Slices

1. **Slice 1a, implement the ports.** `@buddy/opencode-adapter` gets `src/runtime/` with one file per port group, each a factory over the native host that wraps the existing gateway functions, plus `createOpenCodeRuntime(host, options): AgentRuntime`. The composition root `packages/buddy/src/runtime/agent-runtime.ts` builds it from the existing `getOpenCodeHost()` and memoizes it. Host creation does not move yet.
2. **Slice 1b, move the callers.** Routes and features switch from the native client and `gateway/*` to `getAgentRuntime()`, area by area, verified by the conformance suite. Each `gateway/*` subpath export is removed when its last outside caller leaves. Tests that reach into the adapter move to the port or are deleted when the conformance suite covers them.
3. **Slice 2, the extension side.** Buddy's plugin becomes Buddy-typed: tools, hooks, the per-notebook runtime plan (plan item 2.4) and the Codex account RPCs. Host creation moves into the adapter, `opencode-runtime/*` splits into Buddy logic and adapter wiring (plan item 1.4), and `getOpenCodeHost` disappears.
4. **Slice 3, close the doors** (plan item 1.5) and the remaining Phase 2 leaks.

Until slice 2, these files keep the raw host and are the only ones allowed to: `packages/buddy/src/opencode-runtime/**`, `config/runtime/{notebook-config-plugin,notebook-runtime-plan,opencode-sync,opencode-host-config}.ts`, `learning/agent-execution/state/teaching-session-metadata.ts`, `learning/agent-execution/permissions/runtime-session-permissions.ts`, `learning/agent-execution/transforms/prompt-context.ts`, `learning/features/image-generation/service/codex-images.ts`, and the composition root.

## Slice 2: the extension side

Written 2026-10-22 after slice 1 landed. The contract is code: `packages/agent-runtime/src/extension.ts` and `notebook-plan.ts`.

### The shape

Buddy hands the adapter one `RuntimeExtension` (Buddy-implemented, adapter-consumed). It has three parts:

- **`tools(location)`** returns `RuntimeTool`s. `createBuddyTool` already produces this shape; `ToolCall` keeps the names Buddy tools use today (`abort`, `messages`, `metadata()`, `ask()`), so authored tools do not change. The adapter turns each tool into a native tool: input envelope, history loading, progress, attachments, the `truncated` flag from `output` limits, and error and cancellation mapping.
- **`notebookPlan(directory)`** returns the notebook's `NotebookPlan` (plan item 2.4) in Buddy types: rules in Buddy permission vocabulary, models as `ModelSelection`, providers, MCP servers, skills and commands with Buddy names. Buddy resolves its own persisted config into the plan (retired provider IDs, legacy defaults such as Vertex and Azure, model reference parsing). The adapter owns everything native: decoding into OpenCode types, the `aisdk:` package prefix, snake-case MCP OAuth, permission path separators, the transforms, their precedence and reload barrier, the per-location controllers and the sync RPC.
- **`hooks(location, sessions)`** returns the Buddy-typed hooks for one location. The adapter registers them in today's order: `hydrate` on context, compaction and generate (before anything else on context); `prompt` before command display; `context` after the adapter has applied the transcript-contract prompt presentation to the model messages; `beforeTool` on the subagent tool. Hooks throw `ExtensionError` where they threw a native `ToolError`; the adapter converts it with the same message and cause.

### Decisions

1. **Hooks get a location-bound `SessionAccess`, not the outbound runtime.** Hooks can fire while the host is still being created (recovered work), so calling `getAgentRuntime()` from inside one could wait on itself. The adapter builds `SessionAccess` over the plugin context, which is what the hooks use today. Buddy builds a second `SessionAccess` over the outbound ports for the one outbound caller (`runtime-session-permissions.ts`). Both copy today's semantics: `patchMetadata` reads, merges and writes like `persistBuddyTeachingSnapshot`; `setRules` writes the whole rule set.
2. **Rules cross the contract in Buddy vocabulary.** `buildDelegatedChildSessionPermissions` returns Buddy rules and the adapter converts them back. The round trip must give exactly today's native rules; a worker that finds a case where it does not stops.
3. **Prompt presentation moves into the adapter.** Hiding ignored prompt segments from the model and appending the stored presentation system text are the inverse of what `gateway/message.ts` already does for display, and they read only transcript-contract data. Buddy's `context` hook keeps the Buddy policy: instruction-file filtering, concise-response stripping, the verbosity rule and system-prompt capture. It sees system texts and returns them aligned, an empty string dropping a part.
4. **Approval feedback is adapter behaviour.** The ask protocol (subscribe before create, batched sibling feedback on reject, interrupt on a reject without feedback, reject on cancellation) and the host decorator that captures feedback move into the adapter unchanged. Buddy tools keep calling `ask()`.
5. **The notebook plan is applied by the adapter, orchestrated by Buddy.** Buddy keeps deciding when to rebuild and publish (per-directory locks, sibling notebooks sharing a config, withdrawn-skill reconciliation, the global config cache). The adapter keeps the published plans, the active locations and their controllers, and offers the operations Buddy's orchestration calls on the Catalog port (publish, active directories, sync, ready). Revisions stay in-memory fingerprints; fingerprinting the Buddy plan instead of the native one changes no persisted data.
6. **Terminal cleanup listens to `events.signals`.** Bench capture cleanup moves from the per-location plugin subscription to one `turn.finished` subscription in the composition root.
7. **ChatGPT account, usage, models and images become a service** designed in its own step (S2-C) once the first wave lands; until then `openai-codex-*` and `codex-images.ts` stay on the raw host.

### Order

| Step | Work | Depends on |
|---|---|---|
| E1 | Tools and approvals into the adapter (`extension/tools`); `buddy-tool-shim.ts` keeps only Buddy's catalog | contract |
| E2 | Notebook plan in Buddy types; transforms, controllers, sync RPC and hidden-skill suppression into the adapter (`extension/notebook`); Catalog plan operations | contract |
| E3 | Hooks and teaching: `SessionAccess` (both), `buddy-subagents.ts`, prompt context, teaching snapshot and session-permission sync on Buddy types | E1, E2 |
| E4 | ChatGPT service (S2-C) | design |
| E5 | Host creation into the adapter: one `createOpenCodeRuntime({ paths, extension, ... })`, plugins and instances assembled from the `RuntimeExtension`, env split into Buddy path policy and native globals, command display and terminal cleanup moved, `getOpenCodeHost` and `opencode-runtime/client.ts` deleted, the slice-2 allowlist emptied | E1–E4 |

During E1–E4 the Buddy plugin files keep wiring the adapter's registration functions; E5 replaces that wiring with assembly from the `RuntimeExtension`.
