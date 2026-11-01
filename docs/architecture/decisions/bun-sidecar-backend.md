# ADR: Bun sidecar backend

Status: Accepted  
Date: 2026-11-01  
Supersedes: [Electron utility process backend](utility-process-backend.md)

## Decision

Buddy's packaged Electron app launches `Resources/buddy-backend` (`buddy-backend.exe` on Windows), a Bun-compiled executable containing Buddy and the vendored OpenCode runtime. Development launches the same backend with Bun and the branding preload. Electron continues to serve its renderer as before.

This aligns Buddy with OpenCode v2's Electron application and Bun-compiled CLI stack. Investigation on 2026-10-31 observed free-model requests rejected from Node while matching requests from Bun succeeded. Buddy's captured Bun request already contained its real working directory, environment block, `read` tool, streaming flag, and OpenCode request identity. This observation motivates runtime compatibility; it does not establish a stable contract for the upstream service's admission policy. This change leaves Buddy's prompt, tools, and request identity intact.

## Build and packaging

`bun run --cwd packages/buddy build:backend` compiles the host OS and architecture with Bun's default export conditions. OpenCode's SQLite, PTY, file finder, WASM loaders, and v1 importer therefore use their Bun variants. The build embeds native and WASM dependencies, verifies the selected runtime graph and executable shape, and preserves the existing branding, channel, and advanced math version defines.

PDF validation and spreadsheet parsing are compile entrypoints. Chemistry starts the same executable with the hidden `__chemfig-child` argument; source development starts its TypeScript child with Bun. Chemistry TeX files remain adjacent resources. Buddy source resources, migrations, knowledge graph, and tessdata retain their resource directories and environment variables.

Prepare and prebuild stage the executable in desktop `resources/`; Electron Builder copies it beside the existing runtime directories and rejects a missing or empty packaged executable. macOS retains ad hoc signing and hardened runtime. The backend receives its own JIT and library-validation entitlements. Each OS and architecture must build natively, including Windows on Windows.

## Worker memory budgets

Bun does not enforce Node worker heap limits. PDF validation and spreadsheet parsing use Bun's
`smol: true` worker option to reduce memory use; this is not a heap cap. Existing input byte,
archive expansion, output byte, concurrency, and time budgets remain the boundary. Worker timeouts
still terminate parsing. No separate parser subprocess is introduced.

## Native extraction cache

LiteParse's embedded addon and PDFium library share a private content-addressed directory under
Buddy's cache root at `native/liteparse/<sha256>/`. Both files are verified by hash on reuse and
repaired atomically when needed. Concurrent launches reuse identical files without rewriting loaded
libraries, including on Windows. Process exit does not delete this cache.

## Lifecycle and data

Electron owns the child process, password, authenticated health probes, and log streams. It pipes stdin and sets `BUDDY_EXIT_WITH_PARENT=1`; EOF stops the backend through its existing graceful shutdown. Without that variable stdin has no lifecycle role. POSIX shutdown sends SIGTERM before the existing timed process-tree escalation; Windows uses `tree-kill`. Completion tracks `close`.

There is no service, adoption, or independent backend lifecycle. A source change restarts the development child without building a Node artifact.

SQLite files retain their format. The compiled smoke creates a previous-runtime database with `node:sqlite` and the real Buddy migrations, then opens it with the Bun backend, checks retained data, and checks later OpenCode migrations. Existing v1 chat import remains part of the smoke.

## Memory tradeoff

The owner accepts Bun's separate runtime and its higher potential memory use in exchange for compatibility with OpenCode v2. The superseded ADR records Windows sidecar working sets of roughly 574–858 MB and startup peaks around 935 MB; those historical figures are not measurements of this build. Current macOS health-only idle RSS and binary size are recorded below after verification. Windows measurements remain a CI or Windows-host task.

On 2026-11-01, the signed macOS ARM64 backend (Bun 1.3.13, macOS 26.4 / 25E246) used **269,040 KiB RSS (262.73 MiB)** after health checks followed by 60 seconds with no further requests. This was a fresh temporary HOME/XDG/Buddy/notebook run of the packaged executable. RSS includes resident shared pages; it is not a private-footprint or peak measurement. Closing parent stdin then produced exit 0.

The compiled executable was **318,774,946 bytes (304.01 MiB)**; the signed packaged executable was **316,940,368 bytes (302.26 MiB)**. The full local beta macOS ARM64 build and signed packaged smoke passed. The one live invocation exited 2: the control returned 429, and a driver HTTP-body bug prevented Buddy inference. That bug was corrected and covered by a real HTTP offline test and mutation check; no second live invocation was made.

## Verification

1. Build the backend, start it with temporary HOME, XDG, Buddy, and notebook roots, and check `/api/healthz` reports `runtime.runtime = "bun"` with a Bun version. `/api/health` retains its OpenCode version contract.
2. Run `bun run --cwd packages/desktop-electron smoke:backend`. It exercises the isolated executable, health timing, v1 import, resource parsing, chemistry, SQLite upgrade, and shutdown. Run `smoke:packaged-backend` against the built app to exercise the signed binary.
3. Run the offline `free-model-request-contract.test.ts` through Buddy's `test` script, selecting `test/opencode-runtime/free-model-request-contract.test.ts`. It checks the real host's outgoing anonymous main request with a local server, including identity, session headers, streaming, environment, actual working directory, and the `read` function.
4. Build a full target with `build-release-target.ts`. Target-native CI runs compiled and packaged smokes on macOS and Windows.
5. Run `smoke:free-models --binary <packaged binary>` once. Exit 0 means Buddy completed; exit 1 means Buddy failed while the direct Bun control passed; exit 2 is inconclusive because both failed. The scheduled/manual workflow fails only for exit 1 and is not a PR gate.
6. Run root lint, typecheck, and formatting checks sequentially. Measure idle backend RSS after 60 seconds of health-only activity in temporary roots.

See the BN-BUN-SIDECAR migration report for exact local outputs, mutation evidence, and platform limitations.
