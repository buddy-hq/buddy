# ADR: Electron Utility Process Backend Architecture

Status: Accepted
Date: 2026-06-26
Deciders: Buddy Desktop Architecture

**Canonical current desktop backend packaging and process-model decision.**

## Context

Buddy's desktop application initially ran the backend as a standalone Bun-compiled sidecar binary. On Windows, this architecture exhibited high baseline memory consumption:
- Idle / settle memory: ~574–858 MB working set.
- Peak memory during startup and model loading: ~935 MB private working set.

Explorations into provider catalog demand splitting and lazy Hono route loading were investigated, but rejected to avoid duplicating vendor provider logic and breaking Buddy's standardized JSON error responses (`{ "error": "Invalid JSON body" }`).

## Decision

Migrate the desktop backend from a Bun-compiled sidecar to an Electron Node utility process matching vendored OpenCode's desktop hosting pattern:

```text
Electron main
  -> utilityProcess.fork(...)
  -> backend-utility.js
  -> import("virtual:buddy-server")
  -> packages/buddy/dist/node/node.js
```

## Architecture & Packaging Contracts

1. **Virtual module resolution:** Electron Vite resolves `virtual:buddy-server` directly to the compiled Node backend bundle (`packages/buddy/dist/node/node.js`).
2. **No runtime package islands:** Removed the isolated `resources/backend-node` packaging structure and avoided creating local runtime `node_modules` trees in `dist/node/`.
3. **The Failure Rule:** If fixing a missing module requires adding another ordinary JavaScript package to a manual copy list in Electron output, **stop**. That indicates architectural drift back to a runtime island.
4. **Native dependency bundling:** Only platform-specific native binaries and WASM assets are copied adjacent to Electron output:
   - `@lydell/node-pty` (platform binaries)
   - `@parcel/watcher` (platform binaries)
   - SQLite native bindings (`node:sqlite`)
   - Chonkie WASM asset (`chonkiejs_chunk_bg.wasm`)
5. **Lifecycle management:** Main process manages the utility process via structured IPC, health probing, graceful SIGTERM / SIGINT shutdown, `server.closeAllConnections()` force-close, and Windows process-tree (`tree-kill`) fallback termination.
6. **Node `child.killed` vs `close`:** In Node, `child.killed` becomes true as soon as `kill()` successfully **sends** a signal, not when the process exits. Grace-timer force-kill must track the `close` event (or equivalent) separately. Checking `child.killed` before `SIGKILL` can leave stuck children (seen on git fetch in `github-fetcher.ts`). macOS smoke/CLI entrypoint detection must compare **realpaths**: `/var` and `/private/var` can be the same file with different strings.
7. **Isolated smoke test contract:** Backend utility smoke tests must run against an isolated copy of `out/main` outside the repository with `NODE_PATH` cleared, using `ELECTRON_RUN_AS_NODE=1` for native probes.
8. **Target-native `out/main`:** macOS and Windows package jobs must **build Electron `out/main` on the target runner** before packaging. Do not reuse a Linux-built `out/main` across OS/arch targets (`virtual:buddy-server` selects platform `@lydell/node-pty-*` and `@parcel/watcher-*`).
9. **Vendor-inherited lazy strings:** Generated CommonJS fallback strings (`node-gyp`, `pino`, `@npmcli/*`, AWS SDK) in the Bun-built artifact are **not** a reason to copy ordinary JavaScript packages into `out/main/node_modules`. Treat them as vendor-inherited limits unless a supported desktop flow actually hits them. If a missing module would require adding another ordinary JS package to a manual copy list, apply the Failure Rule and stop.

## What Did NOT Ship (Negative Catalog)

To avoid false assumptions about current code capabilities:
- **No provider demand split** is active in code.
- **No `models=usable` API split** is active.
- **No lightweight provider catalog** implementation is active.
- **No route graph or lazy Hono route optimization** is active (lazy Hono sub-app dispatch was rejected because it broke Buddy's `{ "error": "Invalid JSON body" }` error envelope).
- **No ordinary JavaScript dependency trees** are copied into Electron output.

## Results & Verification

Windows memory measurements after migrating to the Electron utility process:

| Mode | Peak Working Set | Final Settled Working Set |
|---|---:|---:|
| `healthz-only` | ~191.2 MB | ~153.9 MB |
| `standard` | ~271.3 MB | ~192.2 MB |
| `safe-read-matrix` | ~403.1 MB | ~180.4 MB |

Settled working set dropped by ~65% (from ~574 MB to ~192 MB) purely from the runtime process architecture shift, establishing a clean foundation for future desktop memory optimizations.

## Next Optimization Map

Candidate work **on top of** this foundation (not a reason to reopen packaging islands):

1. Provider demand split preserving vendor-faithful semantics (`models=usable`).
2. Route/import graph splitting that preserves Buddy's `{ "error": "Invalid JSON body" }` error normalization.
3. Investigate the `safe-read-matrix` peak around ~403 MB.
4. Rebuild memory guardrails around Electron utility measurements rather than the old sidecar target.
5. Add Windows release/package smoke thresholds once the new baseline is stable.
6. Decide explicitly whether npm/native plugin install support needs a real runtime dependency strategy, rather than adding ordinary JS packages to Electron output one at a time.

Dated foundation notes: [current-status.md](../../memory-optimization/current-status.md), [exit-branch.md](../../memory-optimization/exit-branch.md).
