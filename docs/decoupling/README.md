# OpenCode decoupling docs

How Buddy moves agent behavior onto **official OpenCode plugin + SDK** surfaces and shrinks `@buddy/opencode-adapter` to patches that have no upstream equivalent.

**Agents:** start with **[about.md](./about.md)** — philosophy, handoff, and conclusion. The other files are phase logs and research; use the map at the end of `about.md` when you need one.

## Start here

| Document | When to read |
|----------|----------------|
| **[tiered-decoupling-plan.md](./tiered-decoupling-plan.md)** | **Current plan** — tiers 1–4, done vs next, vendor hook/SDK evidence, file map |
| **[upstream-fetch-reduction-plan.md](./upstream-fetch-reduction-plan.md)** | Follow-on work ordered by risk to shrink Buddy-owned upstream sync cost |
| [UPSTREAM-HOOKS.md](../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md) | What still requires adapter patches until OpenCode adds hooks |
| [tool-permissions-and-migration-faq.md](./tool-permissions-and-migration-faq.md) | Why permissions replaced register/unregister |
| [../guides/upstream-fetch.algo.md](../guides/upstream-fetch.algo.md) | How to validate a vendor bump |

## Historical / phase notes

| Document | Role |
|----------|------|
| [migration-plan.md](./migration-plan.md) | Original 0–8 phase plan |
| [plugin-analysis.md](./plugin-analysis.md) | Plugin + SDK analysis (May 2026) |
| [phase-1-implementation.md](./phase-1-implementation.md) | SDK client + low-risk routes |
| [phase-2-implementation.md](./phase-2-implementation.md) | Buddy runtime plugin |
| [phase-3-implementation.md](./phase-3-implementation.md) | Permission-based tool visibility |
| [phase-3-tool-semantics-shipped.md](./phase-3-tool-semantics-shipped.md) | As-built tool semantics |
| [phase-4-5-implementation.md](./phase-4-5-implementation.md) | Plugin merge + prompt SDK |
| [phase-6-7-8-implementation.md](./phase-6-7-8-implementation.md) | Patch consolidation + validation |

For **remaining work**, prefer [tiered-decoupling-plan.md](./tiered-decoupling-plan.md) over the phase series.
