# Memory Optimization Current Status

Created: 2026-06-25

## Purpose

This document resets the current working baseline before more memory optimization work. The old investigation and cleanup notes have been moved to `docs/memory-optimization/history/`.

This is not a memory optimization plan yet. The immediate work was to finish the Node utility backend foundation so the memory work starts from a vendor-faithful architecture instead of a custom runtime packaging shape.

## Current Verdict

Buddy is now aligned with the vendor on the important process model and the backend artifact loading boundary:

```text
Electron main
  -> Electron utility process
  -> Node runtime
  -> prebuilt backend server artifact
```

Buddy now uses the same desktop loading shape as vendor:

```text
backend-utility.js
  -> import("virtual:buddy-server")
  -> Electron Vite resolves ../buddy/dist/node/node.js
  -> Electron Builder packages the built app output plus normal resources/native assets
```

The previous separate `resources/backend-node` runtime island is no longer used by active desktop code.

## Present Facts

- Vendor OpenCode still builds a Node-targeted server artifact with Bun at `vendor/opencode/packages/opencode/script/build-node.ts`.
- Vendor desktop wires that artifact into Electron Vite through `virtual:opencode-server` in `vendor/opencode/packages/desktop/electron.vite.config.ts`.
- Vendor utility process imports that virtual module in `vendor/opencode/packages/desktop/src/main/sidecar.ts`.
- Vendor desktop forks the utility process from `vendor/opencode/packages/desktop/src/main/server.ts`.
- Vendor Electron Builder also packages normal `resources/**/*` and `native/**/*` assets; the virtual-module server is not the only packaged content.
- Buddy builds a thin `backend-utility` entry in `packages/desktop-electron/electron.vite.config.ts`.
- Buddy wires `virtual:buddy-server` to `packages/buddy/dist/node/node.js`.
- Buddy utility imports `virtual:buddy-server` from `packages/desktop-electron/src/main/backend-utility.ts`.
- Buddy no longer points the utility at `resources/backend-node/node.js` through `BUDDY_BACKEND_NODE_ENTRY`.
- Buddy no longer packages `resources/backend-node` or its runtime `node_modules` through Electron Builder resources.
- Buddy copies required backend WASM assets plus the platform `@lydell/node-pty-*` and `@parcel/watcher-*` native packages into the Electron main output.
- Electron Builder explicitly unpacks the platform `@lydell/node-pty-*` and `@parcel/watcher-*` packages from ASAR so the native `pty.node` and file-watcher bindings can load in installables.
- Buddy's first-stage Node artifact external list is intentionally parallel to vendor: `jsonc-parser` and `@lydell/node-pty` only. Do not add CommonJS-heavy packages such as `@npmcli/*`, `node-gyp`, AWS SDK packages, or `pino` just to make the generated artifact path-pure.
- The historical Windows installable crash report records a missing runtime dependency under `resources/backend-node`. That exact desktop packaging failure mode should be gone because active desktop packaging no longer uses `resources/backend-node`.

## Non-Goals For This Spike

- Do not optimize provider loading, route loading, or steady-state memory yet.
- Do not reintroduce raw backend-source imports into Electron Vite.
- Do not patch vendored OpenCode source.
- Do not keep compatibility shims for old sidecar terminology unless production code still needs them.
- Do not make Buddy stricter than vendor on lazy npm/native-build dependency relocatability during this foundation pass.

## Implemented Shape

Buddy now uses the same artifact loading pattern as vendor:

```text
packages/buddy/script/build-node.ts
  -> packages/buddy/dist/node/node.js

packages/desktop-electron/electron.vite.config.ts
  -> virtual:buddy-server
  -> ../buddy/dist/node/node.js

packages/desktop-electron/src/main/backend-utility.ts
  -> await import("virtual:buddy-server")
  -> listen(...)
```

The goal is not to make Electron Vite compile raw Buddy backend source. The goal is to make Electron Vite consume the already-built Node artifact exactly at the utility process boundary, as vendor does.

## Completed Spike Checklist

- [x] Commit the current code-only artifact reliability fixes as a rollback point.
- [x] Add `virtual:buddy-server` to `packages/desktop-electron/electron.vite.config.ts`, modeled on vendor's `virtual:opencode-server`.
- [x] Change `packages/desktop-electron/src/main/backend-utility.ts` to import `virtual:buddy-server` instead of `BUDDY_BACKEND_NODE_ENTRY`.
- [x] Remove `BUDDY_BACKEND_NODE_ENTRY` from the desktop runtime environment.
- [x] Stop staging `packages/buddy/dist/node` into `packages/desktop-electron/resources/backend-node`.
- [x] Remove Electron Builder `backend-node` resource packaging and validation.
- [x] Preserve required runtime assets such as WASM files in the packaged utility output.
- [x] Keep the utility lifecycle behavior: ready/error/stopped messages, health polling, proxy/cert setup, SQLite probe, graceful stop, and process-tree kill fallback.
- [x] Run `bun run --cwd packages/buddy build:node`.
- [x] Run `bun run --cwd packages/buddy smoke:node`. This is now an artifact-shape check, not a standalone server smoke.
- [x] Run `bun run --cwd packages/desktop-electron build`.
- [x] Run `bun run --cwd packages/desktop-electron smoke:backend-utility`. This is the execution smoke for the real utility-process host.
- [x] Run `bun run --cwd packages/desktop-electron dev` and verify the app starts, health routes respond, and session/provider/message routes respond.
- [x] Run `bunx --bun electron-builder --mac --dir --publish never --config electron-builder.config.ts` and verify the native pty package is unpacked under `app.asar.unpacked`.
- [x] Run `bun lint`.
- [x] Run root `bun typecheck`.
- [x] Decide whether the spike works.

## Pass Criteria

The spike works on the current macOS development machine because all of these are true:

- Electron Vite does not bundle raw Buddy backend source.
- The backend utility imports the prebuilt Node artifact through `virtual:buddy-server`.
- No `resources/backend-node` runtime dependency island is required for desktop packaging.
- No artifact-local `dist/node/node_modules` runtime tree is created.
- No ordinary JavaScript runtime package tree is copied into `out/main`.
- Desktop dev starts successfully.
- The Electron utility smoke starts the real built utility process and reaches backend health.
- The Electron utility smoke runs from an isolated copy of `out/main` outside the monorepo with `NODE_PATH` cleared.
- The Electron utility smoke uses Electron-as-Node for native package probes, so Windows developer machines do not need standalone Node on `PATH`.
- The Electron utility smoke loads the selected platform `@lydell/node-pty-*` and `@parcel/watcher-*` native packages from that isolated `out/main` copy before server startup.
- Resource-pack/WASM paths still work from the built desktop output.
- A macOS directory package puts `@lydell/node-pty-*/prebuilds/*/pty.node` and the platform `@parcel/watcher-*` binding under `app.asar.unpacked`, not trapped inside `app.asar`.
- Lint and root typecheck pass.

## Remaining Release Proof

The release workflow now builds Electron output inside each target packaging job instead of reusing a Linux-built `out/main`. That matters because `virtual:buddy-server` makes the Electron main output target-native through the selected `@lydell/node-pty-*` and `@parcel/watcher-*` packages.

Before calling this production-ready for release, run the publish/package workflow on Windows. The architecture no longer has the `resources/backend-node` dependency island that caused the historical Windows crash report, but Windows still needs to prove the packaged native `@lydell/node-pty-win32-*` and `@parcel/watcher-win32-*` paths in a real installable.

## Vendor-Inherited Limits

Vendor's Bun-built Node artifact is not a perfectly relocatable npm/native-build runtime. Building the vendored server artifact with the vendored external list still leaves generated CommonJS details such as `require.resolve("node-gyp/bin/node-gyp.js")`, generated `__dirname` values from npm tooling packages, and other lazy fallback strings in the bundle.

Buddy should not try to "fix" that by externalizing and copying ordinary JavaScript dependency trees. That is the package-manager/runtime-island loop this reset is meant to avoid. For this foundation pass, those lazy npm/native-build paths are treated as vendor-inherited limitations unless a normal desktop route or startup path actually exercises them.

If Buddy later decides that desktop must support npm plugin installs that build native packages, that should be a deliberate product/build-system project. The options would be to disable/guard those flows, upstream a vendor fix, or design an explicit runtime dependency strategy. It should not be handled by adding packages one by one to Electron `out/main/node_modules`.

## Final Hybridness Scan

- Active code has no `BUDDY_BACKEND_NODE_ENTRY`, `resources/backend-node`, `validate-backend-node-artifact`, `spawnNodeArtifact`, or `syncBundledBackendNode` path.
- `packages/buddy/script/build-node.ts` does not run `bun install`, write an artifact-local package manifest, copy package islands, or create `dist/node/node_modules`.
- `packages/buddy/script/build-node.ts` keeps the vendor-parallel first-stage external list: `jsonc-parser` and `@lydell/node-pty`.
- `packages/desktop-electron/out/main/**/node_modules` is allowed to contain only the platform `@lydell/node-pty-*` and `@parcel/watcher-*` native packages.
- Electron Builder `asarUnpack` is allowed only for those platform `@lydell/node-pty-*` and `@parcel/watcher-*` native packages.
- The only package directory lookup in Electron Vite is `resolveNativePackageDirectory()` for those native package copies. It is not a dependency resolver and must not be extended to ordinary JavaScript packages.
- `packages/buddy/script/build-node.ts` uses `require.resolve("@chonkiejs/core")` only to locate the Chonkie WASM asset that must be copied beside the built server artifact.
- `packages/buddy/script/measure-node-memory.ts` intentionally fails until memory measurement is rebuilt against the Electron utility-process host. The old standalone Node artifact measurement target no longer exists.

## No-Hybrid Architecture Checklist

This is the checklist to follow if context is lost. Do not resume memory optimization until these are true.

- [x] `packages/buddy/dist/node/node.js` is treated as an Electron Vite input for desktop, not as a standalone relocatable Node app with a sibling runtime `node_modules` contract.
- [x] `packages/buddy/script/build-node.ts` is brought back toward the vendor contract: build the Node server artifact, but do not install or maintain an artifact-local runtime dependency tree.
- [x] Electron desktop does not package `resources/backend-node`.
- [x] Electron desktop does not copy a growing hand-maintained list of arbitrary runtime packages to `out/main/chunks/node_modules`.
- [x] Any copied desktop runtime file is one of these categories: native binding/package required by Electron utility runtime, WASM/data asset referenced by the bundled server, or normal desktop resource such as migrations/backend assets/knowledge graph.
- [x] `@lydell/node-pty-*` is allowed as a native package boundary because vendor also narrows `@lydell/node-pty` to the platform package in Electron Vite.
- [x] `@parcel/watcher-*` is allowed as a native package boundary because Buddy enables OpenCode's file watcher for Markdown/Monaco change detection, and vendor declares the platform watcher packages for desktop/core runtime use.
- [x] `node-gyp`, `pino`, `@npmcli/*`, and AWS packages are not first-stage externals and are not copied as permanent runtime packages. Generated lazy strings for vendor-inherited npm/native-build fallbacks are not blockers unless a supported desktop flow hits them.
- [x] The Electron utility smoke runs against an isolated copy of `out/main` outside the monorepo, with `NODE_PATH` cleared, so repo-root `node_modules` cannot hide missing packages.
- [x] The Electron utility smoke does not require standalone system Node for native package probes; it uses the repository Electron runtime with `ELECTRON_RUN_AS_NODE=1`.
- [x] The isolated smoke checks that the selected `@lydell/node-pty-*` and `@parcel/watcher-*` native packages resolve and load from the isolated Electron output.
- [x] The isolated `out/main` smoke exercises health, provider/auth metadata, resource-pack/WASM prep, and at least one session/message route.
- [x] macOS and Windows package jobs build Electron `out/main` on the target runner before packaging. No Linux-built `out/main` artifact is reused across OS/arch targets.
- [x] Build output is checked for packaged dependency islands under `out/main/**/node_modules`. The check allows only the platform `@lydell/node-pty-*` and `@parcel/watcher-*` native packages; it does not use regex string scanning over the bundled vendor graph because that flags generated strings and optional fallback code that are not actual copied runtime dependencies.
- [x] The final desktop architecture can be explained in one sentence: "Buddy follows vendor by building a Node server artifact and importing it into the Electron utility process through a Vite virtual module; only native/assets are copied alongside the built Electron output."

## Failure Rule

If fixing a missing module requires adding another ordinary JavaScript package to a manual copy list, stop. That means the implementation is drifting back into a package-manager/runtime-island architecture.

For this vendor-faithful foundation pass, the next step must be one of:

- Keep the vendor-parallel build shape and document the lazy path as a vendor-inherited limitation.
- Remove or guard the unsupported product flow that reaches the lazy path.
- Make an explicit future decision to support that flow with a real runtime dependency strategy.

Do not add `node-gyp`, `pino`, `@npmcli/*`, AWS SDK packages, or similar ordinary JavaScript packages to `out/main/node_modules` one at a time.
