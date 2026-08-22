# Storage Cross-Contamination Incident - 2026-07-05

## Status

- Bad published release: `v0.0.48` in `prashantbhudwal/buddy-releases`.
- Release action already taken: `v0.0.48` was moved to draft and `v0.0.47` was restored as GitHub latest.
- Current GitHub latest after takedown: `v0.0.47`.
- Local symptom machine: `/Users/prashantbhudwal`.

## User-Visible Symptom

Production Buddy displayed a backend error in the chat composer:

```text
Error: no such column: replacement_seq
```

The stack pointed at `SessionContextEpoch.requestReplacement`, which updates
`session_context_epoch.replacement_seq`.

## Confirmed Bad Database

The failing production app resolved to this database:

```text
/Users/prashantbhudwal/.local/share/opencode/opencode.db
```

That database had a drifted `session_context_epoch` table:

```text
session_id, baseline, snapshot, baseline_seq
```

The current runtime expects:

```text
session_id, baseline, snapshot, baseline_seq, replacement_seq, revision, agent
```

The migration journal in that database marked the context epoch migrations as
complete even though the actual table was missing the later columns.

## Previous Good Behavior

`v0.0.47` and the parallel `~/Code/buddies/site` worktree used a Buddy-owned
runtime root:

```text
~/.buddy-runtime/xdg
```

Desktop set:

```text
BUDDY_RUNTIME_ROOT=~/.buddy-runtime/xdg
XDG_DATA_HOME=~/.buddy-runtime/xdg/data
XDG_CACHE_HOME=~/.buddy-runtime/xdg/cache
XDG_CONFIG_HOME=~/.buddy-runtime/xdg/config
XDG_STATE_HOME=~/.buddy-runtime/xdg/state
OPENCODE_DISABLE_CHANNEL_DB=1
```

Because those variables were set before vendored OpenCode booted, OpenCode's
runtime database lived under the Buddy-owned runtime namespace instead of the
machine-level OpenCode namespace:

```text
~/.buddy-runtime/xdg/data/opencode/opencode.db
```

That avoided collision with users who also run standalone OpenCode.

## Regression

The storage ownership rewrite removed the prod desktop `BUDDY_RUNTIME_ROOT` and
stopped forcing XDG roots for non-dev launches.

That allowed vendored OpenCode to use its default XDG paths:

```text
~/.local/share/opencode
~/.cache/opencode
~/.local/state/opencode
```

For `OPENCODE_CHANNEL=prod`, vendored OpenCode treats `prod` as a stable channel
and uses:

```text
~/.local/share/opencode/opencode.db
```

On the symptom machine, that database already existed from standalone or prior
OpenCode use and had a schema incompatible with the current Buddy-vendored
runtime. The app therefore booted against a contaminated DB and failed when a
session context epoch replacement tried to touch `replacement_seq`.

## Immediate Containment

Commands run:

```bash
gh release edit v0.0.48 --repo prashantbhudwal/buddy-releases --draft
gh release edit v0.0.47 --repo prashantbhudwal/buddy-releases --latest
gh api repos/prashantbhudwal/buddy-releases/releases/latest --jq .tag_name
```

Verified latest:

```text
v0.0.47
```

## Remediation Direction

The durable invariant is:

- Buddy must never let vendored OpenCode use generic machine-level OpenCode
  data/cache/state roots.
- Buddy may use vendored OpenCode code, but its mutable runtime state must be
  inside a Buddy-owned namespace.
- Buddy will keep the vendor storage model by category, but Buddy owns the
  parent app namespace.
- The vendored engine subsystem may keep the `opencode` directory and
  `opencode.db` filename only under Buddy-owned parents.
- Global authored Buddy config stays at:

```text
~/.buddy
```

- Default production mutable runtime paths are:

```text
~/.local/share/buddy/opencode/opencode.db
~/.local/share/buddy/opencode/auth.json
~/.local/share/buddy/opencode/log/
~/.local/share/buddy/opencode/repos/
~/.cache/buddy/opencode/bin/
~/.local/state/buddy/opencode/locks/
/tmp/buddy/opencode/
```

- Desktop prod/beta must not set `BUDDY_RUNTIME_ROOT`.
- `BUDDY_RUNTIME_ROOT` remains only for explicit tests and smoke scripts, where
  it derives the same category shape under the explicit root.
- Dev desktop remains isolated by setting XDG data/cache/state under Electron
  `userData/xdg`, then Buddy resolves `buddy/opencode` beneath those roots.
- Buddy sets `OPENCODE_DB=opencode.db` and does not use
  `OPENCODE_DISABLE_CHANNEL_DB` as the storage fix.
- The v0.0.48 fallout policy is a fresh cut: do not repair or migrate the
  contaminated generic OpenCode DB.

## Follow-Up Work

- Patch launcher and backend bootstrap to the Buddy-owned XDG parent invariant.
- Update desktop path probes and tests to point at the effective Buddy-owned
  vendored engine DB.
- Add regression tests proving prod packaged desktop does not resolve to
  `~/.local/share/opencode`.
- Do not use a schema-repair hotfix as the primary remediation. The primary fix
  is to stop opening contaminated generic OpenCode databases.

## Working-Tree Remediation

The current fix in progress implements these behaviors:

- Packaged prod/beta no longer export `BUDDY_RUNTIME_ROOT`.
- Packaged prod/beta resolve the vendored engine DB to:

```text
~/.local/share/buddy/opencode/opencode.db
```

- Dev/unpackaged desktop remains isolated under Electron `userData`, with the
  vendored engine DB at:

```text
<userData>/xdg/data/buddy/opencode/opencode.db
```

- Desktop passes `OPENCODE_DB=opencode.db` and does not pass
  `OPENCODE_DISABLE_CHANNEL_DB`.
- Backend bootstrap temporarily maps vendor import-time XDG/TMP roots so
  vendored `Global.Path.*` initializes under:

```text
<buddy data root>/opencode
<buddy cache root>/opencode
<buddy state root>/opencode
<tmp root>/buddy/opencode
```

- After vendor bootstrap, Buddy aligns direct `Global.Path.config` reads to the
  authored config root `~/.buddy`.
- Test starts without `BUDDY_RUNTIME_ROOT` preserve the test harness XDG roots
  so test isolation remains explicit and fail-closed.

## Working-Tree Verification

The fix now has regression coverage for the exact contamination path:

- Backend env tests assert that a no-`BUDDY_RUNTIME_ROOT`, no-XDG startup
  resolves `DatabasePath()` to:

```text
<home>/.local/share/buddy/opencode/opencode.db
```

- Backend env tests assert that `BUDDY_DATA_DIR`, `BUDDY_CACHE_DIR`,
  `BUDDY_STATE_DIR`, and `BUDDY_GLOBAL_CONFIG_DIR` win before defaults, while
  vendored OpenCode still appends only the `opencode` subsystem directory.
- Backend env tests assert `OPENCODE_DB=opencode.db` and
  `OPENCODE_DISABLE_CHANNEL_DB` remains unset.
- Desktop storage tests assert packaged prod and beta resolve the startup DB
  probe to:

```text
~/.local/share/buddy/opencode/opencode.db
```

- Desktop storage tests assert dev remains isolated at:

```text
<userData>/xdg/data/buddy/opencode/opencode.db
```

Verified in the working tree with:

```bash
bun test --preload ./packages/buddy/test/preload.ts packages/buddy/test/opencode-runtime-env.test.ts
bun test packages/desktop-electron/test/storage-paths.test.ts
bun test packages/buddy/test/opencode-runtime-legacy-migration-repair.test.ts
bun lint
bun typecheck
```
