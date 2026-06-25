# Memory Optimization Branch Exit

Created: 2026-06-26

## Branch Verdict

This branch should close as the Node utility backend foundation branch, not as
the final memory optimization branch.

The important win is architectural. Buddy moved from a Bun-compiled desktop
backend sidecar to an Electron utility-process Node backend that follows the
vendored OpenCode desktop loading shape:

```text
Electron main
  -> Electron utility process
  -> backend-utility.js
  -> import("virtual:buddy-server")
  -> packages/buddy/dist/node/node.js
```

The Windows memory improvement measured at the end of this branch comes from
that runtime/process architecture shift. The provider demand split and route
import optimizations described in the historical investigation docs are not
implemented in this branch.

## What Shipped In This Branch

- Removed the Bun-compiled desktop sidecar launch path.
- Added a Node backend artifact for desktop utility-process hosting.
- Wired Electron Vite to consume that artifact through `virtual:buddy-server`,
  matching the vendor's `virtual:opencode-server` shape.
- Removed the separate `resources/backend-node` runtime island from active
  desktop packaging.
- Avoided an artifact-local runtime `node_modules` tree.
- Kept the first-stage backend artifact external list vendor-parallel:
  `jsonc-parser` and `@lydell/node-pty`.
- Copied only native/assets beside Electron output:
  platform `@lydell/node-pty-*`, platform `@parcel/watcher-*`, and required
  WASM/data assets.
- Added isolated Electron utility smoke coverage that runs from outside the
  monorepo and clears `NODE_PATH`.
- Added Windows utility-process memory measurement scripts and logs.
- Hardened backend utility startup and shutdown lifecycle around ready/error,
  health polling, `node:sqlite` probing, graceful stop, and process-tree
  fallback.

## What Did Not Ship

- No provider demand split is active in code.
- No `models=usable` provider API split is active.
- No lightweight provider catalog implementation is active.
- No OpenCode adapter `ProviderCatalog` implementation is active.
- No route graph or lazy Hono route optimization is active.
- No route error-normalization change is active.
- No ordinary JavaScript dependency tree is copied into Electron output.

The historical provider and startup documents are investigation and planning
artifacts. They explain possible next work, not what this branch currently
ships.

## Corrected Timeline

### June 22-23: Initial Memory Investigation

The original Windows backend baseline was too high:

| Probe | Private | Working set |
|---|---:|---:|
| Old compiled sidecar peak | 935.6 MB | 650.5 MB |
| Old compiled sidecar final settle | 858.4 MB | 574.0 MB |

The first suspected culprit was provider/model loading. The investigation found
that `/api/provider` returned the full provider/model catalog, including about
145 providers and 5k+ model objects in a multi-megabyte response.

### June 23: Provider Optimization Exploration

Provider demand splitting was investigated and measured. The measurements
showed that shrinking the default provider response could remove the largest
provider ratchet.

That implementation direction was not accepted as the branch endpoint because
it risked duplicating vendor provider/auth/config semantics in Buddy. The
recovery plan recorded the correct principle: provider optimizations must
preserve vendor behavior and must not become a parallel provider runtime.

### June 23: Startup And Import False Start

A startup/import optimization pass tried lazy Hono sub-app dispatch and route
graph splitting. It improved passive health memory but broke Buddy's malformed
JSON error normalization contract.

That path was discarded. Future route-loading work must preserve the existing
error envelope:

```json
{ "error": "Invalid JSON body" }
```

### June 23-24: Process Model Hypothesis

After provider exploration, the remaining memory floor still looked strongly
related to the Bun-compiled sidecar process model. The branch pivoted to
matching the vendor desktop process model:

```text
Electron main
  -> utilityProcess.fork(...)
  -> Node runtime
  -> backend artifact
```

### June 24: First Node Utility Attempt

The first Node utility architecture worked, but it packaged a separate
`resources/backend-node` artifact with runtime `node_modules`.

That led to real packaging failures, including a Windows installable missing
`jsonc-parser` under `resources/backend-node/node_modules`.

Fixing those failures by adding copied runtime packages started pushing the
branch toward a custom package-manager/runtime-island architecture.

### June 25: Vendor-Parallel Architecture Reset

The branch was reset to the vendor-parallel shape:

- Electron utility imports `virtual:buddy-server`.
- Electron Vite resolves the already-built Buddy Node artifact.
- Electron Builder packages built Electron output plus normal resources and
  native/assets.
- `resources/backend-node` is not used.
- `dist/node/node_modules` is not created.
- `out/main/**/node_modules` is limited to native packages only.

This is the architectural foundation this branch should merge.

### June 26: Windows Utility Measurements

Windows memory measurements from the Electron utility path:

| Mode | Peak private | Final private | Peak working set | Final working set |
|---|---:|---:|---:|---:|
| `healthz-only` | 193.5 MB | 154.5 MB | 191.2 MB | 153.9 MB |
| `standard` | 271.4 MB | 190.5 MB | 271.3 MB | 192.2 MB |
| `safe-read-matrix` | 401.8 MB | 175.5 MB | 403.1 MB | 180.4 MB |

Compared with the old compiled sidecar final settle of about `574.0 MB`
working set, the architecture shift alone is a major improvement.

## Merge Recommendation

Merge this branch after final lifecycle and verification fixes are committed.

Do not keep this branch open for provider or route memory optimizations. The
branch already delivers the important foundation change, and users should get
the current Windows memory improvement while the remaining optimizations are
planned and implemented separately.

## Next Optimization Map

The next branch should start from the Electron utility-process measurement
scripts and use the new architecture as the baseline.

Candidate work:

1. Provider demand split, but only with vendor-faithful semantics.
2. Route/import graph splitting, preserving Buddy error normalization.
3. Investigate the `safe-read-matrix` peak around `403 MB`.
4. Rebuild memory guardrails around Electron utility measurements, not the old
   standalone sidecar measurement target.
5. Add Windows release/package smoke thresholds once the new baseline is stable.
6. Decide explicitly whether npm/native plugin install support needs a real
   runtime dependency strategy, rather than adding ordinary JS packages to
   Electron output one at a time.

## Exit Principle

This branch proves that the process/runtime foundation was a first-order memory
problem. The next memory work should optimize on top of that foundation, not
reopen the backend packaging architecture.
