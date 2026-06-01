# Buddy × OpenCode v2 — architecture findings

Research date: 2026-06-01  
Method: concrete hypotheses validated by parallel code review against:

- Buddy: `/Users/prashantbhudwal/Code/buddy` (commit `8082447a28` at time of write)
- OpenCode upstream: `/Users/prashantbhudwal/code/opencode`, remote `upstream/dev` after `git fetch upstream` (tip `1813256d8`)

This document consolidates the architecture thread: what v2 changes, what Buddy integration looks like **today**, and what v2 might replace vs what it does not.

---

## Executive summary

1. **Buddy already dropped the HTTP proxy.** Runtime integration is `createOpencodeClient` + in-process `fetchOpenCodeApp` + `buddy-runtime-plugin` (v1 plugin hooks).
2. **OpenCode v2 on `upstream/dev` is a real architectural shift** (`packages/core` session storage, `AgentV2`, `PluginV2`, `session.next.*` events, typed `Prompt`) — but **`SessionV2.prompt` and `SessionV2.create` are still stubs** on `upstream/dev`.
3. **v2 offers different mechanisms** for some Buddy concerns (agent `mode`/`hidden`/`permissions`, child `parent_id`, upstream `deriveSubagentSessionPermission`, tool-input events) — **not** a single switch that removes `@buddy/opencode-adapter`.
4. **Buddy-specific teaching/subagent policy** remains substantial (`subagent-tool-forwarding.ts`); upstream task tool only covers generic subagent permissions + prompt-time tool toggles.
5. **Adopting v2** is mostly re-homing (SDK v2, message/event types, optional `PluginV2`) plus dropping bridges (e.g. `tool-input-delta-live`) when the web path is end-to-end v2 — not deleting the in-process boundary.

---

## Hypothesis validation

| ID | Hypothesis | Verdict | Evidence |
|----|------------|---------|----------|
| **H1** | Buddy no longer uses `http/proxy` / `proxyToOpenCode`; uses SDK + `fetchOpenCodeApp` | **VERIFIED** | No `packages/buddy/src/http/proxy*`. `packages/buddy/src/opencode-runtime/client.ts` wires `createOpencodeClient({ fetch: fetchOpenCodeApp })`. |
| **H2** | On `upstream/dev`, `SessionV2.prompt` is unavailable | **VERIFIED** | `packages/core/src/session.ts` (~309–311): `Effect.fail(new OperationUnavailableError({ operation: "prompt" }))`. **Note:** `packages/opencode/src/v2/session.ts` was **removed** on `upstream/dev`; older branches/vendor may still have it. |
| **H3** | On `upstream/dev`, `SessionV2.create` is stubbed | **VERIFIED** | `packages/core/src/session.ts` (~195–197): `return {} as SessionSchema.Info`. `get`/`list`/`messages`/`context` are implemented against SQLite. |
| **H4** | Task tool calls `deriveSubagentSessionPermission` on new child sessions | **VERIFIED** | `packages/opencode/src/tool/task.ts` (~158–162) + `packages/opencode/src/agent/subagent-permissions.ts`. |
| **H5** | `AgentV2` has `mode` / `hidden` / `permissions`; `PluginV2` has `agent.update` / `agent.remove` / `agent.default` | **VERIFIED** (config path nuance) | `packages/core/src/agent.ts`, `packages/core/src/plugin.ts`. Config agent schema: `packages/opencode/src/config/agent.ts` (not under `packages/core/src/config/`). |
| **H6** | Buddy subagent forwarding adds teaching state, persona policy, tool overrides beyond task tool | **VERIFIED** | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`, `packages/buddy/src/opencode-runtime/subagent-forwarding.ts`. Buddy patches after OpenCode creates child session; does not reimplement `deriveSubagentSessionPermission`. |
| **H7** | v1 HTTP `PATCH` session merges permissions; Buddy adapter `Session.setPermission` replaces | **VERIFIED** | `handlers/session.ts`: `Permission.merge` before `setPermission`. Adapter `packages/opencode-adapter/src/session.ts` calls in-process `setPermission` with full ruleset. |
| **H8** | `agent.hidden` does not hide skills; Buddy still uses `skill-live` for `customize-opencode` | **VERIFIED** | `AgentV2` uses `hidden` for default/subagent UX. `Skill.available` filters by permission, not `hidden`. Buddy: `hidden-opencode-skills.ts`, `skill-filtering.ts`, `packages/opencode-adapter/src/skill-live.ts`. |
| **H9** | v2 `SessionTable` has `parent_id`, `permission`, `metadata` JSON columns | **VERIFIED** | `packages/core/src/session/sql.ts` on `upstream/dev`. |
| **H10** | `nxl/v2-deferred-prompt` (`82071ff90`) not in `upstream/dev`; prompt only works for `delivery === "deferred"` on that branch | **VERIFIED** | `git merge-base --is-ancestor` fails; only branch contains commit. `packages/opencode/src/v2/session.ts` on that branch gates prompt on `deferred`. Side branch uses **old** file layout (pre-core move). |
| **H11** | `PluginV2` has no session/chat/spawn/skill hooks (provider/catalog/agent only) | **VERIFIED** | `packages/core/src/plugin.ts` `HookSpec` keys: `catalog.transform`, `account.switched`, `aisdk.*`, `agent.update`, `agent.remove`, `agent.default` only. |
| **H12** | Core has `session.next.tool.input.delta` updater; Buddy still ships `tool-input-delta-live` | **VERIFIED** | Vendor: `packages/core/src/session-message-updater.ts`. Buddy: `packages/opencode-adapter/src/tool-input-delta-live.ts`, boot in `opencode-runtime/runtime.ts`. Adoption requires v2 SSE/message path end-to-end. |

---

## Buddy integration today (code, not plan docs)

```
packages/web → BuddyClient → packages/buddy (Hono, teaching, personas/features)
                              → opencode-runtime/ (env, boot, buddy-runtime-plugin)
                              → getOpenCodeClient() → fetchOpenCodeApp → loadOpenCodeApp()
                              → @buddy/opencode-adapter (instance, patches, types)
                              → vendor/opencode (v1 agent loop + v2 core pieces in vendor tree)
```

**Boot patches** (`packages/buddy/src/opencode-runtime/runtime.ts`):

- `plugin-live` — inject Buddy runtime plugin factory
- `tool-input-delta-live` — whiteboard progressive tool args (v1 path)
- `subagent-forwarding` — `SessionPrompt` + `ToolRegistry` interceptors
- `skill-filtering` — `skill-live` visibility filter

**v1 plugin** (`buddy-runtime-plugin.ts`): tools, `experimental.chat.system.transform`, `experimental.chat.messages.transform`.

---

## What v2 changes vs v1 (mechanisms, not API churn)

| Area | v1-style | v2-style (upstream direction) |
|------|----------|-------------------------------|
| Session storage | `packages/opencode` session services + `MessageV2` | `packages/core` `SessionV2` + SQLite `SessionTable` / `SessionMessageTable` |
| Agents | Config + runtime agent | `AgentV2` with `mode`, `hidden`, `permissions`; `PluginV2` `agent.*` hooks |
| Child sessions | `parentID` on v1 session | `parent_id` column + same task-tool derive helper |
| Prompt input | Message + heterogeneous parts | Typed `Prompt` (`text`, `files`, `agents`, `references`) |
| Streaming | `message.updated` / `message.part.delta` | `session.next.*` (+ bridge to legacy bus for OpenCode app) |
| Tool args streaming | Often dropped in v1 processor; Buddy bridges LLM stream | `session.next.tool.input.*` → `session-message-updater` |
| Extension (product) | `@opencode-ai/plugin` chat/tool hooks | **Also** `PluginV2` for catalog/provider/agent (Effect, Immer drafts) |
| Config | Overlay + vendored config load | `ConfigV2` in core (in progress, e.g. `feat/core-config-service`) |

---

## Does v2 remove `@buddy/opencode-adapter`?

**No — it can shrink and change shape.**

| Adapter concern | v2 alternative? | When adapter can shrink |
|-----------------|-----------------|-------------------------|
| In-process `Instance` / Effect bridge | External opencode only | If Buddy stops embedding (major product change) |
| `tool-input-delta-live` | `session.next.tool.input.delta` + updater | Web + routes consume v2 messages/events natively |
| `plugin-live` | `PluginV2` + config `"plugin"` URL | Buddy registers as core plugin without patching `Plugin.Service` |
| `config` overlay patch | `ConfigV2` + `agent.update` | Overlay expressed through core config API |
| `skill-live` | Config skill paths / deny rules | If built-in `customize-opencode` never enters catalog |
| `session-prompt` / `registry` interceptors | `AgentV2` permissions + `tool.execute.*` on `task` + `session.metadata`? | **Partially** — upstream covers generic subagent perms; **Buddy teaching seed/policy still needs a hook point** |
| `Session.setPermission` replace | HTTP/core replace semantics | When PATCH stops merging or v2 exposes replace |
| `session-live` cache | v2 cursor APIs + stable SDK reads | Optional |

**`PluginV2` does not replace** v1 `buddy-runtime-plugin` for Buddy learning tools until tools move to a v2 tool surface (they have not).

---

## If Buddy adopts v2 (target architecture)

Unchanged:

- **Product:** personas, features, teaching state, `BuddyClient`, Hono.

Changes:

- **Chat contract:** `SessionMessage` + `session.next.*` (regen SDK, web streaming).
- **Transport:** `client.v2.session.*` for list/messages/context/prompt when implemented.
- **Adapter:** thin instance bridge + patches until spawn/teaching/permission-replace solved.
- **Drop:** v1-only message/part reassembly where v2 events suffice.

**Blocker today:** `upstream/dev` — `SessionV2.prompt` / `create` stubs; Buddy vendor may still contain **both** `packages/opencode/src/v2/session.ts` and `packages/core/src/session.ts` until next vendor sync.

---

## Branch / sync notes (2026-06-01 fetch)

- Local opencode clone on `dev` was **behind `upstream/dev`** before fetch; after fetch, `upstream/dev` tip `1813256d8`.
- **`upstream/nxl/v2-deferred-prompt`**: only partial prompt (`deferred` only); **not merged** to `dev`; old path layout.
- **`upstream/beta`**: force-pushed; not a working v2 prompt loop at tip.
- Validate vendor sync with [upstream-fetch algorithm](../guides/upstream-fetch.algo.md); prefer **`upstream/dev`** as architectural truth.

---

## Related Buddy docs

| Doc | Role |
|-----|------|
| [tiered-decoupling-plan.md](../decoupling/tiered-decoupling-plan.md) | Plugin + SDK decoupling (some items done; proxy claim outdated) |
| [UPSTREAM-HOOKS.md](../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) | Missing hooks Buddy still patches |
| [vendor-codex-prompt-pipelines.md](../context-engineering/buddy-prompt-engineering/vendor-codex-prompt-pipelines.md) | Prompt layering pain (v2 `Prompt` may help when prompt ships) |

---

## Subagent provenance

Hypotheses H1–H3, H4–H6, H7–H8, H9–H10 were validated in parallel subagent runs (2026-06-01). H2/H3 paths were corrected against `upstream/dev` (implementation in `packages/core/src/session.ts`, not `packages/opencode/src/v2/session.ts`). H11–H12 added during doc merge from direct repo reads.

---

## Open questions (not validated)

1. Will `SessionV2.create` / `prompt` on `upstream/dev` land before Buddy vendor sync?
2. Will HTTP v2 session update support **permission replace** (not merge)?
3. Will OpenCode add `session.subagent.spawn` or equivalent so Buddy can drop `promptOps` wrapping?
4. Can Buddy teaching seed use **`session.metadata`** on v2 rows instead of interceptors?

Track these on vendor bumps; do not assume from specs alone.
