# Upstream Fetch Algorithm (Buddy + Vendored OpenCode)

This runbook defines the repeatable process to sync `vendor/opencode` while preserving local Buddy adaptations and avoiding vendor patch drift.

Completion means that the upstream snapshot and Buddy migrations work seamlessly through Buddy's real product paths. Mechanically updating vendor files while Buddy remains broken is not completion.

---

## 1. Environment Inputs & Setup

Use an isolated Buddy checkout or worktree that is already available and clean. Confirm paths and remotes rather than assuming their names:

```sh
git status --short
git remote -v
git -C ../opencode status --short
git -C ../opencode remote -v
```

The local OpenCode clone may be dirty. Read tags and Git objects from it without changing its worktree. The Buddy remote is normally `opencode`, but use the name that `git remote -v` reports.

After inspection, set `OPENCODE_DIR` to the clone path, `UPSTREAM_REMOTE` to the verified Buddy remote, and `TAG` to the selected stable tag.

---

## 2. Core Rules & Boundary Invariants

1. **Vendor Cleanliness:** Do not fork or patch `vendor/opencode/**` directly. Place Buddy-specific behavior, shims, and overlays in Buddy-owned packages (`packages/buddy`, `packages/opencode-adapter`, build layer).
2. **Vendor Guard:** Vendor changes are guarded by local hooks and `bun lint`. An intentional sync records the selected tag, commit, and tree in `script/opencode-upstream.json`; the guard accepts the complete vendor tree only when it matches that record. `ALLOW_VENDOR_SYNC=1` does not bypass the guard.
3. **Compatibility Seams:** Keep runtime compatibility strictly isolated to designated boundary files:
   - Plugin `ask()` compatibility: `packages/buddy/src/opencode-runtime/plugin-ask-compat.ts`
   - LLM event normalization: `packages/opencode-adapter/src/llm.ts`
   - Session identity and permission normalization: `packages/opencode-adapter/src/session.ts` and `session-live.ts`
   - Tool UI decorations: HTTP/SSE boundaries (`packages/buddy/src/http/opencode-event-stream.ts`), never in vendored runtime methods.
4. **No Premature Translation Shims:** For adopted upstream v2 capabilities, migrate connected Buddy layers (backend, SDK, frontend) directly to the v2 contract rather than maintaining leaky v2-to-v1 conversion bridges. Do **not** add wrappers that translate vendor v2 APIs, types, events, messages, permission model, or runtime behavior back into Buddy v1 shapes. Dual v1/v2 protocols, translation DTOs, and event reassembly whose purpose is to avoid completing an adopted v2 migration are forbidden. If a v2 surface is too incomplete for an end-to-end overhaul, keep that capability wholly on the existing v1 path, record the blocker, and defer it. `@buddy/opencode-adapter` remains the in-process embedding seam; it must not disguise v2 as v1.
5. **Vendor desktop/app parity:** If the stable OpenCode desktop/app uses v2 for a product surface, Buddy must migrate that same surface to v2. The vendor app's SDK calls, state, events, routes, and runtime wiring are the adoption map. A deferral is valid only when the stable vendor app itself still uses v1 for that surface, or when Buddy-specific functionality has no v2 equivalent; record source evidence either way.
6. **Tests migrate with the product surface:** Do not treat the pre-fetch Buddy test suite as a fixed compatibility contract. For each newly adopted upstream behavior Buddy exposes, add or extend focused Buddy-level coverage for the new v2 contract and its failure/recovery behavior. Update fixtures to current v2 schemas. Remove tests whose only purpose is deleted v1 compatibility. Upstream vendor tests are evidence, not a substitute. Do not run the full vendor suite.
7. **Electron verification:** Build and run focused desktop smoke scripts. Operate the app only when the user explicitly requests or approves browser or computer-use verification. Record any unverified interactive paths as limits of the fetch.
8. **Dirty-tree safety:** Assume the working tree is dirty. Inspect and preserve unrelated edits; never reset, revert, or clean files that are outside the sync scope.
9. **Helper-script distrust:** Treat helper scripts as convenience only, not as source of truth. Independently inspect remotes, tags, trees, and command output before choosing a snapshot.

These adoption rules guide the compatibility audit. If the selected tag activates a new v2 path, trace it through Buddy and migrate the connected surface. Existing v2 adoption debt should be recorded separately rather than silently included in a minor snapshot fetch.

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
- Note date, branch, starting `git status --short`, target tag, and which upstream changes affect Buddy call paths.
- Do **not** treat a fetch diary as standing procedure. Policy lives in this guide. Git history archives completed syncs; do not keep `docs/ops/logs/upstream-fetch.*` as living runbooks.

### Step 2: Capture Baseline
```sh
git branch --show-current
git status --short
```
Preserve unrelated edits. Reuse a clean isolated worktree when one exists; do not create another worktree solely to repeat the same isolation.

### Step 3: Verify Upstream Delta & Target Tag
```sh
git ls-remote --tags "$UPSTREAM_REMOTE" "refs/tags/$TAG"
git -C "$OPENCODE_DIR" rev-parse "$TAG^{commit}"
git -C "$OPENCODE_DIR" rev-parse "$TAG^{tree}"
```
- Fetch a missing selected tag explicitly. Verify its target against the remote tag before copying it; avoid a broad `--tags` fetch unless needed.
- Compare Buddy's vendored version (`vendor/opencode/packages/opencode/package.json`) against the target tag.
- If the vendor tree already matches the target tag, stop. Version strings alone do not prove equality.
- For a combined v2 adoption sync, inspect the forward-looking branch tips without treating them as vendor input:
  ```sh
  git -C "$OPENCODE_DIR" fetch upstream dev v2
  git -C "$OPENCODE_DIR" log -1 --format='%H %cI %s' upstream/dev upstream/v2
  ```
  Record the three-way v2 status and concrete desktop/server call paths in the sync evidence. Branch tips are horizon evidence, not permission to vendor unreleased code.

### Step 4: Copy the Exact Tag Into the Isolated Buddy Worktree
Extract the tag outside the repository, then replace the old vendor snapshot:
```sh
SNAPSHOT_DIR=$(mktemp -d /tmp/buddy-opencode-snapshot-XXXXXX)
git -C "$OPENCODE_DIR" archive "$TAG" | tar -x -C "$SNAPSHOT_DIR"
rsync -a --delete --exclude=.git --exclude=node_modules --exclude=dist --exclude=.turbo "$SNAPSHOT_DIR/" vendor/opencode/
```

`git archive` gives the selected tag without touching a dirty upstream worktree. A plain extraction over the old vendor directory leaves upstream deletions behind. Compare the result against the selected tag's tree, including files ignored by Buddy's `.gitignore`, and update `script/opencode-upstream.json`. If Buddy ignores a new tracked upstream path, add a narrow ignore exception so the path can enter the mirror. The guard must pass on the resulting worktree without bypass variables.

Then sync dependency metadata and install:
```sh
bun run vendor:sync-catalog
bun run vendor:check-catalog
bun install
```
Review upstream root `overrides` and carry over any version pin required by the vendored runtime. Audit each Buddy-owned dependency patch when its package version changes: trace the behavior it protected through current Buddy call paths and the new package. Remove a patch if upstream already covers the relevant path or Buddy no longer uses it. Rebase a still-needed patch; if upstream also patches that package version, compose both changes into one Buddy-owned patch and keep the upstream patch in the vendor mirror unchanged. Confirm every patch mapping points to an existing file, then test the affected behavior through the installed package.

### Step 5: Audit Buddy Integration
Compare changed upstream runtime files against Buddy imports and exercised routes. Run the affected package scripts. Pay particular attention to:
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

### Step 6: Verify No Stray Vendor Patches
Confirm no Buddy runtime overrides leaked into vendored OpenCode:
```sh
rg -n "OPENCODE_MIGRATION_DIR|BUDDY_RUNTIME_ROOT" vendor/opencode/packages/opencode/src
```

### Step 7: Verification
Run repository gates in the required order, then focused package tests and builds:
```sh
bun lint
bun typecheck
bun run --cwd packages/opencode-adapter test
bun run --cwd packages/buddy test:session
bun run --cwd packages/buddy test:parity
bun run --cwd packages/web test:parity
bun run --cwd packages/buddy build:node
bun run --cwd packages/desktop-electron build
bun run --cwd packages/desktop-electron smoke:backend-utility
```

Use package scripts for other affected tests. Run tests that mutate shared config in isolated processes when their group script shares a process. Keep runtime and notebook roots temporary. Do not run raw `bun test`, the vendor suite, or concurrent typechecks. Run `bun fmt` only after implementation is complete and the user is satisfied.

Also run focused Buddy regressions for the sync-risk surfaces: missing-session prompt/command rejection before state mutation, nested-session false-404 prevention, `BUDDY_RUNTIME_ROOT`/XDG bootstrap, overlay isolation, SSE `toolUi` decoration, and agent lookup without hand-built `Agent.Info` values. Keep deleted regression tests for route envelopes, overlay isolation, and desktop assets; restore or extend them when a sync touches those surfaces.

### Step 8: HTTP Route & SSE Smoke
If HTTP behavior changed, start a Buddy backend with temporary state roots and verify touched endpoints with `curl` (see `docs/guides/buddy-http-curl-smoke.md`):
- `GET /api/health` and `GET /api/healthz`
- Session create and asynchronous prompt flow
- SSE `message.part.updated` tool UI decorations
- Negative error status codes and `{ "error": string }` envelopes.

### Step 9: Exact Snapshot Check
```sh
git -C "$OPENCODE_DIR" rev-parse "$TAG^{tree}"
bun ./script/vendor-guard.ts --worktree
```
Compare the vendor Git tree with the recorded upstream tree. A directory diff against the clone's current worktree is not evidence when that clone is dirty or on another revision.

### Step 10: Prune Compatibility Shims
Remove any temporary adapter wrappers that merely disguise upstream API improvements.

### Step 11: Report Evidence
Summarize the selected tag and tree, Buddy-owned changes, test and build results, unverified product paths, and remaining risks. Commit or open a PR only when the user requests it. Do not add a durable `docs/ops/logs/upstream-fetch.*` diary.

---

## 4. Buddy Smoke Checklist

Verify affected paths through focused tests and smoke scripts. If the user authorizes interactive app verification, exercise these paths in the desktop app:
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
