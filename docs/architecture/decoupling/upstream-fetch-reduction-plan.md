# Upstream Fetch Reduction Plan

This document tracks the follow-on work needed after the SDK/plugin
decoupling branch landed. The goal here is narrower than the original
migration:

1. keep the cleaner SDK/plugin runtime path
2. avoid vendored patches
3. reduce the Buddy-owned break surface during future `vendor/opencode`
   dry runs

This is ordered from lowest implementation risk to highest implementation
risk, excluding work that depends on upstream OpenCode adding hooks.

## Checkpoint

- Temp checkpoint commit on `decoupling`: `c7f1a3ac0` (`temp:working`)
- Execution log path `migration-review.log` was a decoupling-era artifact and is **not** in the tree; do not restore it from git as a living process.

## Ordered Backlog & Landed Shapes

- [x] **Stage 1: Replace direct internal LLM event dependency**
  - Target: `packages/opencode-adapter/src/llm.ts`
  - Landed shape: usage collection now keys off usage-bearing events instead
    of matching a specific terminal event tag
  - Risk class: hard logic, simple implementation

- [x] **Stage 2: Isolate vendor dependency install metadata from the Buddy root workspace**
  - Targets: root `package.json`, `bun.lock`, sync/build docs and scripts
  - Landed shape: pragmatic `vendor:sync-catalog` / `vendor:check-catalog`
    boundary instead of a full Bun workspace split
  - Main win: fewer manual root workspace edits during vendor dry runs
  - Risk class: easy but complicated

- [x] **Stage 3: Shrink or remove session service monkey patching**
  - Targets: `packages/opencode-adapter/src/session-live.ts`, `packages/opencode-adapter/src/session.ts`
  - Landed shape: wrapper-level canonicalization cache; no vendored
    `Session.Service` monkey patch remains
  - Main win: stop depending on internal `Session.Service` method layout
    for identity/cache behavior
  - Risk class: hard logic and complicated

- [x] **Stage 4: Move tool UI enrichment out of vendored runtime patches**
  - Targets: `packages/opencode-adapter/src/session-tool-ui.ts`, `packages/opencode-adapter/src/registry.ts`
  - Landed shape: tool UI presentation now reattaches on Buddy-owned
    session message responses and global SSE frames (`opencode-event-stream.ts`) instead of patching
    `Session.updatePart` and `LLM.stream`
  - Main win: remove `Session.updatePart` and `LLM.stream` tool UI patches
    while preserving the Buddy UI contract
  - Risk class: hard logic and complicated

- [x] **Stage 5: Collapse remaining local contract drift at the plugin and wrapper boundary**
  - Targets: `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts`, `packages/buddy/src/opencode-runtime/plugin-ask-compat.ts`, `packages/opencode-adapter/src/llm.ts`, `packages/opencode-adapter/src/session-live.ts`
  - Landed shape: plugin ask normalization now compiles across the Promise/Effect
    transition, LLM usage extraction is fully structural, session permission
    normalization accepts readonly arrays, and the skill visibility test no
    longer hand-builds an upstream agent shape
  - Main win: removes the last Buddy-owned dry-run typecheck failures that
    were still showing up against upstream `v1.15.10`
  - Risk class: hard logic, simple implementation

- [x] **Stage 6: Fix post-decoupling runtime/prompt regressions without reopening vendor coupling**
  - Targets: `packages/buddy/src/routes/local-runtimes.ts`, `packages/buddy/src/local-runtimes/runtime-session-refresh.ts`, `packages/buddy/src/learning/agent-execution/state/recompute-session-state.ts`, `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts`
  - Landed shape: local runtime install/remove now recomputes stored
    Buddy session runtime state and resyncs permissions immediately, and
    the prompt filter keeps externally configured absolute `AGENTS.md`
    blocks while still stripping `CLAUDE.md`/`CONTEXT.md`
  - Main win: removes the "send one more message" runtime-availability lag
    and restores prompt parity for shared external AGENTS files
  - Risk class: easy but complicated

## Out of Scope (Requires Upstream Hooks)

The following remain intentionally out of scope until upstream adds
hooks. They should not be forced into fragile local rewrites:

- child session / subagent spawn hook replacement
- skill visibility hook replacement

See [`packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md`](../../../packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md).

## Verification Bar After Each Stage

- targeted tests for the touched surface
- `bun lint`
- `bun typecheck`
- curl smoke on the local Buddy server for impacted routes
