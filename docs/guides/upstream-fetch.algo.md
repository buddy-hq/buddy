# Upstream Fetch Algorithm (Buddy + Vendored OpenCode)

This runbook defines the repeatable process to sync `vendor/opencode` while preserving local Buddy adaptations and avoiding vendor patch drift.

Completion means that the upstream snapshot and Buddy migrations work seamlessly through Buddy's real product paths. Mechanically updating vendor files while Buddy remains broken is not completion.

---

## 1. Environment Inputs & Setup

Set environment variables before starting:

```sh
export BUDDY_DIR="${PWD}"                     # Path to Buddy repository root
export OPENCODE_DIR="../opencode"             # Path to clean local OpenCode clone
export UPSTREAM_REMOTE="opencode-upstream"    # Upstream git remote
```

---

## 2. Core Rules & Boundary Invariants

1. **Vendor Cleanliness:** Do not fork or patch `vendor/opencode/**` directly. Place Buddy-specific behavior, shims, and overlays in Buddy-owned packages (`packages/buddy`, `packages/opencode-adapter`, build layer).
2. **Vendor Guard:** Vendor changes are guarded by local git hooks. Use `ALLOW_VENDOR_SYNC=1` on intentional, validated vendor sync commits.
3. **Compatibility Seams:** Keep runtime compatibility strictly isolated to designated boundary files:
   - Plugin `ask()` compatibility: `packages/buddy/src/opencode-runtime/plugin-ask-compat.ts`
   - LLM event normalization: `packages/opencode-adapter/src/llm.ts`
   - Session identity and permission normalization: `packages/opencode-adapter/src/session.ts` and `session-live.ts`
   - Tool UI decorations: HTTP/SSE boundaries (`packages/buddy/src/http/opencode-event-stream.ts`), never in vendored runtime methods.
4. **No Premature Translation Shims:** For adopted upstream v2 capabilities, migrate connected Buddy layers (backend, SDK, frontend) directly to the v2 contract rather than maintaining leaky v2-to-v1 conversion bridges. Do **not** add wrappers that translate vendor v2 APIs, types, events, messages, permission model, or runtime behavior back into Buddy v1 shapes. Dual v1/v2 protocols, translation DTOs, and event reassembly whose purpose is to avoid completing an adopted v2 migration are forbidden. If a v2 surface is too incomplete for an end-to-end overhaul, keep that capability wholly on the existing v1 path, record the blocker, and defer it. `@buddy/opencode-adapter` remains the in-process embedding seam; it must not disguise v2 as v1.
5. **Vendor desktop/app parity:** If the stable OpenCode desktop/app uses v2 for a product surface, Buddy must migrate that same surface to v2. The vendor app's SDK calls, state, events, routes, and runtime wiring are the adoption map. A deferral is valid only when the stable vendor app itself still uses v1 for that surface, or when Buddy-specific functionality has no v2 equivalent; record source evidence either way.
6. **Tests migrate with the product surface:** Do not treat the pre-fetch Buddy test suite as a fixed compatibility contract. For each newly adopted upstream behavior Buddy exposes, add or extend focused Buddy-level coverage for the new v2 contract and its failure/recovery behavior. Update fixtures to current v2 schemas. Remove tests whose only purpose is deleted v1 compatibility. Upstream vendor tests are evidence, not a substitute. Do not run the full vendor suite.
7. **Hands-on Electron completion gate:** Lint, typecheck, unit/contract tests, and builds are not completion. After automated gates, operate the Buddy Electron app: open a real session, prompt through completion, exercise representative tools/permissions, Bench/files, provider/config, navigation, and reconnect. If the vendor desktop uses v2 for a surface, Buddy desktop must use v2 for that surface while preserving Buddy product behavior.
8. **Dirty-tree safety:** Assume the working tree is dirty. Inspect and preserve unrelated edits; never reset, revert, or clean files that are outside the sync scope.
9. **Helper-script distrust:** Treat helper scripts as convenience only, not as source of truth. Independently inspect remotes, tags, trees, and command output before choosing a snapshot.

These four adoption rules (shims, desktop parity, tests, hands-on gate) are standing policy. They originated in the 2026-07-10 vendor fetch; they are not a resumable diary for that run.

### v2 adoption status and forward horizon

For every major v2 API, record one of these three statuses with concrete call-path evidence:

| Status | Required evidence | Disposition |
|---|---|---|
| **stable desktop active** | Selected stable tag's desktop call site, generated SDK method and URL, server handler/service, and event/reply contract all use v2 | Mandatory migration in the current sync |
| **v2-branch desktop active** | Current `upstream/v2` desktop calls the v2 route and consumes its events/types; imports alone do not count | Track as upcoming migration with named Buddy blockers and a test plan |
| **backend-ready-only** | SessionV2, PermissionV2, PluginV2, or another v2 service/handler exists, but neither desktop path activates it | Defer; keep the capability wholly on v1 without compatibility shims |

Inspect `upstream/dev` and `upstream/v2` as forward-looking horizon evidence. The selected stable tag remains the vendored source unless the developer explicitly requests an untagged branch; do not vendor unreleased branch code merely because it exists. Apply the status check to sessions/prompts, session reads, permissions, plugin hooks/tool registration, tools and tool-input events, agents, config, skills, messages, commands, MCP, auth, and server routes.

---

## 3. Execution Algorithm

### Step 1: Record Intent (Optional Scratch, Not Policy)
- Note date, branch, starting `git status --short`, target tag, and whether this is a mechanical sync or a combined v2 adoption.
- Do **not** treat a fetch diary as standing procedure. Policy lives in this guide. Git history archives completed syncs; do not keep `docs/ops/logs/upstream-fetch.*` as living runbooks.

### Step 2: Capture Baseline
```sh
git branch --show-current
git status --short
```
Ensure the starting state is recorded in the sync log.

### Step 3: Verify Upstream Delta & Target Tag
```sh
git fetch "$UPSTREAM_REMOTE" --tags
git -C "$OPENCODE_DIR" fetch origin --tags

# Inspect latest stable tags
git -C "$OPENCODE_DIR" tag --sort=-version:refname | head -n 10
```
- Compare Buddy's vendored version (`vendor/opencode/packages/opencode/package.json`) against the target tag.
- If vendored files already match the target tag, stop.
- For a combined v2 adoption sync, inspect the forward-looking branch tips without treating them as vendor input:
  ```sh
  git -C "$OPENCODE_DIR" fetch upstream dev v2
  git -C "$OPENCODE_DIR" log -1 --format='%H %cI %s' upstream/dev upstream/v2
  ```
  Record the three-way v2 status and concrete desktop/server call paths in the sync evidence. Branch tips are horizon evidence, not permission to vendor unreleased code.

### Step 4: Dry-Run in Temporary Worktree
Create an isolated worktree from `HEAD`:
```sh
TMP_WORKTREE=$(mktemp -d /tmp/buddy-vendor-check-XXXXXX)
git worktree add -b "codex/vendor-check-$(date +%Y%m%d)" "$TMP_WORKTREE" HEAD
```

Inside `$TMP_WORKTREE`:
1. Extract the target tag snapshot into `vendor/opencode`:
   ```sh
   git -C "$OPENCODE_DIR" archive <tag> | tar -x -C "$TMP_WORKTREE/vendor/opencode"
   ```
2. Sync the root workspace catalog and install:
   ```sh
   bun run vendor:sync-catalog
   bun install
   ```
3. Run verification gates:
   ```sh
   bun typecheck
   bun lint
   bun run --cwd packages/buddy test:contracts
   bun run --cwd packages/web test:contracts
   bun run --cwd packages/buddy build:node
   bun run --cwd packages/desktop-electron build
   bun run --cwd packages/desktop-electron smoke:backend-utility
   ```
4. Audit key Buddy compatibility hotspots:
   - Promise vs. Effect return styles in `plugin-ask-compat.ts` and `buddy-tool-shim.ts`.
   - Structural parsing in `llm.ts` without reliance on upstream internal event-tag unions.
   - Dynamic tool registration and permission toggle visibility.
   - Electron asset paths (`publicDir`, loading screen assets).
   - Prompt or command sent before the target session exists must fail before mutating Buddy state.
   - Nested sessions in the same project must not produce a false `404` on prompt send.
   - `BUDDY_RUNTIME_ROOT` and XDG bootstrap must be set before any global storage-path read.
   - Agent, subagent, tool, config, and permission overlays must remain isolated across directory changes and runtime disposal/recreation.
   - SSE `message.part.updated` frames must retain Buddy `toolUi` decoration at the Buddy-owned event-stream boundary.
   - Do not hand-build upstream `Agent.Info`-shaped values when a Buddy agent id or Buddy-owned lookup path is sufficient.

### Step 5: Verify No Stray Vendor Patches
Confirm no Buddy runtime overrides leaked into vendored OpenCode:
```sh
rg -n "OPENCODE_MIGRATION_DIR|BUDDY_RUNTIME_ROOT" "$TMP_WORKTREE/vendor/opencode/packages/opencode/src"
```

### Step 6: Apply Validated Snapshot to Workspace
Copy validated vendor code and root configuration back to the main workspace:
```sh
rsync -a --delete "$TMP_WORKTREE/vendor/opencode/" "$BUDDY_DIR/vendor/opencode/"
bun run vendor:sync-catalog
```
Carry over any required root workspace edits (`package.json`, `bun.lock`).

### Step 7: Re-link Dependencies
```sh
bun install
```

### Step 8: Post-Sync Validations in Main Workspace
Execute validation gates in the primary workspace:
```sh
bun typecheck
bun lint
bun run --cwd packages/buddy test:contracts
bun run --cwd packages/web test:contracts
bun run --cwd packages/buddy build:node
bun run --cwd packages/desktop-electron build
bun run --cwd packages/desktop-electron smoke:backend-utility
```

Also run focused Buddy regressions for the sync-risk surfaces: missing-session prompt/command rejection before state mutation, nested-session false-404 prevention, `BUDDY_RUNTIME_ROOT`/XDG bootstrap, overlay isolation, SSE `toolUi` decoration, and agent lookup without hand-built `Agent.Info` values. Keep deleted regression tests for route envelopes, overlay isolation, and desktop assets; restore or extend them when a sync touches those surfaces.

### Step 9: HTTP Route & SSE Smoke
Start a real Buddy backend and verify touched endpoints with `curl` (see `docs/guides/buddy-http-curl-smoke.md`):
- `GET /api/health` and `GET /api/healthz`
- Session create and asynchronous prompt flow
- SSE `message.part.updated` tool UI decorations
- Negative error status codes and `{ "error": string }` envelopes.

### Step 10: Cleanliness Diff Against Clean Upstream
```sh
diff -qr --exclude .git --exclude node_modules --exclude .turbo --exclude dist "$OPENCODE_DIR" "$BUDDY_DIR/vendor/opencode"
```
Reject unexpected tracked source drift.

### Step 11: Prune Compatibility Shims
Remove any temporary adapter wrappers that merely disguise upstream API improvements.

### Step 12: Request Human Review
Summarize changes, test results, and risk assessment to the user before committing.

### Step 13: Two-Batch Commit
1. **Commit 1: Vendor Snapshot & Root Linking**
   ```sh
   git add vendor/opencode package.json bun.lock
   ALLOW_VENDOR_SYNC=1 git commit -m "chore(vendor): sync opencode upstream to <tag>"
   ```
2. **Commit 2: Buddy Adaptations**
   ```sh
   git add packages/ docs/
   git commit -m "refactor(buddy): adapt buddy to new opencode runtime"
   ```

### Step 14: Log Summary & Risk Ledger
Record commit hashes, vendor diff stats (`git diff --shortstat`), confirmed fixes, and remaining risks in the PR or commit message. Do not add a durable `docs/ops/logs/upstream-fetch.*` diary.

### Step 15: Clean Up Worktree
```sh
git worktree remove "$TMP_WORKTREE"
```

---

## 4. Minimum Buddy Smoke Checklist

Always verify these critical integration paths after a sync:
1. **Chat Send:** Send a prompt to an existing session via standard chat UI.
2. **Session 404:** Verify prompts to non-existent sessions return `404` without modifying local state.
3. **Permission Prompt:** Trigger a tool that requires permission and verify the UI prompt renders and answers correctly.
4. **File Writes:** Ensure workspace writes route through OpenCode's write runtime rather than raw Node `fs`.
5. **Tool Toggle:** Enable and disable a tool; verify tool availability updates dynamically without restarting the runtime.
6. **Desktop Assets:** Confirm logo and chat assets render in both packaged (`file:`) and dev (`http:`) modes.

---

## 5. Known Sync Traps

- **Promise vs. Effect:** Upstream runtime methods can change between Promise and Effect return signatures. Keep conversions localized in `plugin-ask-compat.ts`.
- **Event Tag Couplings:** Do not rely on upstream event enum unions in `packages/opencode-adapter/src/llm.ts`. Parse only fields Buddy uses.
- **Runtime Patches:** Never resolve issues by patching vendored runtime files. Retain session identity, permissions, and tool UI decorations in Buddy-owned adapter layers.
- **Vite `publicDir`:** Check asset paths if Electron quick-chat or loading assets fail to resolve.
