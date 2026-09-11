# Storage Cross-Contamination Incident — 2026-07-05

Date: 2026-07-05
Status: Contained via release rollback; permanent Buddy-owned storage namespace architecture implemented

## Summary & Symptom

Production Buddy release `v0.0.48` failed on startup for users with existing standalone OpenCode installations, displaying a backend error in the chat composer:

```text
Error: no such column: replacement_seq
```

The error occurred during `SessionContextEpoch.requestReplacement`.

## Root Cause

A storage ownership refactor removed the production desktop `BUDDY_RUNTIME_ROOT` export and stopped setting explicit XDG variables for packaged launches. Consequently, vendored OpenCode defaulted to the machine-level OpenCode runtime directory under `OPENCODE_CHANNEL=prod`:

```text
~/.local/share/opencode/opencode.db
```

On machines with standalone OpenCode or older schemas, this database had a drifted schema where the migration journal recorded context epoch migrations as complete, yet `session_context_epoch` was missing the newly added `replacement_seq` column.

## Immediate Containment

1. Release `v0.0.48` was marked as draft in `prashantbhudwal/buddy-releases`.
2. Release `v0.0.47` was restored as latest on GitHub.

## Durable Architectural Invariants

Buddy runtime storage enforces strict namespace isolation from machine-level OpenCode:

1. **Buddy-Owned Runtime Root:** Vendored OpenCode runtime state must live within Buddy-owned directories, never in generic machine-level OpenCode roots (`~/.local/share/opencode`).
2. **Authored Configuration:** Global authored Buddy configuration lives strictly at `~/.buddy`.
3. **Production Mutable Paths:** Packaged desktop resolves runtime state under Buddy namespaces without requiring `BUDDY_RUNTIME_ROOT`:
   - Database: `~/.local/share/buddy/opencode/opencode.db`
   - Auth: `~/.local/share/buddy/opencode/auth.json`
   - Logs: `~/.local/share/buddy/opencode/log/`
   - Repos: `~/.local/share/buddy/opencode/repos/`
   - Cache: `~/.cache/buddy/opencode/bin/`
   - Locks: `~/.local/state/buddy/opencode/locks/`
4. **Development Desktop Isolation:** Dev desktop runs under Electron `userData`: `<userData>/xdg/data/buddy/opencode/opencode.db`.
5. **Scoped Environment Variables:** `BUDDY_RUNTIME_ROOT` is reserved solely for explicit test and smoke harnesses to ensure test isolation. Desktop passes `OPENCODE_DB=opencode.db` and leaves `OPENCODE_DISABLE_CHANNEL_DB` unset.
6. **No Foreign Database Repair:** Buddy will not attempt to mutate or repair contaminated generic OpenCode databases; isolation prevents access entirely.

## Verification

Regression tests cover storage resolution paths:
- `packages/buddy/test/opencode-runtime-env.test.ts` (asserts default startup resolves `~/.local/share/buddy/opencode/opencode.db` without `BUDDY_RUNTIME_ROOT`).
- `packages/desktop-electron/test/storage-paths.test.ts` (asserts packaged prod/beta and dev storage isolation).
