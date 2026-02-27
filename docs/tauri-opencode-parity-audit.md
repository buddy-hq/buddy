# Tauri / Vendored OpenCode Parity Audit

## Scope

This audit covers the current uncommitted worktree changes that shape the new desktop/Tauri flow:

- `packages/desktop/**`
- `packages/web/**` changes that make the web app embeddable inside the desktop shell
- `packages/buddy/**` changes that make the backend run as a desktop sidecar
- `packages/opencode-adapter/**` changes that bridge back into vendored OpenCode
- the explicit vendored patch in `vendor/opencode/packages/opencode/src/storage/db.ts`

`bun.lock` and package churn were only considered where they materially affect architecture.

## Parity Scale

- `5/5`: direct reuse or near-identical vendor patch
- `4/5`: same boundary and lifecycle, adapted to Buddy's stack
- `3/5`: same product goal, but re-composed significantly
- `2/5`: partial port with major simplification or ownership shift
- `1/5`: Buddy-specific behavior with only loose conceptual overlap
- `0/5`: no practical parity

## System-Level View

- The largest change is a new `packages/desktop` Tauri shell that keeps the vendor's "native shell + local sidecar + webview" shape, but swaps the vendored Solid desktop app for a thin React host around `@buddy/web`.
- The web app has been refactored into an embeddable runtime with injected `platform` and `server` contexts so the same UI can run in browser mode or in the Tauri shell.
- The Buddy backend now owns more of the desktop contract than vendored OpenCode does: it adds sidecar Basic Auth, project registry endpoints, and bundled migration directory wiring.
- The strongest parity is where Buddy still calls straight into vendored OpenCode instead of re-implementing it: `Project.fromDirectory(...)` and the mirrored migration-dir patch in the vendored DB layer.
- The biggest structural deviation is ownership: vendored OpenCode keeps server/project state in the desktop client context; Buddy moves recent-project persistence to backend endpoints under `/api/project`.
- The desktop surface is intentionally smaller than vendor OpenCode right now: `packages/desktop/src` is 5 top-level files versus 9 in `vendor/opencode/packages/desktop/src`, and `packages/desktop/src-tauri/src` is 3 Rust files versus 11 in the vendored package.

## Blast-Radius Audit

### 1. Desktop shell keeps the same high-level shape, but the runtime is now a Buddy-specific launcher

- `Rank`: `R1`
- `Parity`: `2/5`
- `Primary evidence`:
  - `packages/desktop/src/index.tsx:1-54`
  - `packages/desktop/src-tauri/src/lib.rs:112-230`
  - `vendor/opencode/packages/desktop/src/index.tsx:1-220`
- `Where parity exists`:
  - The shell still uses Tauri to bootstrap a local sidecar, wait for readiness, and then render a web UI into a single main window.
  - Native markdown parsing is still exposed to the UI via a Tauri command.
  - Store-backed local persistence, native notifications, directory picking, and a fetch override are still present.
- `Where it deviates`:
  - Vendored OpenCode mounts `@opencode-ai/app` directly; Buddy mounts `@buddy/web` through a custom React host.
  - Vendored desktop startup is multi-phase and feature-rich; Buddy startup is a minimal `await_initialization` call that returns connection info and then renders the app.
  - The vendored desktop app's surrounding behaviors are absent: deep-link intake, update flow, splash/loading orchestration, menu integration, WSL helpers, richer titlebar/window integration, and multi-surface desktop commands.
- `Impact`:
  - This is no longer a thin port of the vendored desktop package. It is a Buddy-owned desktop launcher that reuses only selected vendor ideas.

### 2. The web app now mirrors the vendor's runtime-injection pattern, but on a reduced API surface

- `Rank`: `R1`
- `Parity`: `4/5` for the embedding pattern, `2/5` for the API surface
- `Primary evidence`:
  - `packages/web/src/app.tsx:1-38`
  - `packages/web/src/main.tsx:1-28`
  - `packages/web/src/context/platform.tsx:9-98`
  - `packages/web/src/context/server.tsx:3-59`
  - `vendor/opencode/packages/app/src/context/platform.tsx:11-98`
  - `vendor/opencode/packages/app/src/context/server.tsx:36-280`
- `Where parity exists`:
  - Buddy now has explicit runtime injection points for platform capabilities and server connection data, which is the same architectural seam vendored OpenCode uses.
  - `@buddy/web` is now exported as an embeddable app package, similar in intent to vendored `@opencode-ai/app`.
  - Persistent Zustand storage now flows through `createPlatformJsonStorage(...)`, which is the same cross-runtime idea as the vendor's platform-backed storage abstraction.
- `Where it deviates`:
  - Buddy's `Platform` contract is intentionally narrower. It omits vendor capabilities such as `openPath`, file save/open variants, update hooks, default server URL persistence, WSL/display-backend controls, clipboard image access, and editor detection.
  - Buddy's `ServerConnection` model collapses to one normalized connection (`url`, auth, `isSidecar`). Vendored OpenCode models HTTP, sidecar, WSL sidecar, and SSH targets, plus active-server health and per-server project registries.
  - Browser mode in Buddy defaults to same-origin relative APIs instead of the vendor's explicit default-server selection workflow.
- `Impact`:
  - The composition pattern tracks the vendor well.
  - The surface area does not. Future vendor desktop features will not drop in without re-expanding Buddy's runtime contracts.

### 3. Project ownership moved from client-side desktop state into the Buddy backend

- `Rank`: `R1`
- `Parity`: `2/5`
- `Primary evidence`:
  - `packages/buddy/src/index.ts:79-139`
  - `packages/buddy/src/index.ts:596-628`
  - `packages/web/src/state/chat-actions.ts:29-76`
  - `packages/web/src/state/chat-store.ts:17-56`
  - `vendor/opencode/packages/app/src/context/server.tsx:24-29`
  - `vendor/opencode/packages/app/src/context/server.tsx:197-279`
- `Where parity exists`:
  - Buddy still validates project directories against the vendored runtime by calling `OpenCodeProject.fromDirectory(...)` before persisting/opening a project.
  - The UI still treats projects as a first-class desktop concept and preloads session state around them.
- `Where it deviates`:
  - Vendored OpenCode stores project lists inside client-side server context, keyed by active server.
  - Buddy persists recent projects in `desktop-notebooks.json` under Buddy state and exposes them via `/api/project`.
  - That means project state is now a backend-owned contract rather than a desktop-client concern.
- `Impact`:
  - This is a real architecture fork, not just a UI port difference.
  - It changes lifecycle, persistence semantics, and how multiple clients or future remote-server modes would behave.

### 4. Desktop transport/auth is adapted for a local authenticated sidecar, not for vendor's richer server model

- `Rank`: `R1`
- `Parity`: `3/5`
- `Primary evidence`:
  - `packages/buddy/src/index.ts:124-139`
  - `packages/desktop/src/server.ts:3-18`
  - `packages/web/src/lib/api-client.ts:23-112`
  - `packages/web/src/state/chat-sync.ts:84-241`
- `Where parity exists`:
  - The desktop app still talks to a local HTTP server and still consumes the OpenCode-style event stream.
  - The transport layer is still abstracted behind runtime-injected `fetch`.
- `Where it deviates`:
  - Buddy sidecar startup generates runtime credentials and protects the whole API with Basic Auth when desktop mode is active.
  - Because `EventSource` cannot send custom auth headers, Buddy adds a manual fetch-based SSE client for desktop/authenticated connections.
  - This is more bespoke than the vendor's broader server-management layer.
- `Impact`:
  - The desktop/server handshake is now strongly Buddy-specific.
  - This is a justified deviation, but it is a maintenance hotspot because the SSE parsing logic is now owned locally.

### 5. Migration bundling is a high-parity vendor patch and is the cleanest part of the desktop port

- `Rank`: `R1`
- `Parity`: `5/5`
- `Primary evidence`:
  - `packages/buddy/src/storage/db.ts:13-29`
  - `packages/buddy/src/storage/db.ts:83-91`
  - `vendor/opencode/packages/opencode/src/storage/db.ts:72-103`
  - `packages/desktop/scripts/predev.ts:9-43`
  - `packages/desktop/src-tauri/tauri.conf.json:25-35`
- `Where parity exists`:
  - Buddy's DB loader now accepts `BUDDY_MIGRATION_DIR` in the same way vendored OpenCode now accepts `OPENCODE_MIGRATION_DIR`.
  - The desktop predev step copies both Buddy and vendored OpenCode migrations into the Tauri resources bundle, and the Tauri config explicitly ships those resources.
  - This preserves the vendor model of running the real vendored runtime with its own schema instead of re-implementing it.
- `Where it deviates`:
  - The vendored file under `vendor/opencode/...` is patched directly, so this is an intentional subtree-drift point that must be carried forward on the next vendor sync.
- `Impact`:
  - This is the most principled part of the port and aligns with the "execute vendored OpenCode core" guardrail.

### 6. The native platform layer is a selective port, not a complete port

- `Rank`: `R2`
- `Parity`: `3/5`
- `Primary evidence`:
  - `packages/desktop/src/platform.ts:19-230`
  - `vendor/opencode/packages/desktop/src/index.tsx:62-220`
  - `packages/desktop/src-tauri/capabilities/default.json:6-24`
- `Where parity exists`:
  - Storage debouncing, directory picker behavior, shell open, notifications, restart, and native markdown all map closely to the vendor's desktop behavior.
  - Capability permissions were cut down to only the plugins Buddy currently exercises.
- `Where it deviates`:
  - The vendor desktop platform supports more native affordances than Buddy currently exposes.
  - Buddy removed support for file pickers beyond directories, app/path opening, updater hooks, deep links, clipboard image reads, and WSL path conversion.
  - The TypeScript package still lists several vendor-era Tauri JS plugins (`clipboard-manager`, `deep-link`, `opener`, `updater`) that are no longer wired into the actual runtime, so the dependency graph currently signals more parity than the code provides.
- `Impact`:
  - This is a good minimal port if the goal is "desktop shell for the existing Buddy web app."
  - It is not a full desktop parity port yet.

### 7. Desktop Rust/Tauri has been intentionally collapsed to the minimum viable shell

- `Rank`: `R2`
- `Parity`: `1/5`
- `Primary evidence`:
  - `packages/desktop/src-tauri/Cargo.toml:14-28`
  - `packages/desktop/src-tauri/src/lib.rs:1-230`
  - `packages/desktop/src-tauri/tauri.conf.json:13-35`
- `Where parity exists`:
  - Tauri still owns the window, bundled sidecar, resource packaging, plugin registration, and native command bridge.
- `Where it deviates`:
  - The vendored Rust crate includes a much larger platform layer: CLI sync, logging, OS-specific window customizers, single-instance handling, deep-link wiring, updater support, Linux/macOS/windowing integration, and a richer command surface.
  - Buddy's Rust layer is only a launcher plus markdown parser.
  - The Cargo manifest and Tauri bundle config were reduced accordingly.
- `Impact`:
  - This is the clearest signal that the current implementation prioritizes a stable Buddy shell over close desktop parity with vendored OpenCode.

### 8. Remaining web/UI diffs are mostly Buddy-owned product behavior, not vendor-parity work

- `Rank`: `R3`
- `Parity`: `1/5`
- `Primary evidence`:
  - `packages/web/src/components/layout/chat-left-sidebar.tsx`
  - `packages/web/src/routes/chat.tsx`
  - `packages/web/src/routes/$directory.chat.tsx`
  - `packages/web/src/lib/markdown-parser.ts:21-143`
- `Where parity exists`:
  - Some of these changes support the desktop shell indirectly: native directory selection, platform-backed markdown parsing, project preloading, and desktop-friendly navigation.
- `Where it deviates`:
  - Sidebar collapse behavior, recent-project ordering, Buddy-specific route redirects, and KaTeX/highlighter post-processing are product-layer choices with no direct vendored desktop equivalent.
- `Impact`:
  - These diffs are not a parity problem by themselves.
  - They should be treated as Buddy UX decisions layered on top of the desktop port.

## Parity Matrix

| Area | Parity | Read |
| --- | --- | --- |
| Vendored project runtime access (`@buddy/opencode-adapter/project`) | `5/5` | Thin bridge, correct direction, no reimplementation |
| DB migration resource patching (Buddy + vendor) | `5/5` | Strong parity and aligned with the vendor-core guardrail |
| Web app embedding seams (`AppBaseProviders`, `PlatformProvider`, `ServerProvider`) | `4/5` | Same architectural seam, different stack |
| Desktop platform services (`storage`, `dialog`, `notify`, `fetch`, markdown) | `3/5` | Selective port of the most useful vendor runtime services |
| Authenticated sidecar transport and SSE fallback | `3/5` | Same general transport model, Buddy-specific auth path |
| Desktop shell bootstrap (`packages/desktop/src/index.tsx`) | `2/5` | Same shape, different runtime ownership |
| Project persistence and recent-project ownership | `2/5` | Functional, but moved out of the client and into the backend |
| Rust/Tauri feature surface overall | `1/5` | Minimal launcher, not close to full vendor desktop parity |
| Buddy-only UI/UX adjustments | `1/5` | Product behavior, not vendor tracking |

## What To Review Next

1. Decide whether `packages/desktop` is supposed to stay a minimal Buddy launcher or eventually track the full vendored desktop feature set. Right now it is clearly the former.
2. Decide whether backend-owned `/api/project` state is an intentional product fork. If it is, document it as a Buddy contract, because it breaks parity with the vendor's client-owned project registry model.
3. Remove or rewire the leftover Tauri plugin dependencies in `packages/desktop/package.json` so the dependency list matches the runtime surface.
4. Keep the direct vendored DB patch on a short list for the next subtree refresh. This is an intentional and sensible patch, but it is now a vendor drift point.
5. If future desktop parity matters, the next missing vendor layers to port are server management, deep links, updater flow, and OS-specific native helpers.

## Confidence And Unknowns

- `Confidence`: medium-high
- `What I checked`: tracked diffs, new desktop package structure, direct comparisons against `vendor/opencode/packages/desktop` and `vendor/opencode/packages/app`, and the explicit vendored DB patch
- `What I did not check`: runtime smoke tests, `tauri dev`, `tauri build`, or end-to-end desktop behavior
- `Main unknown`: whether the current goal is "minimal Buddy desktop shell" or "close parity with vendored OpenCode desktop." The audit changes meaning depending on that intent, but the current code clearly favors the minimal-shell path.
