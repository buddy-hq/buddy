# LAUNCH-08 — Advanced-math and standards execution/data runtimes

Audit date: 2026-07-13
Pass status: Discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L08-C01 — P1 — The Python calculator is unrestricted same-user code execution behind a tool-wide approval

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:27-43`, `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:89-108`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:362-375`, `packages/buddy/src/learning/features/calculator/tools/python-calculator.ts:14-24`
- **Trigger:** A model emits Python that imports `os`, `pathlib`, `subprocess`, or a networking module after the user approves the calculator tool.
- **Expected:** Model-authored math code runs inside a documented containment boundary with restricted filesystem, process, network, imports, and home-directory access, or the approval presents the exact code and authority for every execution.
- **Observed in discovery:** The runtime parses and executes arbitrary Python with normal builtins. Its environment deliberately retains `HOME`/`USERPROFILE` and `PATH`, and there is no OS sandbox, import allowlist, filesystem root, or network/process restriction. The permission request is the same `python_calculator: *` pattern for every script and exposes only `codeLength` in metadata.
- **Impact:** A prompt-injected or erroneous calculation can read and modify same-user files, read credentials, spawn programs, and access the network with Buddy's authority. “Allow always” converts one generic approval into continuing arbitrary-code authority.
- **Verification pending:** Execute sentinel read/write, subprocess, environment-secret, and loopback/network probes in an isolated OS account on macOS and Windows; capture exactly what the permission UI discloses and classify the required product/security boundary.
- **First-pass confidence:** High; the acceptable remediation is a product/security trade-off.

### L08-C02 — P1 — Calculator output, memory, artifacts, and descendant processes are unbounded

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:46-62`, `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:89-131`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:388-404`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:666-681`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:877-927`
- **Trigger:** Generated Python prints a very large value, builds a large in-memory object, renders many/huge figures, writes files, or spawns a child that outlives the calculator process.
- **Expected:** OS-level CPU/memory/file/process limits, streaming output caps, artifact count/size validation, and process-tree termination keep one tool call bounded.
- **Observed in discovery:** Python captures stdout/stderr in unbounded `StringIO`, serializes the whole response, and the parent accumulates all pipe chunks before parsing. Every Matplotlib figure is saved and synchronously reread into a base64 data URL with no count/dimension/byte limit. Timeout/abort/removal sends a signal only to the direct child and applies no memory, disk, or descendant-process limit.
- **Impact:** One approved calculation can OOM the runtime or backend, fill disk, create oversized transcript payloads, and leave background processes running after abort or removal.
- **Verification pending:** Run controlled output, allocation, plot, disk-write, and grandchild fixtures under representative limits; measure backend/child RSS and disk, abort each case, and assert bounded payloads and zero surviving descendants.
- **First-pass confidence:** High on missing bounds; failure thresholds are platform-dependent.

### L08-C03 — P1 — Downloaded executable/runtime artifacts are authenticated only by co-hosted checksums

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/service.ts:165-183`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:245-286`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:576-608`, `packages/buddy/src/local-runtimes/standards/service.ts:144-168`, `packages/buddy/src/local-runtimes/standards/service.ts:345-377`, `packages/buddy/src/local-runtimes/standards/service.ts:494-546`, `.github/workflows/publish-shared.yml:399-652`
- **Trigger:** The release repository/assets, configured asset origin, or publishing credential is compromised and serves a replacement bundle plus matching checksum/manifest.
- **Expected:** Optional executable and data runtimes are verified against a key or digest rooted in the signed application/update manifest, with version/target binding and rollback protection.
- **Observed in discovery:** Buddy fetches the advanced-math executable ZIP and its SHA-256 file from the same origin, then executes the extracted binary. Standards likewise trusts an archive, checksum, and manifest from that origin. The release workflow publishes checksum files but no runtime signature or app-rooted digest consumed by these services.
- **Impact:** Control of the asset origin is sufficient to gain same-user native code execution through the advanced-math install path; a replaced standards database also reaches SQLite's native parser and model-visible data.
- **Verification pending:** Trace the production release asset set and signing procedure end to end, substitute a locally served bundle with a matching replacement checksum, and confirm whether any unseen signed parent manifest rejects it.
- **First-pass confidence:** High on current consumer and workflow wiring.

### L08-C04 — P1/P2 — Runtime downloads and extraction have no trustworthy resource or containment limits

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/service.ts:245-265`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:500-550`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:576-626`, `packages/buddy/src/local-runtimes/standards/service.ts:345-377`, `packages/buddy/src/local-runtimes/standards/service.ts:471-484`, `packages/buddy/src/local-runtimes/standards/service.ts:534-578`, `packages/buddy/src/learning/features/standards/path.ts:245-299`
- **Trigger:** The server stalls, omits/forges content length, returns an oversized body, or supplies a highly expanding/malformed ZIP or Zstandard archive.
- **Expected:** Requests have deadlines and cancellation; downloads stream to bounded temporary files; extraction preflights paths, entry counts, symlinks, compressed/uncompressed sizes, and exact expected layout.
- **Observed in discovery:** Both remote installers call `fetch` without an AbortSignal and buffer the entire response with `arrayBuffer`. Advanced math passes the ZIP directly to platform extractors with no entry/path/size validation. Standards checks archive size only after buffering and streams decompression without enforcing the manifest's database size; the bundled fallback decompresses the whole database synchronously in memory.
- **Impact:** A stalled install can remain pending indefinitely; oversized or expanding assets can exhaust main-process memory or disk. The executable ZIP path additionally relies on platform extractor behavior for traversal and symlink containment.
- **Verification pending:** Serve slow/infinite/oversized fixtures and ZIP/Zstandard bombs plus traversal/symlink entries, measure memory/disk/time, and inspect every path written on macOS and Windows.
- **First-pass confidence:** High on missing bounds; exact ZIP traversal behavior needs platform reproduction.

### L08-C05 — P1/P2 — Advanced-math install/remove is only process-local and replacement has no rollback

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/service.ts:611-663`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:690-758`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:761-849`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:160-163`
- **Trigger:** Desktop and CLI/another backend mutate the shared advanced-math runtime concurrently, or final replacement fails after the old install is removed.
- **Expected:** A cross-process operation lock protects state/cache/install roots, and a verified new tree is atomically swapped while retaining the previous working tree until commit.
- **Observed in discovery:** `runtimeOperation` serializes only one JavaScript module instance. Every process shares the filesystem paths and directly rewrites the state file. Finalization recursively deletes the authoritative install before renaming the staging tree and keeps no backup; concurrent remove/install or a failed rename can erase the working runtime.
- **Impact:** Both operations may report inconsistent outcomes, the runtime state can name a missing executable, and a repair/update failure can turn a previously usable calculator into a broken install requiring manual recovery.
- **Verification pending:** Launch two isolated service processes against the same roots with barriers around replacement/state writes, race install/install and install/remove, and inject rename/access-denied/power-loss failures.
- **First-pass confidence:** High on coordination and swap mechanism.

### L08-C06 — P1 — The standards SQL row cap is applied only after SQLite materializes the full result

- **Locations:** `packages/buddy/src/learning/features/standards/service.ts:91-151`, `packages/buddy/src/learning/features/standards/service.ts:366-419`, `packages/buddy/src/learning/features/standards/tools/query-standards-sql.ts:6-27`
- **Trigger:** The model submits an expensive recursive CTE/cross join, a query yielding millions of rows, a large scalar/blob expression, or a costly allowed PRAGMA/EXPLAIN statement.
- **Expected:** SQL is executed with a progress/deadline/cancellation budget, query-only defensive settings, and an enforced SQL-level row/byte cap before materialization.
- **Observed in discovery:** The service allows any statement whose first token is `select`, `with`, `pragma`, or `explain`, then calls `.all()` synchronously. Only after the full result is resident in memory does it slice to `rowLimit`; there is no timeout, interrupt handler, opcode/row/byte budget, or automatic outer `LIMIT`.
- **Impact:** One approved tool call can block the backend event loop, allocate unbounded native/JS memory, and make all notebooks unresponsive even though the UI promises capped results.
- **Verification pending:** Run recursive, Cartesian, `randomblob`, and large-result fixtures with a tiny `rowLimit`, measure event-loop delay/RSS, test abort behavior, and probe allowed PRAGMAs under a disposable readonly database.
- **First-pass confidence:** High.

### L08-C07 — P1/P2 — Standards removal/replacement ignores live SQLite handles

- **Locations:** `packages/buddy/src/learning/features/standards/service.ts:366-394`, `packages/buddy/src/learning/features/standards/service.ts:766-777`, `packages/buddy/src/local-runtimes/standards/service.ts:431-446`, `packages/buddy/src/local-runtimes/standards/service.ts:554-590`, `packages/buddy/src/local-runtimes/standards/service.ts:834-865`
- **Trigger:** Query the standards database, then remove, repair, or update the runtime while the singleton `KnowledgeGraphService` still holds its readonly connection—especially on Windows.
- **Expected:** Runtime maintenance quiesces queries, closes the active database, atomically switches paths, then retires old versions after handles are released.
- **Observed in discovery:** The singleton closes a database only when a later query resolves a different path. Runtime install/remove has no hook to close or invalidate it before deleting the active version directory; cleanup also deletes every old version immediately. Windows generally prevents deleting an open SQLite file, while POSIX can leave the service reading an unlinked old file.
- **Impact:** Removal/update can fail and leave `removing`/error state on Windows, or report a new/removed dataset while active queries still use stale unlinked content on macOS.
- **Verification pending:** Open the singleton connection, exercise remove, same-version repair, and version update concurrently with reads on macOS and Windows, then inspect status, files, connection identity, and restart recovery.
- **First-pass confidence:** High on lifecycle gap; observed platform results remain to be captured.

### L08-C08 — P2 — Advanced-math self-check does not test the advertised runtime

- **Locations:** `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:15-24`, `packages/buddy/src/local-runtimes/advanced-math/runtime/main.py:84-86`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:459-493`, `packages/buddy/src/local-runtimes/advanced-math/service.ts:632-652`
- **Trigger:** A release bundle starts successfully but omits/corrupts one of the advertised scientific libraries or cannot execute/serialize a basic calculation or plot.
- **Expected:** Installation self-check imports every promised library and executes a minimal calculation and artifact round trip before replacing the working runtime.
- **Observed in discovery:** The self-check writes a fixed success line and returns zero. It never imports the supported libraries, parses a request, executes code, or creates a plot, yet a zero exit marks the staged bundle healthy.
- **Impact:** Buddy can discard a working runtime and advertise the replacement as ready even though the first real calculator call fails for common supported work.
- **Verification pending:** Build fixture executables/packages with missing library/data/plot dependencies that still implement the current self-check and confirm installation reaches `ready` before a representative calculation fails.
- **First-pass confidence:** High.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- The standards installer uses a cross-process heartbeat lock and stages a versioned database before promotion.
- Standards archive and decompressed-database hashes are checked, and the runtime SQLite connection opens with `readonly: true` and `create: false`.
- The typed standards tools use bound parameters and explicit result/depth limits.
- Runtime readiness constraints hide calculator/standards tools when the corresponding service is not ready, and runtime changes trigger session-permission refresh.
- Calculator environment construction drops most inherited variables, including ordinary provider/API environment secrets; the retained home/path authority is captured separately in L08-C01.
- Calculator temporary working/artifact directories are removed after normal success/failure, subject to the process-tree and platform-lock caveats above.
