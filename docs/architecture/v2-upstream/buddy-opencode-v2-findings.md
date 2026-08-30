# Buddy × OpenCode v2 — architecture findings

> **Point-in-time 2026-06-01.** Later snapshot: [upstream-v2-audit-2026-07-04.md](./upstream-v2-audit-2026-07-04.md), which **supersedes H2/H3** (SessionV2 `create`/`prompt` were no longer stubs on `upstream/dev` as of 2026-07-04) and updates H11 for the v2 branch. Re-verify against current `vendor/opencode` before treating any row as today’s vendor.

Research date: 2026-06-01  
Method: concrete hypotheses validated by parallel code review against:

- Buddy: `/Users/prashantbhudwal/Code/buddy` (commit `8082447a28` at time of write)
- OpenCode upstream: `/Users/prashantbhudwal/code/opencode`, remote `upstream/dev` after `git fetch upstream` (tip `1813256d8`)

This document consolidates what v2 changed **as of 2026-06-01**, what Buddy integration looked like then, and what v2 might replace vs what it does not.

---

## Executive summary

1. **Buddy already dropped the HTTP proxy.** Runtime integration is `createOpencodeClient` + in-process `fetchOpenCodeApp` + `buddy-runtime-plugin` (v1 plugin hooks).
2. **As of 2026-06-01**, OpenCode v2 on `upstream/dev` was a real architectural shift (`packages/core` session storage, `AgentV2`, `PluginV2`, `session.next.*` events, typed `Prompt`) — and **`SessionV2.prompt` and `SessionV2.create` were still stubs** on that day’s `upstream/dev`. **Do not treat the stub claim as current.** The 2026-07-04 audit found real `Effect.fn` implementations; the remaining gate was HTTP prompt still calling v1 `SessionPrompt.Service`.
3. **v2 offers different mechanisms** for some Buddy concerns (agent `mode`/`hidden`/`permissions`, child `parent_id`, upstream `deriveSubagentSessionPermission`, tool-input events) — **not** a single switch that removes `@buddy/opencode-adapter`.
4. **Buddy-specific teaching/subagent policy** remains substantial (`subagent-tool-forwarding.ts`); upstream task tool only covers generic subagent permissions + prompt-time tool toggles.
5. **Adopting v2** is mostly re-homing (SDK v2, message/event types, optional `PluginV2`) plus dropping bridges (e.g. `tool-input-delta-live`) when the web path is end-to-end v2 — not deleting the in-process boundary.

---

## Hypothesis validation

| ID | Hypothesis | Verdict | Evidence |
|----|------------|---------|----------|
| **H1** | Buddy no longer uses `http/proxy` / `proxyToOpenCode`; uses SDK + `fetchOpenCodeApp` | **VERIFIED** | No `packages/buddy/src/http/proxy*`. `packages/buddy/src/opencode-runtime/client.ts` wires `createOpencodeClient({ fetch: fetchOpenCodeApp })`. |
| **H2** | On `upstream/dev`, `SessionV2.prompt` is unavailable | **VERIFIED as of 2026-06-01; SUPERSEDED 2026-07-04** | 2026-06-01: `packages/core/src/session.ts` (~309–311): `Effect.fail(new OperationUnavailableError({ operation: "prompt" }))`. July audit: create/prompt are real `Effect.fn` implementations. |
| **H3** | On `upstream/dev`, `SessionV2.create` is stubbed | **VERIFIED as of 2026-06-01; SUPERSEDED 2026-07-04** | 2026-06-01: `packages/core/src/session.ts` (~195–197): `return {} as SessionSchema.Info`. July audit: no longer stubs. |
| **H4** | Task tool calls `deriveSubagentSessionPermission` on new child sessions | **VERIFIED** | `packages/opencode/src/tool/task.ts` (~158–162) + `packages/opencode/src/agent/subagent-permissions.ts`. |
| **H5** | `AgentV2` has `mode` / `hidden` / `permissions`; `PluginV2` has `agent.update` / `agent.remove` / `agent.default` | **VERIFIED** (config path nuance) | `packages/core/src/agent.ts`, `packages/core/src/plugin.ts`. Config agent schema: `packages/opencode/src/config/agent.ts` (not under `packages/core/src/config/`). |
| **H6** | Buddy subagent forwarding adds teaching state, persona policy, tool overrides beyond task tool | **VERIFIED** | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts`, `packages/buddy/src/opencode-runtime/subagent-forwarding.ts`. Buddy patches after OpenCode creates child session; does not reimplement `deriveSubagentSessionPermission`. |
| **H7** | v1 HTTP `PATCH` session merges permissions; Buddy adapter `Session.setPermission` replaces | **VERIFIED** | `handlers/session.ts`: `Permission.merge` before `setPermission`. Adapter `packages/opencode-adapter/src/session.ts` calls in-process `setPermission` with full ruleset. |
| **H8** | `agent.hidden` does not hide skills; Buddy still uses `skill-live` for `customize-opencode` | **VERIFIED** | `AgentV2` uses `hidden` for default/subagent UX. `Skill.available` filters by permission, not `hidden`. Buddy: `hidden-opencode-skills.ts`, `skill-filtering.ts`, `packages/opencode-adapter/src/skill-live.ts`. |
| **H9** | v2 `SessionTable` has `parent_id`, `permission`, `metadata` JSON columns | **VERIFIED** | `packages/core/src/session/sql.ts` on `upstream/dev`. |
| **H10** | `nxl/v2-deferred-prompt` (`82071ff90`) not in `upstream/dev`; prompt only works for `delivery === "deferred"` on that branch | **VERIFIED (side branch only)** | Never merged to `upstream/dev`. Do not treat as architectural truth. Side branch uses **old** file layout (pre-core move). |
| **H11** | `PluginV2` has no session/chat/spawn/skill hooks (provider/catalog/agent only) | **VERIFIED as of 2026-06-01 for `upstream/dev`; stale for 2026-07-04 `upstream/v2` branch** | 2026-06-01 `packages/core/src/plugin.ts` `HookSpec` keys: `catalog.transform`, `account.switched`, `aisdk.*`, `agent.update`, `agent.remove`, `agent.default` only. July audit: v2 branch added `ctx.tool.hook` / `ctx.session.*`; still absent on that day’s `dev`. |
| **H12** | Core has `session.next.tool.input.delta` updater; Buddy still ships `tool-input-delta-live` | **VERIFIED** | Vendor: `packages/core/src/session-message-updater.ts`. Buddy: `packages/opencode-adapter/src/tool-input-delta-live.ts`, boot in `opencode-runtime/runtime.ts`. Adoption requires v2 SSE/message path end-to-end. |

---

## Buddy integration as of 2026-06-01 (code, not plan docs)

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

**Blocker as of 2026-06-01:** `upstream/dev` — `SessionV2.prompt` / `create` stubs; Buddy vendor might still contain **both** `packages/opencode/src/v2/session.ts` and `packages/core/src/session.ts` until the next vendor sync.

**As of 2026-07-04:** those stubs were gone. Remaining adoption gates are in [upstream-v2-audit-2026-07-04.md](./upstream-v2-audit-2026-07-04.md) (HTTP prompt still on v1 `SessionPrompt.Service` in that snapshot, plus plugin-hook merge and teaching-seed hook).

---

## Branch / sync notes (2026-06-01 fetch)

- Local opencode clone on `dev` was **behind `upstream/dev`** before fetch; after fetch, `upstream/dev` tip `1813256d8`.
- **`upstream/nxl/v2-deferred-prompt`**: only partial prompt (`deferred` only); **not merged** to `dev`; old path layout. Experiment artifact — not `upstream/dev` truth.
- **`upstream/beta`**: force-pushed; not a working v2 prompt loop at tip.
- Validate vendor sync with [upstream-fetch algorithm](../../guides/upstream-fetch.algo.md); prefer **`upstream/dev`** as architectural truth.

---

## Related Buddy docs

| Doc | Role |
|-----|------|
| [upstream-v2-audit-2026-07-04.md](./upstream-v2-audit-2026-07-04.md) | Later upstream snapshot; supersedes H2/H3 and updates H11 |
| [permission-v2.md](../decisions/permission-v2.md) | Canonical PermissionV2 adoption ADR |
| [tiered-decoupling-plan.md](../decoupling/tiered-decoupling-plan.md) | Dated plugin + SDK decoupling snapshot |
| [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) | Missing hooks Buddy still patches |

---

## Subagent provenance

Hypotheses H1–H3, H4–H6, H7–H8, H9–H10 were validated in parallel subagent runs (2026-06-01). H2/H3 paths were corrected against `upstream/dev` (implementation in `packages/core/src/session.ts`, not `packages/opencode/src/v2/session.ts`). H11–H12 added during doc merge from direct repo reads.

---

## Open questions (not validated)

1. Will `SessionV2.create` / `prompt` on `upstream/dev` land before Buddy vendor sync? **Answered 2026-07-04:** implementations existed; HTTP route cutover had not.
2. Will HTTP v2 session update support **permission replace** (not merge)?
3. Will OpenCode add `session.subagent.spawn` or equivalent so Buddy can drop `promptOps` wrapping?
4. Can Buddy teaching seed use **`session.metadata`** on v2 rows instead of interceptors?

Track these on vendor bumps; do not assume from specs alone.
