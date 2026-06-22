# Buddy Backend Memory Investigation: Provider Catalog Loading

**Date:** Mon Jun 22 2026
**Machine:** macOS arm64 (developer's Mac)
**Reported issue:** On Windows, Buddy backend RSS reaches 800–900 MB at idle startup, total process memory ~1 GB. On Mac, idle is ~100 MB. Investigation requested to determine whether eager provider loading is the cause.

---

## Summary of Findings

The Buddy backend loads the **entire models.dev provider catalog** (144 providers, 5289 models, 2.3 MB JSON) into memory and transforms every provider and model on first access. The resulting API response is 3.88 MB containing 145 providers and 5254 models — but **only 2 providers are actually connected**. This catalog is parsed, deep-transformed (variant expansion, capability mapping, cost computation), held in an `InstanceState` cache, and fully serialized on every `/api/provider` call.

On Mac the spike is transient (peak ~550 MB, settles to ~127 MB after GC). On Windows, V8/Bun's garbage collector is less aggressive about returning memory to the OS, so the peak RSS stays resident, explaining the 600–900 MB idle footprint.

**The full catalog is loaded because the frontend's provider settings page needs to show all 145 browsable providers.** However, no UI surface needs all 5254 models — the model picker only uses connected providers' models, and there is no full-catalog model search or pagination.

---

## Experiments Performed

### 1. Codebase Exploration

Examined the following files to understand the startup and provider loading flow:

| File | Purpose |
|---|---|
| `packages/buddy/src/index.ts` | Hono server entry point. Routes are registered at module load. Runtime is lazy. |
| `packages/buddy/src/opencode-runtime/runtime.ts` | `loadOpenCodeApp()` — lazily builds the vendored OpenCode `Server.Default()`. Patches config/session/plugin/tool/skill/subagent services. Registered as a singleton promise. |
| `packages/buddy/src/opencode-runtime/client.ts` | `getOpenCodeClient()` — creates an in-process fetch-based client that routes through `fetchOpenCodeApp`. Lazily created on first provider/session/etc. request. |
| `packages/buddy/src/routes/provider.ts` | Provider Hono routes. `GET /api/provider` calls `client.provider.list()` which triggers the full runtime bootstrap + provider service initialization. |
| `vendor/opencode/packages/opencode/src/provider/provider.ts` | **The core provider service.** 1993 lines. `layer` builds a `Service` with an `InstanceState<State>` that loads the full models.dev catalog, transforms every provider/model, filters by env/auth/config, and caches the result. |
| `vendor/opencode/packages/core/src/models-dev.ts` | ModelsDev service. Fetches `https://models.dev/api.json` (2.3 MB), caches to `~/.cache/opencode/models.json` with a 5-minute TTL, and exposes it via `Effect.cachedInvalidateWithTTL`. Also forks a background refresh every 60 minutes. |
| `packages/buddy/src/dev/start-with-safe-env.ts` | Dev start script — spawns `bun run src/index.ts` with safe env (strips provider secrets). |
| `packages/buddy/src/dev/safe-env.ts` | Strips API keys / tokens from `.env` unless they start with `BUDDY_` or `OPENCODE_`. |
| `packages/buddy/script/build-single.ts` | Builds the desktop sidecar binary. |
| `packages/buddy/script/build-compiled-binary.ts` | Bundles + compiles the backend into a standalone `buddy-backend` binary (82 MB). Embeds migrations, skills, plugins, and catalog as `define` constants. |
| `packages/buddy/package.json` | Scripts: `dev`, `start`, `build:single`, `build:desktop-sidecar`. |

### 2. Dev Backend Memory Trace (bun run, not compiled)

Started the dev backend directly:

```bash
cd packages/buddy
nohup bun run src/index.ts serve --port 3001 --hostname 127.0.0.1 > /tmp/buddy-backend.log 2>&1 &
# pid 46254
```

**Results:**

| Step | RSS (KB) | Notes |
|---|---|---|
| Boot (server listening) | 287,568 | Just Hono + module imports. Runtime not yet loaded. |
| After `GET /api/healthz` | — | No runtime trigger. |
| After `GET /api/provider` | 496,432 | Runtime bootstrapped, full catalog loaded + transformed + serialized. **+208 MB**. |

Dev backend was killed after this measurement.

### 3. Compiled Sidecar Build

Built the desktop sidecar binary:

```bash
cd packages/buddy
rm -rf dist/desktop-sidecar
bun run script/build-single.ts
```

**Build output:**
```
Built sidecar at dist/desktop-sidecar/bin/buddy-backend
  with runtime entry dist/desktop-sidecar/app/index.js
  (buddy migrations: 2, opencode migrations: 1)
```

**Binary size:** 82 MB on disk (`86,104,354 bytes`).

### 4. Compiled Sidecar Memory Trace (step-by-step)

Started the compiled sidecar:

```bash
nohup ./packages/buddy/dist/desktop-sidecar/bin/buddy-backend serve --port 3002 --hostname 127.0.0.1 > /tmp/buddy-sidecar.log 2>&1 &
# pid 52224
```

#### Phase 1: Boot to steady state

| Step | RSS (KB) | Delta | Notes |
|---|---|---|---|
| T0: Boot (server listening) | 258,992 | — | Just Hono. Runtime not loaded. |
| After `GET /api/healthz` | 256,032 | -3 MB | No runtime trigger. Health check only. |
| After `GET /api/provider` (2s later) | 564,192 | +308 MB | **Runtime bootstrapped. Full catalog loaded, parsed, transformed, serialized.** Response: 3.88 MB JSON. |
| After `GET /api/provider/auth` (1s later) | 442,384 | -122 MB | GC reclaiming. Response: 2 KB. |
| After `GET /api/config` (1s later) | 468,688 | +26 MB | Response: 1.1 KB. |
| After `GET /api/session` (2s later) | 340,192 | -128 MB | GC reclaiming. Response: 2 bytes (`[]`). |
| After `GET /api/skills` (2s later) | 300,352 | -40 MB | GC reclaiming. Response: 32 bytes. |

#### Phase 2: Steady state decay (no requests, just GC)

Measured RSS every 3 seconds with no requests:

| Time | RSS (KB) |
|---|---|
| t=3s | 138,432 |
| t=6s | 139,376 |
| t=9s | 130,384 |
| t=12s | 128,864 |
| t=15s | 128,768 |

**Steady state: ~127 MB RSS** after GC completes. The catalog is still cached in `InstanceState` but V8 has compacted the heap and returned memory to the OS.

#### Phase 3: Re-hit provider endpoint (cached path)

Re-hit `GET /api/provider` to see the spike pattern when the catalog is already cached:

| Time | RSS (KB) | Notes |
|---|---|---|
| Before hit | 127,584 | Steady state. |
| t=2s after hit | 398,672 | Peak — serialization of 3.88 MB response. |
| t=4s | 382,064 | |
| t=6s | 284,208 | |
| t=8s | 283,008 | |
| t=10s | 282,416 | |
| t=12s | 189,760 | GC sweep. |
| t=14s | 163,520 | |
| t=16s | 155,376 | |

Continued tracing:

| Time | RSS (KB) |
|---|---|
| t=3s | 149,728 |
| t=6s | 149,728 |
| t=9s | 148,096 |
| t=12s | 147,552 |
| t=15s | 147,520 |
| t=18s | 147,360 |
| t=21s | 147,040 |
| t=24s | 127,824 |
| t=27s | 127,824 |
| t=30s | 127,824 |

**Settles back to ~127 MB.** The spike is transient on Mac — V8 returns freed memory to the OS after GC.

#### Phase 4: Final cached hit confirmation

| Step | RSS (KB) | Notes |
|---|---|---|
| Steady state | 8,896 | Process had been idle; OS reclaimed most pages. |
| After cached `GET /api/provider` | 492,592 | Re-spike from serialization. Response time: 305 ms. |
| After 10s GC | 334,720 | Settling. |

Sidecar process killed after measurements.

### 5. Catalog Data Measurement

```bash
# Cached catalog on disk
ls -la ~/.cache/opencode/models.json
# 2,370,044 bytes (2.3 MB)

# Provider count
jq 'keys | length' ~/.cache/opencode/models.json
# 144 providers

# Total models across all providers
jq '[.[] | .models | keys | length] | add' ~/.cache/opencode/models.json
# 5289 models
```

### 6. Provider API Response Measurement

```bash
curl -s "http://127.0.0.1:3002/api/provider" -o /tmp/providers.json
# Response size: 3,888,068 bytes (3.88 MB)

jq '.all | length' /tmp/providers.json
# 145 providers in response

jq '.connected | length' /tmp/providers.json
# 2 connected providers

jq '[.all[] | .models | keys | length] | add' /tmp/providers.json
# 5254 models in response
```

**145 providers and 5254 models shipped in every response, but only 2 are connected.**

### 7. Frontend Provider Catalog Usage Analysis

Investigated every consumer of `client.provider.list()` in `packages/web`:

#### Single SDK call site
- `packages/web/src/state/chat-actions.ts:876` — `fetchProviderCatalog()` calls `client.provider.list()` + `client.provider.auth()` + `client.provider.openai.modelAvailability.get()` in a `Promise.all`. Result is normalized by `normalizeProviderCatalog` (line 789), which flattens every provider's full model map into arrays.

#### Two consumption paths
1. **Global snapshot query** (`bootstrap-query.ts:86`) — `providerCatalogSnapshotQueryOptions`, used by:
   - `settings-providers.tsx` — **the only consumer that needs all 145 providers** (browsing/connecting UI). Does NOT render model lists, only provider name/icon/auth rows.
   - `onboarding.tsx` — needs only OpenAI/OpenCode provider entries.
   - `learner-memory-settings.ts` — needs only connected providers.

2. **Per-directory Zustand store** (`loadProviderCatalog` at `chat-actions.ts:1301`) — feeds the model picker via `use-directory-chat-state.ts:442`, which calls `getConnectedProviders(providers)` and only iterates connected providers' models.

#### Key findings
- **Model picker** (`prompt-composer-toolbar.tsx`): only uses connected providers' models. No model search.
- **Learner-memory selects** (`settings-learner-memory.tsx`, `buddy-devtools.tsx`): only connected providers.
- **Context metrics** (`context-metrics.ts`): only needs the specific provider/model for past messages.
- **Settings providers page** (`settings-providers.tsx`): needs all 145 provider names for browsing, but does NOT need any model data.
- **No pagination** anywhere — full `all` array fetched in one shot.
- **No full-catalog model search** — the only search is provider-name search via `fuzzysort` in settings.
- `normalizeProviderCatalog` normalizes, sorts, and ships all 5254 models on every fetch, even where only connected providers are used.

---

## Root Cause Analysis

### What happens on first `/api/provider` request

1. `getOpenCodeClient()` creates the in-process client (lazy singleton).
2. `fetchOpenCodeApp()` calls `loadOpenCodeApp()` which bootstraps `Server.Default()` — patches all live services, builds the Effect runtime.
3. The Provider service layer initializes `InstanceState<State>`:
   - Loads models.dev catalog from disk cache (`~/.cache/opencode/models.json`, 2.3 MB, 144 providers, 5289 models).
   - Calls `fromModelsDevProvider()` for every provider — transforms each model with `ProviderTransform.variants()`, computes capabilities, costs, limits, modalities.
   - Merges config providers, env-loaded providers, auth-stored providers, plugin providers.
   - Runs `custom(dep)` loaders for 25+ provider-specific handlers (Anthropic, OpenAI, Azure, Bedrock, Vertex, GitLab, Cloudflare, etc.).
   - Caches the result in `InstanceState` (scoped per directory, survives for the instance lifetime).
4. The route serializes the entire `providers` record plus the `catalog` into a 3.88 MB JSON response with `toPublicInfo()` (which does a full `JSON.parse(JSON.stringify(...))` deep clone to strip functions).

### Why Mac settles but Windows doesn't

- **Mac (darwin arm64):** V8/Bun GC compacts the heap and returns freed pages to the OS within ~15–30 seconds. Peak 550 MB → steady state 127 MB.
- **Windows:** V8 on Windows is historically less aggressive about returning memory to the OS (`VirtualFree` with `MEM_DECOMMIT` is lazier than `madvise(MADV_DONTNEED)` on Unix). The 550 MB peak from catalog parsing + serialization stays resident as committed memory, even after GC marks it free. This explains the 600–900 MB idle footprint on Windows.

### Why the catalog is so large

- models.dev aggregates 144 providers with 5289 models total.
- Each model has: capabilities (7 fields), cost (input/output/cache read+write/tiers), limit (context/input/output), modalities (input+output with 5 modes each), variants (expanded via `ProviderTransform.variants()`), headers, options, release_date.
- `ProviderTransform.variants()` expands each model into multiple variant records (reasoning modes, etc.), multiplying the object count.
- `toPublicInfo()` does a full deep clone via `JSON.parse(JSON.stringify(...))` on every provider, doubling memory during serialization.

### The filtering question

The user asked: "Is this just because of the filtering that we are doing on the front end and because of that we are fucked?"

**Yes, partially.** The backend ships the full 145-provider / 5254-model catalog to the frontend on every load because:
1. The settings providers page needs to browse all 145 providers (for connecting).
2. The frontend does all filtering client-side (`getConnectedProviders`, `normalizeProviderCatalog`) with no server-side filtering or pagination.
3. No consumer actually needs all 5254 models — the model picker only uses the 2 connected providers' models, and the settings page only needs provider metadata (name, env, auth methods), not models.

The backend provider service loads the full catalog because the vendored OpenCode `Provider.layer` is designed to support any model from any provider at any time (it's a general-purpose agent runtime). Buddy's frontend only needs connected providers' models for the picker, plus provider metadata for the settings browser.

---

## Memory Summary Table (Compiled Sidecar, Mac)

| Phase | RSS (MB) | Notes |
|---|---|---|
| Boot (no runtime) | 253 | Hono server only |
| Peak (first provider list) | 550 | Full catalog parse + transform + serialize |
| Steady state (after GC) | 127 | Catalog cached but heap compacted |
| Re-hit peak (cached catalog) | 398 | Re-serialization spike |
| Re-hit steady state | 127 | Settles back |

**On Windows, the peak (~550 MB) would stay resident** because V8 doesn't return memory to the OS as aggressively, giving the 600–900 MB idle footprint the user observed.

---

## Potential Solutions (not implemented — investigation only)

1. **Split the provider endpoint**: `/api/provider` returns only connected providers with their models (small payload). `/api/provider/catalog` returns all provider metadata without models (for the settings browser). This eliminates the 5254-model serialization on every call.

2. **Lazy model loading**: Only load models for a specific provider when requested (`/api/provider/:id/models`). The model picker already filters to connected providers — fetch their models on connect, not on every bootstrap.

3. **Server-side filtering**: Add query params (`?connected=true`, `?fields=metadata`, `?provider=openai`) so the frontend doesn't receive 5254 models when it needs 2 providers' worth.

4. **Avoid `toPublicInfo` deep clone**: The `JSON.parse(JSON.stringify(...))` in `toPublicInfo` doubles memory during serialization. A targeted serializer that skips functions without a full clone would reduce peak memory.

5. **Lazy SDK loading**: The `BUNDLED_PROVIDERS` map (25+ AI SDK packages) uses dynamic `import()`, which is already lazy. But the provider service still imports and transforms all 144 providers' model definitions eagerly. Moving model transformation to be per-provider-on-demand would reduce the initial spike.

6. **Windows-specific**: Force periodic GC (`Bun.gc(true)` on an interval) or call `process.memoryUsage()` to hint V8 to decommit. This is a workaround, not a fix — the real solution is reducing the working set.

---

## Part 2: Windows Memory — Mac vs Windows Discrepancy

### The question

Why does the Windows sidecar settle at ~1 GB while the Mac sidecar settles at ~127–253 MB? Is this the same root cause as the provider catalog, or something else?

### What was measured (Mac)

All measurements above were on macOS arm64. The key finding: the provider catalog load creates a **transient** peak of ~550 MB that GC reclaims to ~127 MB within 15–30 seconds on Mac.

### What was NOT measured (Windows)

No Windows-side memory measurement was performed in this investigation. The ~1 GB idle footprint on Windows is the user's report. The explanation below is a hypothesis based on known V8 platform behavior — it needs to be confirmed by running the equivalent measurements on the Windows machine.

### Hypothesis: V8 memory return behavior differs by platform

On Unix (macOS/Linux), V8 uses `madvise(MADV_DONTNEED)` to return freed pages to the OS, which immediately reduces RSS. On Windows, V8 uses `VirtualFree(MEM_DECOMMIT)`, which marks pages as free in the process's virtual address space but does not always reduce the committed memory footprint the OS reports. This is a well-documented V8/JSC platform difference.

If this hypothesis is correct, the Windows sidecar hits the same ~550 MB peak from catalog parsing/serialization, but the memory stays committed (not returned to the OS), so Task Manager / `Get-Process` reports ~1 GB even at idle.

### Alternative explanations that cannot be ruled out from Mac alone

1. **Windows-specific module loading overhead**: The compiled sidecar bundles all native modules (zstd-wasm, pdfjs, node-pty, etc.). Native module loading on Windows may have a larger memory footprint than on macOS.
2. **Bun's Windows runtime overhead**: Bun's JIT and runtime on Windows may have a larger baseline footprint than on macOS arm64.
3. **Different catalog size on Windows**: The models.dev cache is fetched at runtime, not bundled. If the Windows machine has a newer/larger cache, the peak could be higher.
4. **Electron overhead**: The user's 1 GB figure may include the Electron wrapper process, not just the sidecar. Electron's Chromium renderer + Node main process can add 200–400 MB on top of the sidecar.

### What the Windows agent should measure

To confirm or refute the hypothesis, the following measurements are needed on the Windows machine:

```powershell
# 1. Find the buddy-backend sidecar process
Get-Process buddy-backend -ErrorAction SilentlyContinue | Select-Object Id, WorkingSet64, PrivateMemorySize64, VirtualMemorySize64

# 2. Start the sidecar manually and measure at each stage:
#    a) Right after boot (server listening, before any API call)
#    b) After hitting /api/provider (triggers catalog load)
#    c) 30 seconds later (after GC)
#    d) 2 minutes later (steady state)

# 3. Hit the provider endpoint and watch the memory:
Invoke-RestMethod "http://127.0.0.1:3000/api/provider" -OutFile providers.json
# Measure (Get-Process buddy-backend).WorkingSet64 immediately after, then every 10s for 2 min

# 4. Check if the 1 GB includes Electron:
Get-Process | Where-Object { $_.ProcessName -match "buddy|electron" } | Select-Object ProcessName, Id, WorkingSet64, PrivateMemorySize64
```

If the sidecar alone shows ~550 MB peak → ~127 MB settle, the hypothesis is confirmed and the 1 GB is from Electron + sidecar combined. If the sidecar alone stays at ~1 GB, there is a Windows-specific memory retention issue that needs deeper investigation (possibly Bun's Windows allocator or V8's Windows page management).

### Are the memory issue and CI build time issue the same root cause?

**No. They are separate problems with separate root causes.**

- **Memory issue**: The provider catalog loading + V8 Windows memory return behavior. Root cause is in `vendor/opencode/packages/opencode/src/provider/provider.ts` and `vendor/opencode/packages/core/src/models-dev.ts`.
- **CI build time issue**: Dependency tree growth and cache invalidation in GitHub Actions. Root cause is in `package.json` catalog bumps and `.github/workflows/publish.yml`. See Part 3 below.

The provider catalog is bundled into the sidecar binary at compile time (as embedded JSON in the bundle), but its size (2.3 MB) is negligible compared to the 82 MB binary. The CI build time is dominated by `bun install` and cache operations, not by the catalog or binary size.

---

## Part 3: CI Build Time Investigation — Windows Electron Build

### The question

Between releases 0.38/0.39 and 0.40+, the Windows electron build time in GitHub Actions increased from ~8–13 minutes to ~17–21 minutes. What changed?

### Methodology

Used the GitHub Actions API (via `gh` CLI) to retrieve step-level timing for the `build-electron-windows-x64` job across all releases from 0.34 to 0.43. Then cross-referenced with `git diff` of the workflow file, `package.json`, and `bun.lock` between the release commits.

### Data: Windows build times by release

Retrieved via `gh run view <run-id> --repo prashantbhudwal/buddy --json jobs --jq '.jobs[] | select(.name == "build-electron-windows-x64")'` for each release run.

**Full release list with run IDs:**

| Release | Run ID | Date |
|---------|--------|------|
| 0.0.34 | 26184245122 | 2026-05-20 |
| 0.0.35 | 26624640449 | 2026-05-29 |
| 0.0.36 | 26641420563 | 2026-05-29 |
| 0.0.37 | 26675423095 | 2026-05-30 |
| 0.0.38 | 26910165273 | 2026-06-03 |
| 0.0.39 | 26932344091 | 2026-06-04 |
| 0.0.40 | 26934266814 | 2026-06-04 |
| 0.0.41 | 27844372856 | 2026-06-19 |
| 0.0.42 | 27917348167 | 2026-06-21 |
| 0.0.43 | 27949943367 | 2026-06-22 |

### Step-level timing breakdown

Parsed from the GitHub Actions API step timestamps. Times are in minutes.

| Release | cache restore 1 | cache restore 2 | bun install | electron-builder | post-cache save 1 | post-cache save 2 | **job total** |
|---------|-----------------|-----------------|-------------|-----------------|-------------------|-------------------|---------------|
| 0.0.34 | 0.0m | 0.0m | 4.4m | 1.6m | 0.1m | 1.2m | **7.8m** |
| 0.0.35 | 2.9m | 0.1m | 0.8m | 1.6m | 0.6m | 1.8m | **8.5m** |
| 0.0.36 | 4.0m | 0.0m | 1.1m | 1.8m | 0.1m | 4.9m | **12.7m** |
| 0.0.37 | 2.8m | 0.1m | 2.3m | 1.7m | 0.1m | 2.6m | **10.0m** |
| 0.0.38 | 3.6m | 0.1m | 2.3m | 1.5m | 0.1m | 3.2m | **11.5m** |
| 0.0.39 | 3.5m | 0.1m | 3.5m | 1.6m | 0.1m | 3.9m | **13.2m** |
| 0.0.40 | 4.2m | 0.0m | 1.6m | 1.6m | 0.1m | **13.0m** | **21.2m** |
| 0.0.41 | 0.0m | 0.0m | **9.4m** | 3.1m | 0.1m | 2.5m | **15.9m** |
| 0.0.42 | 3.9m | 0.1m | **7.1m** | 3.1m | 0.1m | 4.1m | **18.9m** |
| 0.0.43 | 3.5m | 0.1m | **7.3m** | 3.1m | 0.1m | 2.4m | **17.1m** |

### Key observations

1. **The `electron-builder` step (actual packaging) is stable at 1.5–3.1 min throughout.** It is NOT the cause of the increase.

2. **Two separate jumps occurred:**
   - **0.39 → 0.40**: The `Post Run actions/cache@v5` step (saving the electron-builder cache) spiked from 3.9m to **13.0m**. This is the single biggest jump in the dataset (+8 min).
   - **0.40 → 0.41**: `bun install` permanently jumped from ~2m to **7–9m** and never came back down. The `electron-builder` step also went from 1.6m to 3.1m.

3. **The Windows sidecar build job (`build-sidecar-windows-x64`) is stable at ~1 min throughout** — it is not affected.

### Root cause: 0.40 cache spike (Post Run actions/cache)

The `Post Run actions/cache@v5` step saves the electron-builder cache. Its cache key is:
```yaml
key: ${{ runner.os }}-electron-builder-${{ hashFiles('packages/desktop-electron/package.json') }}
```

The commit `610b35ca7a` ("feat(desktop): Add signed recovery policy for updates") between 0.39 and 0.40 modified `packages/desktop-electron/package.json` (added two new scripts: `finalize:recovery-policy` and `smoke:recovery-policy`). This changed the hash of `package.json`, which **invalidated the electron-builder cache key**.

When the cache key misses on Windows, `actions/cache@v5` has to re-upload the entire electron-builder toolchain cache from scratch. On Windows runners, this upload is slow (the electron-builder cache includes large binary toolchains — nsis, wine, etc.). The 13-minute post-cache time is the cache upload, not the build.

Git diff confirming the change:
```diff
# commit 610b35ca7a, packages/desktop-electron/package.json
+    "finalize:recovery-policy": "bun ./scripts/finalize-recovery-policy.ts",
+    "smoke:recovery-policy": "bun ./scripts/smoke-recovery-policy.ts",
```

This is a **one-time cache invalidation** — subsequent releases with the same `package.json` hash should restore the cache. The 0.41 run shows post-cache back down to 2.5m, confirming this.

### Root cause: 0.41+ permanent `bun install` increase

The commit range between 0.40 and 0.41 (`e90aa1fb5d..e0018a10a5`) bumped multiple catalog dependencies:

```diff
# package.json catalog changes, 0.40 → 0.41
-    "@effect/opentelemetry": "4.0.0-beta.66",
-    "@effect/platform-node": "4.0.0-beta.66",
-    "@effect/sql-sqlite-bun": "4.0.0-beta.66",
+    "@effect/opentelemetry": "4.0.0-beta.74",
+    "@effect/platform-node": "4.0.0-beta.74",
+    "@effect/sql-sqlite-bun": "4.0.0-beta.74",
+    "@hono/standard-validator": "0.2.0",
-    "@lydell/node-pty": "1.2.0-beta.10",
+    "@lydell/node-pty": "1.2.0-beta.12",
-    "@opentui/core": "0.2.15",
-    "@opentui/keymap": "0.2.15",
-    "@opentui/solid": "0.2.15",
+    "@opentui/core": "0.3.2",
+    "@opentui/keymap": "0.3.2",
+    "@opentui/solid": "0.3.2",
+    "sst": "4.13.1",
-    "effect": "4.0.0-beta.66",
+    "effect": "4.0.0-beta.74",
# Also added:
+    "drizzle-orm": "catalog:"  (in overrides)
```

The `bun.lock` diff was 714 insertions, 330 deletions — a substantial dependency tree change. The new dependency tree is larger (especially `@opentui` 0.3.x and `sst`), which permanently increases `bun install` time on all platforms. The `electron-builder` step also went from 1.6m to 3.1m, likely because the larger `node_modules` tree means more files to package into the asar archive.

### Why the Windows build is slower than Mac builds

For reference, the Mac electron build times for the same releases:

| Release | Mac ARM64 electron | Mac x64 electron | Windows electron |
|---------|-------------------|------------------|-----------------|
| 0.0.43 | 3.5m | 4.7m | 17.1m |
| 0.0.42 | 3.9m | 4.9m | 18.9m |
| 0.0.41 | 4.0m | 4.1m | 15.9m |

The Windows build is 3–4x slower than Mac builds even for the same steps. This is consistent with known GitHub Actions runner performance differences:
- Windows runners are generally slower for I/O-heavy operations (npm/bun install, file caching, asar packaging).
- The Windows runner image (`windows-2025-vs2026`) is newer and may have less optimized caching.
- The electron-builder Windows target (nsis installer) requires downloading additional toolchains (nsis, wine-like compatibility layers) that Mac doesn't need.

### Runner image change

The Windows runner was changed from `windows-2025` to `windows-2025-vs2026` in commit `ae18f1d540` ("chore(release): Move actions to Node 24"), which landed in release 0.0.35. This is before the build time jump, so it is not the direct cause, but it may have contributed to the baseline being higher than the pre-0.35 era.

### CI build time summary

| Jump | Release | Cause | Type |
|------|---------|-------|------|
| +8 min | 0.39 → 0.40 | `package.json` hash change invalidated electron-builder cache; 13-min cache upload on Windows | One-time (cache re-warm) |
| +5 min | 0.40 → 0.41 | `effect` beta.66→beta.74, `@opentui` 0.2→0.3, added `sst`; 714 new lines in `bun.lock` | Permanent (larger dep tree) |
| Baseline 3–4x | All releases | Windows runner I/O slower than Mac runners | Structural |

**None of this is related to the provider catalog or the memory issue.** The catalog is 2.3 MB of JSON embedded in an 82 MB binary — it has negligible impact on compile time or binary size. The CI time increase is entirely from dependency tree growth and cache operations.

---

## Part 4: Intended CI Guardrails

The user wants CI to fail if these regressions occur again, so they are caught before release rather than discovered on a user's machine.

### Intended guards

1. **Provider response size check (Linux smoke job)**: The existing `smoke-compiled-sidecar` job on `ubuntu-latest` already starts the sidecar. Add a step that hits `/api/provider` and asserts the response size is below a threshold (e.g. < 1 MB). This would have caught the 3.88 MB / 5254-model regression directly. Platform-independent — the response size is the same on all platforms.

2. **Sidecar memory check (Windows runner)**: The `build-electron-windows-x64` job already runs on `windows-2025-vs2026` and already has the compiled sidecar binary as a downloaded artifact. Add post-build steps that:
   - Start the sidecar in the background
   - Hit `/api/provider` to trigger catalog load
   - Measure `WorkingSet64` via PowerShell (`(Get-Process buddy-backend).WorkingSet64`)
   - Assert peak memory < threshold (e.g. < 400 MB)
   - Wait 30s, measure steady-state memory, assert < threshold (e.g. < 250 MB)
   - Kill the sidecar

   This catches the Windows-specific memory retention regression on the actual platform where it occurs.

3. **Response payload audit (Linux smoke job)**: Assert that the number of models in the `/api/provider` response is reasonable for a default install (e.g. < 500 when only 2 providers are connected). This catches the root cause — shipping the full catalog when only connected providers are needed — regardless of response size.

### Not guarded

- **CI build time**: GitHub Actions runner performance is too variable for hard time thresholds. A `bun.lock` line count or dependency count check could be added as a proxy, but it would be noisy and low-signal. The build time increase is a one-time cache invalidation (0.40) plus a permanent dependency tree growth (0.41+) — both are understood and not ongoing regressions.
- **Mac memory**: Not relevant — Mac settles to 127 MB, well within any reasonable threshold. The problem is Windows-specific.
