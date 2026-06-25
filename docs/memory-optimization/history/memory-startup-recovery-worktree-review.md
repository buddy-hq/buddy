# Memory Startup Recovery Worktree Review

**Created:** Tue Jun 23 2026  
**Branch reviewed:** `memory-startup-recovery`  
**Decision:** Keep measurement/tooling documentation, discard the risky startup optimization code, and fix provider demand splitting first.

## What This Worktree Tried

This worktree kept the provider reimplementation work out of the branch and tried to preserve only non-provider startup/import optimizations.

The optimization changes reviewed were:

- Split `packages/buddy/src/opencode-runtime/env.ts` into a lighter `bootstrap-env.ts` imported by `packages/buddy/src/index.ts`, deferring the OpenCode global temp-path patch until the real runtime loads.
- Replaced eager top-level route imports in `packages/buddy/src/index.ts` with lazy Hono sub-app loading through `route.fetch()`.
- Added a cheap `/api/health` route that reports the Buddy HTTP sidecar as alive without loading the OpenCode runtime.
- Deferred `/doc` OpenAPI route generation and `hono-openapi` imports until `/doc` is requested.
- Lazily imported several `open-project-registry` dependencies so registry list/recovery paths avoid OpenCode project/config modules unless validation needs them.
- Narrowed `packages/buddy/src/http/directory.ts` from the `../project` barrel to `../project/directory`.
- Adjusted tests that had imported `buildOpenCodeConfigOverlay` from `src/index.ts`, because the lazy server entry stopped re-exporting it.

## Issues Found

The main regression was caused by lazy Hono sub-app dispatch. The wrapper called child `route.fetch()` directly, which bypassed the parent `app.onError` normalization path. Existing malformed JSON regressions started returning plain text `Malformed JSON in request body` instead of Buddy's JSON envelope:

```json
{ "error": "Invalid JSON body" }
```

Confirmed failing tests:

- `packages/buddy/test/session/route-regressions.test.ts`
- `packages/buddy/test/permission/routes.test.ts`

The provider memory problem also remained. The current worktree still returned the same large default provider payload and still settled above 500 MB working set after provider use. That means the startup optimizations improved passive health checks but did not solve the actual memory path users hit when provider bootstrap runs.

Provider bootstrap tests also exposed cold runtime timeouts under Bun's default 5 second test timeout. With a larger timeout the routes were functionally okay, but this reinforces that provider/runtime startup is still the heavy path.

## Probe Summary

Measurements were taken with the built Windows Node backend artifact and the reusable script added in `packages/buddy/script/measure-node-memory.ts`.
The script now defaults to the standard optimization probe shape: `/api/healthz`, `/api/health`, `/api/provider`, and `/api/provider/auth` over 2 cycles, with 2s settle time, 30s final settle time, 180s probe timeout, automatic cleanup, and a timestamped durable JSON output. Current memory optimization measurements are kept under `docs/memory-optimization/log/`.

Durable measurement files:

- [Main measurement](log/memory-main-measurement-current-script.json)
- [Current worktree measurement](log/memory-current-worktree-measurement.json)

### Main

| Point | Private | Working set |
|---|---:|---:|
| Ready after healthz poll | 469.6 MB | 295.0 MB |
| `/api/healthz` | 469.7 MB | 294.9 MB |
| `/api/health` | 553.2 MB | 358.7 MB |
| First `/api/provider` | 781.0 MB | 565.9 MB |
| Peak | 935.6 MB | 650.5 MB |
| Final after 30s settle | 858.4 MB | 574.0 MB |

### Current Worktree Before Cleanup

| Point | Private | Working set |
|---|---:|---:|
| Ready after healthz poll | 293.1 MB | 165.6 MB |
| `/api/healthz` | 286.3 MB | 159.1 MB |
| `/api/health` | 280.4 MB | 158.4 MB |
| First `/api/provider` | 828.0 MB | 531.0 MB |
| Peak | 916.6 MB | 641.1 MB |
| Final after 30s settle | 828.0 MB | 554.3 MB |

The current worktree improved passive health memory by roughly 136-200 MB working set compared with main, depending on whether `/api/healthz` or `/api/health` is compared. After provider use, however, the final settled working set improved only about 20 MB versus main. The default `/api/provider` response remained 3,896,029 bytes in both runs.

## Cleanup Decision

The startup changes are not worth carrying as a combined patch right now. The riskiest part, lazy Hono sub-app mounting, already regressed error handling. The remaining passive startup improvements do not solve the provider memory problem, which remains the dominant user-visible issue.

The branch should keep:

- memory investigation docs and measurement results;
- the reusable sidecar memory measurement script;
- non-memory tooling fixes such as Windows-safe theme audit paths and the site Astro check command.

The branch should discard:

- whole-Hono-app lazy route mounting;
- the `bootstrap-env.ts` startup split;
- lazy `/doc` route generation from the server entry;
- lazy `open-project-registry` imports;
- direct import narrowing done only for startup memory;
- tests that existed only to support those discarded server-entry changes.

Those optimization code changes have been removed from the worktree. The remaining branch changes are investigation docs/logs, the reusable memory measurement script, and unrelated tooling fixes.

Provider memory work should restart from demand splitting, preserving canonical OpenCode provider auth hooks, config/provider semantics, connected provider models, and ChatGPT account-scoped behavior.
