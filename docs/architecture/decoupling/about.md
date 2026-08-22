# OpenCode decoupling — handoff

Read this file first. The other documents in this folder are research notes, phase logs, and checklists from a migration that **already landed**. They tell you *how* we got here. This file tells you *why* we did it and what to preserve going forward.

You do not need to read every phase doc unless you are changing a specific area — see [Appendix: document map](#appendix-document-map) at the end.

---

## The problem we were solving

Buddy runs on vendored OpenCode. For a long time, the integration looked like this: Buddy's Hono server proxied HTTP into an in-process OpenCode instance, registered and unregistered learning tools on every request, and patched vendored internals (session, tools, skills, subagent spawning) wherever OpenCode did not expose a public extension point.

That worked, but it was brittle. Every upstream OpenCode bump was a dice roll. Internal Effect types, bootstrap order, registry APIs, and prompt pipeline shapes could change without TypeScript catching the breakage at Buddy call sites. The proxy layer also mixed transport with product logic — tool registration rode along on unrelated routes.

We did **not** set out to replace OpenCode or build a second agent runtime. We set out to **narrow the integration boundary**: use maintained surfaces where they exist, and keep a small, honest adapter only where they do not.

---

## The philosophy

**Decoupling, in this repo, means:** stop calling vendored OpenCode internals from Buddy product code except through a documented adapter boundary.

It does **not** mean:

- Removing OpenCode from the stack
- Migrating to OpenCode v2 prompt or message format (v2 prompt was stubbed when we researched this; v1 remains the frontend contract)
- Pretending we can delete all adapter patches without upstream hooks
- Achieving "zero vendored hacking" as a vanity metric

It **does** mean:

- **Plugin first** — Buddy learning tools and in-loop behavior (system prompt filtering, message transforms) live in `@opencode-ai/plugin` hooks, loaded as a single runtime plugin
- **SDK for transport** — Buddy Hono talks to OpenCode through `@opencode-ai/sdk`, not a custom proxy
- **Permissions for visibility** — tools are registered once at plugin load; what the model sees is gated by session permission rules, not runtime register/unregister
- **Adapter only for gaps** — subagent forwarding, skill filtering, config overlay, permission replace semantics, and a few other cases stay in `@buddy/opencode-adapter` until OpenCode adds equivalent hooks

The north star is **maintainability under vendor sync**, not architectural purity. We accepted a modest win: fewer surfaces that break on bump, clearer ownership of Buddy vs OpenCode code, and explicit documentation of what still requires patches.

---

## What we changed

### Before

```
Buddy Hono ── custom proxy ──▶ OpenCode (vendored, in-process)
    │                               │
    │                               ├─ monkey-patches on session, tools, skills, prompts
    │                               ├─ register/unregister tools per request
    │                               └─ separate system-prompt plugin via config overlay
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
|------------|-------------------------------------|
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

Incremental cleanup (SDK v2 for routes v1 omits, optional compaction hooks, etc.) lives in `tiered-decoupling-plan.md`. Phase docs are historical; use the tier table for remaining work.

---

## Appendix: where things live in code

| Concern | Path |
|---------|------|
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

The folder is a scattered plan on purpose — research, phases, and follow-on tracks were written as we went. Use this map instead of reading everything.

| When you need… | Read |
|----------------|------|
| **This handoff (philosophy + conclusion)** | `about.md` (this file) |
| **Current backlog (done vs next)** | [tiered-decoupling-plan.md](./tiered-decoupling-plan.md) |
| **Blocked on upstream** | [UPSTREAM-HOOKS.md](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) |
| **Shipped tool permission semantics** | [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md) |
| **FAQ (registry timing, deny vs register)** | [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) |
| **Original research + 0–8 phase plan** | [migration-plan.md](./migration-plan.md), [plugin-analysis.md](./plugin-analysis.md) |
| **Step-by-step phase notes** | `phase-1` through `phase-6-7-8` implementation docs — only if touching that area |
| **Post-migration patch reduction** | [upstream-fetch-reduction-plan.md](./upstream-fetch-reduction-plan.md) |
| **Vendor bump ritual** | [../guides/upstream-fetch.algo.md](../../guides/upstream-fetch.algo.md) |
