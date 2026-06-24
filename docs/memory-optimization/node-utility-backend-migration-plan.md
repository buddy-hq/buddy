# Node Utility Backend Migration Plan

**Created:** Tue Jun 23 2026
**Purpose:** Move Buddy Desktop toward the vendored Electron backend process model without reimplementing provider, auth, model, or runtime semantics.

## Goal

Buddy Desktop should run its backend like the vendored OpenCode desktop app: as an Electron-managed utility backend process rather than as a standalone Bun-compiled executable. The important change is the backend process model, lifecycle, and runtime ownership. Node is the runtime because Electron utility processes are Node processes.

```text
Electron main
  -> utilityProcess.fork(...)
  -> Node-targeted Buddy backend utility module
  -> canonical Buddy/OpenCode backend behavior
```

The migration must preserve existing backend routes, auth, provider behavior, model behavior, runtime directories, health checks, migration progress reporting, logs, and shutdown behavior. A successful macOS utility-process migration is the first proof point; Windows memory validation comes after the process model works locally.

## Non-Goals

- Do not patch `vendor`.
- Do not add another provider/auth/model implementation in Buddy or the adapter.
- Do not use metadata scanners or hand-maintained auth maps as the fix.
- Do not change product behavior to match an unadopted OpenCode v2 provider UI path.
- Do not keep a Bun-compiled backend process or fallback in the desktop launch path.
- Do not keep a Bun-specific SQLite/runtime branch for the desktop backend.
- Do not keep `bun build` as a backend packaging prerequisite for Electron.

## Implementation Shape

1. Add a Node-compatible backend serve entrypoint that serves the existing Hono app through `@hono/node-server`.
2. Replace Bun-only response/process helpers in backend runtime code with Node-compatible helpers.
3. Add a desktop `utilityProcess.fork(...)` backend module modeled after the vendor Electron utility process pattern.
4. Add a desktop spawn path modeled after `vendor/opencode/packages/desktop/src/main/server.ts`, including ready/error/stopped messages, stdout/stderr piping, child-process-gone logging, health polling, and graceful stop fallback.
5. Build the desktop main bundle with `backend-utility` as an additional Electron main input, mirroring the vendor Rollup input pattern.
6. Remove the desktop launch, dev, and release dependency on the Bun-compiled backend artifact.
7. Verify with typecheck, lint, backend tests, desktop tests, and a smoke run where possible.

## Local Verification Plan

First prove the process-model migration on macOS:

- Electron desktop can launch the utility backend.
- `/api/healthz` and `/api/health` pass through the desktop auth path.
- Canonical provider/auth/model routes still work without Buddy-owned provider shims.
- SQLite-backed routes do not fail under Node.
- Shutdown and relaunch do not leave orphan utility processes.
- Lint, typecheck, and package tests pass.

## Windows Measurement Plan

After the utility path works on macOS, measure on Windows using the existing memory script shape or a utility-process equivalent:

- startup and `/api/healthz`
- `/api/provider`
- `/api/provider/auth`
- model-picker equivalent
- repeated request loop
- 30 second and 2 minute settle

The comparison must be against the same canonical provider/runtime behavior, not against hand-rolled provider shortcuts.
