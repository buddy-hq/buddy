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
2. **Authored Configuration:** Stable and development retain `~/.buddy` as the authored configuration default (or an explicit `BUDDY_GLOBAL_CONFIG_DIR`). Packaged Beta uses its own managed configuration root.
3. **Stable Mutable Paths:** Packaged `prod` desktop resolves runtime state under Buddy namespaces without requiring `BUDDY_RUNTIME_ROOT`:
   - Database: `~/.local/share/buddy/opencode/opencode.db`
   - Auth: `~/.local/share/buddy/opencode/auth.json`
   - Logs: `~/.local/share/buddy/opencode/log/`
   - Repos: `~/.local/share/buddy/opencode/repos/`
   - Cache: `~/.cache/buddy/opencode/bin/`
   - Locks: `~/.local/state/buddy/opencode/locks/`
4. **Development Desktop Isolation:** Dev desktop runs under Electron `userData`: `<userData>/xdg/data/buddy/opencode/opencode.db`.
5. **Beta Desktop Isolation:** Packaged `beta` has separate Electron, runtime, authored configuration, skills, memory, temporary, and notebook roots. It starts fresh and never imports, migrates, or falls back to Stable storage. Unpackaged Beta keeps the existing development behavior.
6. **Scoped Environment Variables:** `BUDDY_RUNTIME_ROOT` is reserved solely for explicit test and smoke harnesses to ensure test isolation. Desktop passes `OPENCODE_DB=opencode.db` and leaves `OPENCODE_DISABLE_CHANNEL_DB` unset.
7. **No Foreign Database Repair:** Buddy will not attempt to mutate or repair contaminated generic OpenCode databases; isolation prevents access entirely.

## Packaged Beta Storage Policy

`BUDDY_CHANNEL=beta` uses distribution app id `ai.buddy.desktop.beta`. Let `U` be that app's Electron `userData` (`~/Library/Application Support/ai.buddy.desktop.beta` on macOS; `%APPDATA%\ai.buddy.desktop.beta` on Windows), and `N` be `join(app.getPath("documents"), "Buddy Beta")`. Redirected Documents folders are respected.

- Electron stores receive an explicit `cwd=U` even during static imports. `sessionData=U` keeps persistent browser partitions there; logs are `U/logs`, crash dumps are `U/crash-dumps`.
- Runtime XDG categories are `U/xdg/{data,cache,config,state}`. Buddy category roots append `/buddy`; OpenCode data/cache/state append `/opencode`. The database is `U/xdg/data/buddy/opencode/opencode.db`, with `auth.json` and `mcp-auth.json` beside it.
- `BUDDY_MANAGED_HOME_DIR=U/xdg/config/buddy` owns authored skills, skill locks/caches, learner memory and lab state. `BUDDY_GLOBAL_CONFIG_DIR` and `OPENCODE_CONFIG_DIR` point there too. The OpenCode skill-discovery cache is explicitly `U/xdg/cache/buddy/opencode/skills`.
- OS `HOME`, `USERPROFILE`, `APPDATA` and `LOCALAPPDATA` remain unchanged. User-authored config under the real home (`~/.opencode`, `~/.claude`, `~/.agents`) is shared with Stable on purpose: OpenCode also uses its home for `~` expansion in permissions and instructions, so overriding it would break those. Re-check `~/.opencode` dependency installation before Beta ships a different runtime.
- Electron temp and backend `TMPDIR`/`TMP`/`TEMP` are `U/xdg/tmp`. Capture initialization and spreadsheet cleanup therefore operate on Beta temp files. Classic and Effect-based OpenCode locks stay below `U/xdg/state/buddy/opencode/locks`.
- `BUDDY_DEFAULT_NOTEBOOK_HOME`, `BUDDY_DIRECTORY_BASE` and `BUDDY_ALLOWED_DIRECTORY_ROOTS` are `N`. Notes default to `N/Notes`. The backend ignores inherited `BUDDY_PORT` and allocates an ephemeral port.

The desktop applies these overrides after merging shell and app environments. It strips inherited Buddy/OpenCode config file/content injection, `OPENCODE_AUTH_CONTENT`, `BUDDY_RUNTIME_ROOT`, `OPENCODE_DISABLE_CHANNEL_DB`, Buddy/OpenCode test-home overrides, development reload-file destinations and external OpenAI auth-trace destinations. Windows overrides/stripping also remove case-insensitive duplicates. Unwritable roots abort startup with their failing path; there is no Stable fallback.

Stable (`prod`) and dev/unpackaged paths, environment precedence and defaults are unchanged. Existing persisted data stays in place. Importing a copy of Stable data into Beta is outside this policy and is not implemented.

Storage isolation does not isolate fixed OAuth callback ports: OpenAI still uses `1455`, and MCP uses `19876`. Stable and Beta can contend for these ports if they log in simultaneously. Changing callback ports is a separate workstream.

## Verification

Regression tests cover storage resolution paths:

- `packages/buddy/test/opencode-runtime-env.test.ts` (asserts default startup resolves `~/.local/share/buddy/opencode/opencode.db` without `BUDDY_RUNTIME_ROOT`).
- `packages/desktop-electron/test/storage-paths.test.ts` (asserts the channel/packaging matrix, Beta POSIX/Windows layouts, and unchanged Stable/development defaults).
- `packages/desktop-electron/test/desktop-storage-environment.test.ts` (asserts post-merge overrides, Windows casing and explicit Beta cwd for every named store).
- `packages/buddy/test/storage/home-directories.test.ts` (asserts legacy defaults and managed/notebook overrides, including skill, memory and lab state).
- The fresh-process Beta test in `opencode-runtime-env.test.ts` writes real sandbox auth files, holds both lock types, confirms shared `~/.opencode` discovery and preserves a fake Stable capture during Beta capture initialization.
