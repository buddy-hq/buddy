# OpenCode SDK Adoption Assessment and Migration Guide

Date: 2026-02-26  
Scope: Buddy architecture decision on `vendor` subtree + adapter vs OpenCode JS SDK + plugins/tools/agents.

## Executive Summary

You can achieve most of Buddy's planned roadmap using the OpenCode JS SDK and official extension surfaces (plugins/tools/agents), while keeping Buddy as its own standalone app.

The primary architectural change is:
- from direct, in-process imports of OpenCode internals (`ToolRegistry.register`, adapter exports)
- to process/API boundaries through SDK + config/plugin loading

This improves long-term stability against upstream internal churn, at the cost of less direct internal control.

Recommended direction: **incremental hybrid migration (strangler pattern)**, not hard replacement.

## What We Verified About the SDK

## 1) SDK is a typed client + server launcher, not embedded runtime internals

`createOpencodeServer()` starts `opencode` via process spawn and passes inline config through env:
- `vendor/opencode/packages/sdk/js/src/server.ts`

`createOpencodeClient()` is a typed HTTP client over OpenCode API:
- `vendor/opencode/packages/sdk/js/src/client.ts`
- `vendor/opencode/packages/sdk/js/src/gen/sdk.gen.ts`

Implication:
- SDK route means OpenCode runs as a separate process boundary.
- You are no longer depending on direct internal module imports for core behavior.

## 2) Directory-scoped file access works in SDK mode

The SDK client supports `directory` and sets `x-opencode-directory`.
- `vendor/opencode/packages/sdk/js/src/client.ts`

Server resolves request instance from that header.
- `vendor/opencode/packages/opencode/src/server/server.ts`

Built-in tools (`read`, `list`, etc.) resolve paths relative to that instance directory and enforce permission/boundary checks.
- `vendor/opencode/packages/opencode/src/tool/read.ts`
- `vendor/opencode/packages/opencode/src/tool/ls.ts`

Implication:
- Buddy can still read Buddy project files with SDK path.

## 3) Custom tools and plugins are first-class in OpenCode

OpenCode loads tools from tool directories and plugin hooks:
- `vendor/opencode/packages/opencode/src/tool/registry.ts`
- `vendor/opencode/packages/plugin/src/index.ts`
- `vendor/opencode/packages/plugin/src/tool.ts`

It loads local plugin/agent/tool directories from config search paths.
- `vendor/opencode/packages/opencode/src/config/config.ts`

Implication:
- Curriculum/memory/custom tools can be implemented via plugin/tool contracts instead of private registry imports.

## 4) Sub-agents are supported via config + prompt selection

Agent config supports `mode: "subagent" | "primary" | "all"`.
- `vendor/opencode/packages/sdk/js/src/gen/types.gen.ts`

`session.prompt` supports agent selection.
- `vendor/opencode/packages/sdk/js/src/gen/types.gen.ts`

Implication:
- Multi-agent roadmap remains feasible on SDK route.

## 5) You can avoid relying only on `.opencode` in user repos

OpenCode supports `OPENCODE_CONFIG_DIR` and scans that as config/tool/plugin/agent source.
- `vendor/opencode/packages/opencode/src/config/config.ts`

Implication:
- You can ship Buddy-managed extension directories inside your app/workspace and point OpenCode there.
- You do not need to force users to manually manage `.opencode` for core Buddy behavior.

## What This Means for Current Buddy Code

Current Buddy pattern (example):
- `packages/buddy/src/opencode/curriculum-tools.ts` registers tools by calling `ToolRegistry.register(...)` from adapter exports.
- `packages/opencode-adapter/src/registry.ts` re-exports private vendored internals.

This is high-control but coupled to internals.

SDK/Plugin pattern would shift to:
- define tools as plugin/tool modules (`@opencode-ai/plugin`)
- configure and load via `plugin`/`tools` dirs + config
- call OpenCode over SDK API for sessions/messages/events

## Capability Comparison (for Buddy goals)

| Capability | Subtree + private imports | SDK + plugins/tools/agents |
| --- | --- | --- |
| Core loop stability from upstream | High, but merge-heavy | High, with cleaner upgrade boundary |
| Direct internal hooks (`ToolRegistry.register` in-process) | Yes | No (use extension APIs) |
| Custom tools | Yes | Yes |
| Sub-agents | Yes | Yes |
| File read/list/find in project | Yes | Yes |
| Compatibility API facade (`/api/*`) | Yes | Yes (Buddy keeps facade) |
| Upgrade friction | Higher (internal churn) | Lower (public API contracts) |
| Debugging internals | Easier (same process) | Slightly harder (process boundary) |

## Storage / Database Model in SDK Route

You can keep dual DBs. SDK migration does not force DB unification.

Current paths:
- Buddy DB: `buddy.db`  
  `packages/buddy/src/storage/db.ts`
- OpenCode DB: `opencode.db`  
  `vendor/opencode/packages/opencode/src/storage/db.ts`

Recommended ownership split:
- `opencode.db`: runtime/session/message/tool execution internals
- `buddy.db`: Buddy product domain (memory engine metadata, curriculum/product indices, analytics, app-level feature state)

This separation is healthy and aligns with your stability goal.

## Key Risks in Migration

## R1: Feature gaps where Buddy currently uses private internals
Example: direct runtime tool registration in code path today.

Mitigation:
- port each private hook to plugin/tool contracts first
- keep fallback path until parity proven

## R2: Process boundary operational complexity
SDK path introduces lifecycle management for OpenCode process.

Mitigation:
- explicit startup/health checks
- bounded retries + clear shutdown behavior
- runtime wrapper abstraction in Buddy

## R3: Version skew between SDK package and OpenCode runtime binary

Mitigation:
- pin compatible versions
- add startup compatibility check (health/version gate)

## R4: Migration regressions in permissions/tool behavior

Mitigation:
- contract tests on tool calls, permissions, directory scoping
- parallel run comparison during rollout

## R5: Over-scoping migration with product work

Mitigation:
- migrate runtime seams first
- keep memory/curriculum feature development moving in parallel on new extension surface

## Migration Path Options

## Path A: Stay on subtree + adapter (status quo)
Pros:
- Maximum direct internal control
- No migration effort now

Cons:
- Ongoing internal churn management
- Higher long-term maintenance drag

## Path B: Hard switch to SDK immediately
Pros:
- Fastest to simplify boundary

Cons:
- Highest regression risk
- Violates safe rollout preference

## Path C: Hybrid strangler (recommended)
Pros:
- Low-risk
- Enables gradual confidence building
- Matches "build new first, then swap, then delete old"

Cons:
- Temporary dual-path complexity

## Recommended Migration Plan (Build First, Swap Later)

This plan explicitly avoids deleting old code first.

## Phase 0: Baseline and safety rails
1. Freeze a parity checklist of current required behaviors (session flow, curriculum tools, memory targets, directory scoping, permissions).
2. Ensure gates are green and repeatable (`typecheck`, contracts, integration tests).
3. Add runtime feature flag, e.g. `BUDDY_RUNTIME=adapter|sdk`.

## Phase 1: Runtime abstraction seam
1. Introduce a Buddy runtime interface (session create/prompt/abort/events/tool integration hooks).
2. Keep current adapter implementation as default.
3. Add SDK implementation behind same interface (not default yet).

## Phase 2: SDK process bootstrap
1. Start OpenCode via SDK launcher.
2. Add health checks and graceful shutdown.
3. Route non-critical flows through SDK in dev/staging mode.

## Phase 3: Port Buddy custom tools to plugin/tool contracts
1. Move curriculum tools into plugin/tool modules.
2. Add memory tools in same plugin/tool system (`memory_read`, `memory_write`).
3. Load via Buddy-managed config dir (`OPENCODE_CONFIG_DIR`), not manual user `.opencode` setup.

## Phase 4: Agent/sub-agent migration
1. Move Buddy-specific agent definitions to managed agent config files.
2. Wire sub-agent invocation through SDK prompt agent selection.
3. Keep old adapter path as fallback.

## Phase 5: Shadow traffic / parity verification
1. Run controlled sessions through both runtimes.
2. Compare critical outputs/events/tool behavior.
3. Fix mismatches until parity threshold is met.

## Phase 6: Cutover
1. Flip default runtime to SDK.
2. Keep adapter path available for rollback during soak period.
3. Monitor errors, permission diffs, memory behavior.

## Phase 7: Cleanup (only after stability window)
1. Remove dead adapter-only integration paths.
2. Minimize vendored internal import surface.
3. Keep only what is required for guardrails/reference.

## Suggested Exit Criteria for Final Cleanup

1. All critical parity checks green for at least one stable cycle.
2. No blocker regressions in curriculum/memory/sub-agent workflows.
3. Upgrade test (new OpenCode version) succeeds without private import breakage.
4. Rollback path no longer needed based on observed stability.

## Practical Recommendation for Your Current Roadmap

Given your next work (memory system + more tools + more sub-agents):
- Continue shipping features, but target **plugin/tool/agent extension surfaces now**.
- Keep Buddy DB + OpenCode DB split.
- Use SDK boundary progressively through a feature flag.
- Do not hard migrate; complete cutover only after parity and soak.

This gets you both:
- OpenCode backend stability
- rapid Buddy-specific product iteration on top.
