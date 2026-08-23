# DF1 Dogfooding Log

## 2024-XX-XX - Resource Sync Issue Between Prod and Dev

### Observation (verbatim from scratchpad)
"So right now there is a issue in the app where in terms of resources, where if I if I if I b if I build a resource that on prod, it goes tail on dev and if I build a resource on dev it goes stale on prod. So it's a weird issue that I'm encountering right now."

### Summary
- Building a resource on **prod** → resource becomes **stale on dev**
- Building a resource on **dev** → resource becomes **stale on prod**

### Root Cause Analysis (via exploration subagent)

#### 1. Timestamp-Based Staleness Detection (Primary Cause)
**File:** `packages/buddy/src/resources/resource-registry-service.ts:317-325`
```typescript
const sourceChanged =
  metadata.sourceMtimeMs !== undefined && metadata.sourceSizeBytes !== undefined
    ? metadata.sourceMtimeMs !== Number(sourceStat.mtimeMs) ||
      metadata.sourceSizeBytes !== Number(sourceStat.size)
    : false
if (status === RESOURCE_PACK_STATUS_READY && sourceChanged) {
  status = "stale"
```
**Problem:** Resources marked "stale" when mtime/size don't match exactly. Filesystem timestamp precision differs across environments (HFS+ vs NTFS vs ext4), and BigInt→Number conversion causes precision loss.

**Same issue in:** `packages/buddy/src/resource-packs/storage.ts:43-71`

#### 2. In-Memory Caches Without Environment Isolation
**Files:**
- `packages/buddy/src/resource-packs/service.ts:26` - `inFlightBuilds` Map
- `packages/buddy/src/resources/resource-registry-service.ts:69` - `inFlightResourcePreparation` Map
- `packages/buddy/src/config/runtime/opencode-sync.ts:14-15` - config caches

**Problem:** Module-level Maps persist across requests. If prod/dev share these caches, they can interfere.

#### 3. Resource Pack Key Generation Using Relative Path
**File:** `packages/buddy/src/resource-packs/classification.ts:107-120`
**Problem:** Key derived from relative path between directory and sourcePath. If prod/dev access same project via different absolute paths (symlinks, mounts), keys differ.

#### 4. Source Path Storage vs. Comparison Mismatch
**File:** `packages/buddy/src/resource-packs/storage.ts:48`
```typescript
if (metadata.source_path !== input.sourcePath) return undefined
```
**Problem:** Absolute path stored at build time. If environments resolve same file to different absolute paths (symlinks, case sensitivity), comparison fails.

#### 5. Build Key Uses Root Path Without Normalization
**File:** `packages/buddy/src/resource-packs/service.ts:78`
**Problem:** `buildKey = input.packPaths.rootPath` not normalized across environments.

### Recommended Investigation
1. Check filesystem timestamp handling - add logging to compare actual `mtimeMs` values
2. Verify path consistency - ensure prod/dev use identical absolute paths
3. Check for symlinks: `readlink -f` on both environments
4. Investigate if prod/dev share the same Buddy process or have separate caches

### Status
🟡 Root causes identified - requires verification
