# OpenCode Decoupling Architecture

How Buddy moves agent behavior onto **official OpenCode plugin + SDK** surfaces and shrinks `@buddy/opencode-adapter` to patches that have no upstream equivalent.

## Philosophy

Decoupling means **stopping calls to vendored OpenCode internals from Buddy product code** except through a documented adapter boundary. The goal is maintainability under vendor sync:

- **Plugin first:** Buddy learning tools and in-loop behavior (system prompt guard, tool UI stripping) live in `@opencode-ai/plugin` hooks loaded as a single runtime plugin.
- **SDK for transport:** Buddy Hono communicates with OpenCode via typed `@opencode-ai/sdk` client calls rather than a custom HTTP proxy.
- **Permissions for visibility:** Tools are registered once at plugin bootstrap; LLM visibility is governed by session permission rules, not runtime registration churn.
- **Adapter only for gaps:** Subagent forwarding, skill filtering, config overlay, permission replace semantics, and live session caching stay in `@buddy/opencode-adapter` until OpenCode exposes official extension points.

---

## Architecture: Before vs. After

### Before

```
Buddy Hono ── raw fetch / proxy ──▶ OpenCode (vendored, in-process)
    │                                  │
    ├─ proxy tool registration shims  ├─ ToolRegistry monkey-patches
    ├─ withConfigOverlay env mutation ├─ Session.Service monkey-patches
    │                                  └─ Plugin.Service monkey-patches
    │
    └─ teaching state, learner routes, config (Buddy-owned)
```

- Tool visibility: "Is this tool in the registry **right now**?" — often updated on each proxied call, plus permissions.
- Transport: raw fetch helpers and body transforms that also synced the registry.
- Patches: spread across proxy registration, adapter registry, and several boot-time monkey-patches.

### After

```
Buddy Hono ── typed SDK ──▶ OpenCode (vendored, in-process)
    │                          │
    │                          ├─ Buddy runtime plugin (all tools + key hooks)
    │                          └─ narrow adapter patches (documented gaps only)
    │
    └─ teaching state, prompt orchestration, learner routes (Buddy-owned)
```

- Tool visibility: "Are all tools in the registry; is **this session** allowed to use them?" — permissions sync on each prompt; registry is stable at instance boot.
- Transport: `getOpenCodeClient()` over in-process fetch; the `http/proxy` layer is gone.
- Patches: consolidated and documented; several removed or replaced by plugin hooks (e.g. tool UI strip via `experimental.chat.messages.transform`).

### What stayed the same externally

Users and the web app see no migration. Buddy HTTP API, generated `BuddyClient`, v1 message format, `createBuddyTool`, personas, features, and subagent definitions are unchanged. Hono still owns prompt orchestration — persona targeting, teaching state writes and rollback, learner evidence — because OpenCode's `chat.message` hook fires too late in the pipeline to replace that work cleanly.

---

## The big semantic shift: registration → permissions

The most important behavior change is how tool visibility works.

**Old model:** hide a tool by unregistering it from `ToolRegistry`. Dynamic grants called register + allow; release called unregister + deny. Config-off tools were absent from the registry entirely.

**New model:** export every Buddy learning tool from the runtime plugin at instance boot. Hide tools with session `deny` rules (wildcard pattern). Dynamic grants only update permissions. Config-off and runtime-not-ready tools stay registered but denied.

This aligns with how OpenCode actually filters tools before the LLM call: `resolveTools` drops entries that permission rules disable. Wildcard `deny` means the tool never appears in the model's tool list — it is not "sent but fails at execute time."

Registry and permissions are not redundant. The registry is project/instance scoped and stable; permissions are session scoped and updated every prompt. That separation is what lets per-chat tool grants and subagent forwarding work without global registry churn.

---

## What shipped (conclusion)

The core migration is **done**. As of the decoupling branch work:

1. **Buddy is an OpenCode plugin** — `buddy-runtime-plugin.ts` exports all learning tools and implements system-prompt guard + tool-UI stripping via official hooks.
2. **Buddy uses the SDK** — routes and session actions call `getOpenCodeClient()` instead of the deleted proxy.
3. **Tool semantics are permission-based** — `registerBuddyTools` / per-request registry sync are gone; see `phase-3-tool-semantics-shipped.md` for the as-built contract.
4. **Adapter is intentionally small** — subagent/task forwarding, skill filtering, config overlay, and a few in-process bridges remain; each gap is listed in `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md`.

Follow-on work in `upstream-fetch-reduction-plan.md` further shrank patch surface (session cache, tool UI enrichment, LLM usage extraction, etc.) without reopening vendor coupling.

**Honest assessment of the win:** real but modest. Plugin hooks and SDK HTTP routes are stabler than Effect internals, but adapter patches can still break on vendor sync — just fewer of them, with narrower blast radius. The 15-step upstream-fetch ritual still exists; it is lighter, not gone.

---

## What we deliberately did not move (and why)

Do not try to "finish decoupling" by deleting these without upstream support.

| Buddy need | Why plugin/SDK is not enough today |
|---|---|
| **Subagent / task child sessions** | Must seed child teaching state, tool overrides, and permissions before the child's first prompt. `tool.execute.before` can mutate task args; it cannot wrap internal `promptOps.prompt()`. |
| **Skill visibility** | No hook to hide built-in OpenCode skills from `skill.available()`. We patch the skill service. |
| **Pre-prompt targeting** | Persona, model, and tool targeting run in Hono before the SDK prompt. `chat.message` runs after agent/model resolution — too late. |
| **Replace session permissions** | HTTP `PATCH /session/{id}` merges permission arrays. Buddy needs replace semantics → adapter `Session.setPermission`. |
| **Per-directory config overlay** | Plugin `config` hook is init-time only; Buddy overlays per project directory at request time. |
| **`permission.ask` plugin hook** | Defined in types, never triggered in vendor. Permissions use session rules + HTTP `/permission` + SSE — same as before. |

These are not backlog items we forgot. They are documented constraints. Read `UPSTREAM-HOOKS.md` before removing any adapter patch.

---

## How to think about new work

When adding or changing agent behavior, ask in order:

1. **Is there an official plugin hook?** Verify with `rg 'plugin.trigger'` in `vendor/opencode` — do not trust the hook interface alone (`permission.ask` is the cautionary tale).
2. **Can the SDK do it?** Prefer typed client calls over adapter Effect services for HTTP-shaped operations.
3. **Is it session-scoped visibility?** Use permissions, not registry changes.
4. **Does it need pre-prompt orchestration?** Keep it in Hono / `message-prompt-pipeline.ts` unless upstream adds an earlier hook.
5. **Only then** — extend the adapter, document the missing upstream hook, and add a test that explains why the patch exists.
6. **Do not start a second OpenCode runtime casually.** The SDK's `createOpencodeServer()` spawns a separate `opencode` process; use Buddy's in-process `getOpenCodeClient()`/custom fetch boundary instead. Moving to a child-process runtime is a separate, explicit architecture decision.

Incremental cleanup notes live in the dated [tiered-decoupling-plan.md](./tiered-decoupling-plan.md) (not a live sprint board). Blocked gaps: [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md). Landed patch reduction: [upstream-fetch-reduction-plan.md](./upstream-fetch-reduction-plan.md).

---

## Appendix: where things live in code

| Concern | Path |
|---|---|
| Plugin entry | `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts` |
| Tool export | `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts` |
| SDK client | `packages/buddy/src/opencode-runtime/client.ts` |
| Runtime boot | `packages/buddy/src/opencode-runtime/runtime.ts` |
| Session permissions | `packages/buddy/src/learning/access/build-runtime-permissions.ts` |
| Subagent forwarding | `packages/buddy/src/opencode-runtime/subagent-forwarding.ts` |
| Skill filtering | `packages/buddy/src/opencode-runtime/skill-filtering.ts` |
| Upstream gaps | `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md` |

---

## Appendix: document map

The folder is structured as follows:

| When you need… | Read |
|---|---|
| **This handoff (philosophy + conclusion)** | `about.md` (this file) |
| **Dated May–June 2026 snapshot (re-verify NEXT)** | [tiered-decoupling-plan.md](./tiered-decoupling-plan.md) |
| **Blocked on upstream** | [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) |
| **Shipped tool permission semantics** | [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md) |
| **FAQ (registry timing, deny vs register)** | [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) |
| **Plugin research & compatibility analysis** | [plugin-analysis.md](./plugin-analysis.md) |
| **Post-migration patch reduction** | [upstream-fetch-reduction-plan.md](./upstream-fetch-reduction-plan.md) |
| **Vendor bump ritual** | [../../guides/upstream-fetch.algo.md](../../guides/upstream-fetch.algo.md) |
