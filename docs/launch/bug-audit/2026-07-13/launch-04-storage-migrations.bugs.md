# LAUNCH-04 — Durable storage, workspace/file identity, migrations, and API scope

Audit date: 2026-07-13
Pass status: Full merged-domain discovery complete; verification pending
Baseline: Current workspace, evaluated as a clean release-candidate tree. Unrelated dirty-worktree changes were ignored.

This file records first-pass candidates across runtime storage, notebook identity, project files, and typed SDK/query scope. A candidate is not a final launch verdict until the verification pass either retains it under **Verified bugs** or moves it to **Rejected after verification**.

## Candidate bugs

### L04-C01 — P1 — Runtime-root relocation abandons existing database and authentication state

- **Locations:** `packages/buddy/src/opencode-runtime/env.ts:59-67`, `packages/buddy/src/opencode-runtime/env.ts:109-139`, `packages/desktop-electron/src/main/storage-paths.ts:84-110`, `vendor/opencode/packages/core/src/database/database.ts:43-54`, `vendor/opencode/packages/opencode/src/auth/index.ts:10`, `vendor/opencode/packages/opencode/src/mcp/auth.ts:37`
- **Trigger:** Upgrade an installation whose OpenCode database and credentials still live under the pre-relocation OpenCode data root.
- **Expected:** Startup discovers and safely migrates old DB/auth/state into the Buddy-owned root, with rollback or explicit recovery on failure.
- **Observed in discovery:** Current startup creates and uses `<XDG_DATA_HOME>/buddy/opencode`. The prior production DB was under `<XDG_DATA_HOME>/opencode/opencode.db`, while development used an isolated `opencode-dev.db`. No copy, rename, or legacy-root discovery appears in current bootstrap.
- **Impact:** Upgrade starts against a fresh database and empty provider/MCP auth state. Sessions appear deleted and users are logged out even though the old files remain on disk.
- **Verification pending:** Seed old production and development layouts with sentinel DB/auth content, launch the current build, and trace which files are opened and surfaced.
- **First-pass confidence:** High.

### L04-C02 — P1 — Provider authentication persistence is unlocked and non-atomic

- **Locations:** `vendor/opencode/packages/opencode/src/auth/index.ts:58-89`, `vendor/opencode/packages/core/src/fs-util.ts:102-114`, compared with `vendor/opencode/packages/opencode/src/mcp/auth.ts:59-82`
- **Trigger:** Two provider-auth mutations overlap, or the process crashes/runs out of disk space while rewriting `auth.json`.
- **Expected:** Credential updates are serialized across processes and replace the file atomically; a corrupt read never becomes an empty authoritative state.
- **Observed in discovery:** Provider auth performs an unlocked read-modify-write of the whole JSON object directly to the target file. Any read/parse failure becomes `{}`. MCP auth uses a file lock, but provider auth does not. A preserved first-pass probe launched 40 concurrent provider-auth writes; all 40 reported success, but the resulting file retained only one credential.
- **Impact:** Lost updates or a truncated file can erase every provider credential; the next successful mutation can permanently overwrite recoverable state with only one entry.
- **Verification pending:** Independently repeat instrumented set/remove/refresh races and inject short-write/ENOSPC/process-termination failures against isolated auth fixtures, including restart behavior after malformed JSON.
- **First-pass confidence:** High on mechanism and concurrent lost-update behavior; crash-path severity remains to be verified.

### L04-C03 — P1/P2 — Database migrations use only a process-local lock

- **Locations:** `vendor/opencode/packages/core/src/database/migration.ts:11-20`, `vendor/opencode/packages/core/src/database/migration.ts:43-79`, `vendor/opencode/packages/core/src/database/database.ts:25-34`
- **Trigger:** Desktop backend and CLI/another server open the same database concurrently immediately after an upgrade with a pending migration.
- **Expected:** A cross-process migration lock and in-transaction completion recheck ensure each migration runs once.
- **Observed in discovery:** The semaphore is in-memory. Each process reads the completed-ID set before applying migrations and does not refresh it under a cross-process lock; the loser can act on stale completion state after another process commits.
- **Impact:** The second process may replay `CREATE`/`ALTER` work, fail startup, or leave one client unavailable during a critical upgrade.
- **Verification pending:** Start two isolated current runtimes simultaneously against a prior-schema fixture and capture migration SQL/results under repeated runs on macOS and Windows.
- **First-pass confidence:** Medium-high; SQLite transaction timing and migration SQL idempotence must be tested.

### L04-C04 — P1 — Percent-looking notebook names are decoded into a different filesystem identity

- **Locations:** `packages/buddy/src/project/directory.ts:71-76`, `packages/buddy/src/project/directory.ts:87-96`, `packages/buddy/src/project/directory.ts:134-135`, `packages/buddy/src/http/directory.ts:107-126`, `packages/sdk/src/index.ts:10-26`
- **Trigger:** Open or address a valid macOS/Windows notebook whose path contains a literal percent escape such as `%20`, `%2F`, or `%5C`.
- **Expected:** URL decoding happens exactly once at the HTTP boundary, while an already-decoded body/header path retains literal percent characters and resolves to the selected directory.
- **Observed in discovery:** `URL.searchParams.get()` already decodes query values, but `resolveDirectory()` unconditionally applies `decodeURIComponent()` again to query, header, body, and stored-registry values. The SDK pre-encodes a directory header only when the path contains non-ASCII characters, so an ASCII path containing `%2F` is decoded as a separator while the same path plus an unrelated non-ASCII character takes a different path through the protocol.
- **Impact:** A selected notebook can fail to open or silently resolve to another existing directory. Client caches remain keyed by the caller's original string while reads and mutations execute against the decoded filesystem target.
- **Verification pending:** Create paired directories whose names differ only by literal versus decoded percent sequences, exercise body/header/query/registry and SDK paths on macOS and Windows, and assert the canonical identity returned and mutated.
- **First-pass confidence:** High on the decode mismatch; platform-specific misrouting cases remain to be exercised.

### L04-C05 — P1 — Query scope silently overrides a directory-scoped client across projects

- **Locations:** `packages/buddy/src/http/directory.ts:107-126`, `packages/sdk/src/index.ts:14-35`, `packages/web/src/state/chat-actions.ts:1084-1095`, `packages/buddy/test/session/project-scoped-routes.test.ts:66-94`, `packages/buddy/test/session/project-scoped-routes.test.ts:137-159`
- **Trigger:** A directory-scoped SDK client carries notebook A in `x-buddy-directory` while an endpoint option, stale closure, or manually composed request supplies notebook B in the `directory` query parameter.
- **Expected:** Conflicting transport identities are rejected, or a separately named/filter-only query is constrained to the same canonical project as the scoped header.
- **Observed in discovery:** Request parsing uses the query value first and never compares it with either directory header. A current regression test deliberately sends two different repositories and proves that the query-selected repository wins. Generated clients make both inputs easy to compose: client construction injects a header while endpoint options can independently add a query directory.
- **Impact:** A call logically owned and cached by notebook A can read or mutate notebook B, undermining the SDK's directory-scoped contract and making stale UI inputs capable of crossing notebook boundaries.
- **Verification pending:** Exercise every dual-identity route through the generated SDK with same-directory aliases, same-project subdirectories, and distinct projects; classify which queries are filters and require explicit agreement/rejection semantics.
- **First-pass confidence:** High on current precedence and cross-project acceptance; the intended per-route filter contract needs confirmation.

### L04-C06 — P1/P2 — Project text saves use an unlocked, non-atomic check-then-write

- **Locations:** `packages/buddy/src/project/project-file-editor-service.ts:205-249`, `packages/buddy/src/routes/compatibility.ts:509-548`, `packages/web/src/state/chat-actions.ts:2772-2794`
- **Trigger:** Two editor tabs/clients save from the same `expectedVersion` concurrently, or the backend terminates while `fs.writeFile()` is replacing an existing file.
- **Expected:** The version comparison and replacement are serialized for the canonical file, and content is written to a sibling temporary file then atomically renamed/durably completed.
- **Observed in discovery:** Each request independently reads and hashes the current contents, compares the version, then calls `fs.writeFile()` directly on the target. There is no per-file or cross-process lock and no atomic replacement, so overlapping requests can both pass the comparison and both report success.
- **Impact:** One successful save silently overwrites another, while interruption after truncation can leave a partial or empty user file. The returned success/version from the losing write no longer describes durable disk state.
- **Verification pending:** Gate two saves after their version reads, release both writes together, and inject process termination/short writes at replacement boundaries on macOS and Windows.
- **First-pass confidence:** High on the race and non-atomic mechanism; exact interruption outcomes are filesystem-dependent.

### L04-C07 — P2 — Workspace raw-file responses ignore HTTP byte ranges

- **Locations:** `packages/buddy/src/routes/compatibility.ts:361-444`, `packages/buddy/src/project/raw-file-response-service.ts:83-158`, `packages/buddy/src/project/raw-file-response-service.ts:237-288`, `packages/web/src/routes/$directory._bench.file.tsx:159-181`, `packages/web/src/components/bench/bench-media-preview.tsx:57-73`
- **Trigger:** Browser media playback or seeking sends `Range: bytes=...` for a large notebook audio/video/PDF file.
- **Expected:** Valid single-range requests return `206`, `Content-Range`, `Accept-Ranges`, and only the requested bytes; invalid ranges return `416`.
- **Observed in discovery:** The shared raw-file service implements range parsing and bounded range streams, but the workspace `/api/file/raw/:fileName` GET/HEAD handlers bypass it, never inspect the `Range` header, and always build a full-file `200` response. Bench audio/video elements consume this endpoint directly.
- **Impact:** Seeking and resume behavior can fail or restart downloads, and repeated media requests transfer full large files, producing avoidable latency, I/O, memory/network load, and poor remote-client behavior.
- **Verification pending:** Send prefix, suffix, open-ended, invalid, and multi-range requests directly and through Chromium media playback; record status/headers/bytes transferred and seek behavior.
- **First-pass confidence:** High on HTTP behavior; user-visible playback severity varies by browser and media format.

### L04-C08 — P1/P2 — Raw notebook files are served inline with active MIME authority

- **Locations:** `packages/buddy/src/http/mime.ts:1-8`, `packages/buddy/src/project/raw-file-response-service.ts:36-80`, `packages/buddy/src/routes/compatibility.ts:361-444`, compared with `packages/buddy/src/routes/object-html-widget.ts:46-59` and `packages/buddy/src/routes/object-figure.ts:19-23`
- **Trigger:** An authenticated browser/remote client navigates to a raw notebook `.html`, `.svg`, or other browser-active file, including via a rendered or copied workspace URL.
- **Expected:** Arbitrary notebook bytes are forced to download or rendered only in a deliberately sandboxed origin/policy with `nosniff`, a restrictive CSP, and no ambient API authority.
- **Observed in discovery:** MIME is inferred from the filename and every raw file receives `Content-Disposition: inline`. The route adds neither `X-Content-Type-Options` nor CSP/sandbox isolation, unlike the dedicated HTML-widget and generated-figure routes. Thus a raw HTML response is an executable document at the authenticated API origin when navigated.
- **Impact:** Workspace-authored active content can execute with the network/origin authority available to the API client, potentially reading or mutating notebook/session state rather than remaining inert file data.
- **Verification pending:** Trace all raw-URL navigation sinks in browser, embedded Electron, and remote modes; load hostile HTML/SVG sentinels and measure origin, credential attachment, API reachability, opener access, and navigation containment.
- **First-pass confidence:** High on response semantics; medium on normal-product navigation reachability and resulting authority.

### L04-C09 — P1/P2 — Open-project authorization uses a process-local registry cache indefinitely

- **Locations:** `packages/buddy/src/project/open-project-registry.ts:51-55`, `packages/buddy/src/project/open-project-registry.ts:388-397`, `packages/buddy/src/project/open-project-registry.ts:535-548`, `packages/buddy/src/http/directory.ts:129-140`
- **Trigger:** Two backend/CLI processes share the Buddy state root; one process primes its registry cache and the other opens, closes, recovers, or replaces the registry.
- **Expected:** Authorization decisions observe the registry version protected by the cross-process lock, or invalidate/reload a cache when the backing file changes.
- **Observed in discovery:** Registry mutations are file-locked, but `isDirectoryInOpenProjectRegistry()` reads a module-global array after its first load and never checks file identity, mtime, revision, or watcher state. Changes made by another process are therefore invisible for the lifetime of the first process.
- **Impact:** A folder closed elsewhere can remain authorized for file/session/tool requests, while a newly opened folder remains unusable until restart. Restart overlap or recovery can yield contradictory authorization across clients sharing one state root.
- **Verification pending:** Run two processes against one isolated state root, prime both caches, alternate open/close/recovery mutations, and assert request authorization changes immediately on macOS and Windows.
- **First-pass confidence:** High on stale-cache behavior; medium-high on frequency of supported overlapping-process scenarios.

### L04-C10 — P1/P2 — Closing a notebook leaves most directory-scoped query data reusable

- **Locations:** `packages/web/src/state/query-client.ts:3-13`, `packages/web/src/state/chat-actions.ts:1060-1071`, `packages/web/src/state/directory-chat-query.ts:201-213`, `packages/web/src/lib/directory-chat/use-directory-chat-page-controller.ts:880-890`, `packages/web/src/routes/settings.tsx:295-301`, `packages/web/src/state/resources-query.ts:339-397`, plus directory keys in `packages/web/src/state/agents-md-query.ts`, `packages/web/src/state/notebook-settings-query.ts`, `packages/web/src/state/workspace-objects-query.ts`, and `packages/web/src/state/obsidian-vault-query.ts`
- **Trigger:** Populate notebook caches, close the notebook, externally change or replace the directory at the same path, then reopen it before cache GC/staleness expires.
- **Expected:** Closing/reopening invalidates every directory-owned cache or binds cache identity to a generation/fingerprint that cannot be reused for a different filesystem incarnation.
- **Observed in discovery:** Both close flows remove only sessions, permissions, and questions. Other directory-keyed query families remain in the global `QueryClient` for up to the 30-minute GC window; reading blobs are explicitly fresh for 30 minutes and can be returned without a mount refetch.
- **Impact:** A reopened notebook can display files, objects, config, or metadata from the prior directory incarnation while subsequent actions target the new on-disk notebook, creating wrong-target edits and disclosure between sequential notebook occupants of one path.
- **Verification pending:** Prime every directory query family for notebook A, close it, replace the path with notebook B, reopen immediately and at stale-time boundaries, and record which A values render or drive B mutations.
- **First-pass confidence:** High on incomplete eviction and retained blobs; medium-high on wrong-incarnation impact pending lifecycle reproduction.

### L04-C11 — P2 — Directory injection drops valid native `Headers` from the typed SDK

- **Locations:** `packages/sdk/src/index.ts:14-35`, `packages/sdk/src/gen/core/types.gen.ts:53-69`, `packages/sdk/src/gen/client/utils.gen.ts:187-226`
- **Trigger:** Create a directory-scoped `BuddyClient` with `config.headers` supplied as a native `Headers` object, including authorization or required caller metadata.
- **Expected:** Adding `x-buddy-directory` preserves every header form accepted by the exported generated `Config` contract.
- **Observed in discovery:** The generated client explicitly supports and iterates native `Headers`, but `createBuddyClient()` first converts the supplied value with object spread. Native `Headers` entries are not enumerable object properties, so they disappear before the directory header is added. The unscoped client path does not perform this lossy conversion.
- **Impact:** A client works globally but silently loses authorization/tracing/idempotency headers when scoped to a notebook, causing remote API failures or changing request semantics only on directory-bound calls.
- **Verification pending:** Construct clients with object, native `Headers`, and tuple-array inputs; capture final requests for scoped and unscoped clients and compare all accepted header forms.
- **First-pass confidence:** High for native `Headers`; tuple-array behavior also needs characterization.

## Verified bugs

Pending second-pass verification.

## Rejected after verification

None yet.

## Discovery coverage with no retained candidate

- Buddy-owned registry writes use a cross-process file lock, unique temporary files, atomic rename, a backup, and explicit corrupt-file recovery; the retained registry candidate is cache coherence rather than the write path.
- Existing-path canonicalization and allowed-root checks resolve symlinks before authorization. The vendored file service rechecks real paths before reads/lists, and static `..`/symlink escapes were not retained without a race.
- Managed notebook names reject traversal, Windows-invalid characters, reserved device names, control characters, and trailing periods/spaces.
- Project editor routes reject non-UTF-8/binary files and stale sequential versions; the retained save candidate concerns concurrent compare/write and crash atomicity.
- Reader source validation downgrades invalid PDF/EPUB payloads to binary, and raw streams close handles on completion, cancellation, abort, and errors.
- Directory-bearing query keys were present across the reviewed notebook settings, objects, resources, learner, MCP, skills, Obsidian, and teaching caches; the retained cache candidate concerns lifecycle eviction and filesystem-incarnation identity.
- Generated base-URL/auth transport composition remains seam-owned by `LAUNCH-03`; streaming/error parity remains seam-owned by `LAUNCH-06`.
