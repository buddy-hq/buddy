# Vendor Sync Delta: `e9b4a8abb` vs `78646e54c`

## Executive Summary

This vendor sync pulls `vendor/opencode` forward from `78646e54c` to `e9b4a8abb` and is not a routine patch bump. The upstream delta is a broad rework of the core runtime, provider stack, plugin system, session review UX, and release/tooling pipeline.

The most material changes for Buddy are:
- The provider layer now supports newer AI SDK majors, GitLab workflow model discovery, GitHub Copilot responses tooling, and new built-in auth plugins.
- The plugin architecture was refactored into explicit install/load/runtime layers, with first-class TUI plugin management.
- The session/review surface gained inline comment mentions, new markdown streaming behavior, and a status popover that surfaces server health, MCP, LSP, and plugins.
- Several internals were renamed or removed outright, including `account/effect.ts`, `auth/effect.ts`, the old workspace router/server split, and the `todoread` tool.

## Scale of Change

Commit-level summary from `git show --stat`:
- `781 files changed`
- `109,007 insertions(+), 49,594 deletions(-)`

The churn is heavily concentrated in `vendor/opencode`:
- `vendor/opencode/packages/opencode/src` is the single largest hotspot.
- `vendor/opencode/packages/app/src`, `vendor/opencode/packages/ui/src`, and `vendor/opencode/packages/web/src/content/docs` are the next largest clusters by file count.
- Root metadata and patching also changed: `package.json`, `bun.lock`, and three new root-level patch files.

High-churn areas by file distribution:
- `vendor/opencode/packages/opencode/src` - core runtime, CLI, server, provider, session, plugin, and permission logic.
- `vendor/opencode/packages/app/src` - desktop/web shell, review UI, status popover, settings, sync, and language loading.
- `vendor/opencode/packages/ui/src` - shared markdown, review, line-comment, message rendering, and assets.
- `vendor/opencode/packages/web/src/content/docs` - provider and usage docs across many locales.

## Major New Functionality

### 1) Plugin runtime and plugin management

Upstream added a full plugin loader/runtime split under `vendor/opencode/packages/opencode/src/plugin/`:
- `plugin/shared.ts` resolves file and npm plugin specs, validates `engines.opencode`, and resolves `server` and `tui` entrypoints.
- `plugin/loader.ts` and `plugin/install.ts` handle install, manifest inspection, compatibility checks, and config patching.
- `plugin/index.ts` now exposes plugin hooks through an Effect service and includes built-in auth plugins for Codex, Copilot, GitLab, and Poe.
- The CLI gained `vendor/opencode/packages/opencode/src/cli/cmd/plug.ts` for `plugin`/`plug` installation.
- The TUI gained a plugin manager in `vendor/opencode/packages/opencode/src/cli/cmd/tui/feature-plugins/system/plugins.tsx`.

This is a real capability expansion, not just refactoring. Plugins can now be installed, loaded, activated, deactivated, and themed through first-class runtime surfaces.

### 2) Provider and model-stack expansion

`vendor/opencode/packages/opencode/src/provider/provider.ts` and the related AI SDK code were updated for newer provider contracts:
- `@ai-sdk/*` packages are bumped to new major lines in lockfile state.
- `gitlab-ai-provider` is now the active GitLab provider package, with workflow model discovery and `duo-workflow` handling.
- `xai` is wired through the Responses API path.
- GitLab workflow discovery can materialize models dynamically based on the current repository state.
- Copilot-specific provider code was expanded with Responses API tooling for code interpreter, file search, image generation, local shell, and web search variants.

This also introduces a different HTTP header shape for some providers. Non-`opencode` providers now receive a `User-Agent` header, while `opencode`-backed providers still get the `x-opencode-*` headers.

### 3) Review, comment, and markdown UX upgrades

The session review path was materially expanded:
- `vendor/opencode/packages/app/src/pages/session/review-tab.tsx` now passes mention support into line comments.
- `vendor/opencode/packages/ui/src/components/line-comment.tsx` adds `@` mention autocomplete for file paths.
- `vendor/opencode/packages/ui/src/components/session-review.tsx` forwards mention handlers into review comments.
- `vendor/opencode/packages/ui/src/components/markdown-stream.ts` and its test add live markdown healing for incomplete emphasis, links, and code fences.
- `vendor/opencode/packages/ui/src/components/message-part.tsx` now paces streaming text rendering and uses the new markdown stream path.

The app shell also gained a redesigned `StatusPopoverBody` that surfaces:
- server health polling,
- MCP connection state,
- LSP status,
- installed plugins.

### 4) Runtime, permission, and tool behavior changes

Several low-level behaviors changed in ways that affect downstream integration:
- `vendor/opencode/packages/opencode/src/tool/write.ts` and `tool/apply_patch.ts` now format edited files before publishing file edit events.
- `vendor/opencode/packages/opencode/src/tool/bash.ts` now does AST-based command scanning, better Windows/PowerShell path handling, and more precise permission prompting.
- `vendor/opencode/packages/opencode/src/session/message-v2.ts` moved message events onto the sync-event path and added more explicit error handling for decompression failures.
- `vendor/opencode/packages/opencode/src/session/llm.ts` now supports async `toModelMessages`, workflow tool execution, and a different max-output-token policy for OAuth/Copilot providers.

### 5) Release and CI tooling

The sync adds or reshapes release automation:
- `vendor/opencode/script/raw-changelog.ts` is a new changelog generator.
- `vendor/opencode/script/version.ts` now generates release notes through the new changelog flow.
- `vendor/opencode/script/sign-windows.ps1` is new Windows code signing automation.
- `.github/workflows/publish.yml` now signs and republishes Windows CLI and desktop artifacts.
- `.github/workflows/close-issues.yml` is new, while older stale/sign-cli workflows were removed.

## Breaking / Behavioral Changes Likely To Affect Buddy Integration

### Removed or renamed internal entrypoints

- `vendor/opencode/packages/opencode/src/account/effect.ts` was deleted.
- `vendor/opencode/packages/opencode/src/auth/effect.ts` was deleted.
- Both account and auth were reworked into layer/service-based modules in `account/index.ts` and `auth/index.ts`.
- The old workspace server/router split was deleted and replaced with `vendor/opencode/packages/opencode/src/server/router.ts` plus a reorganized server bootstrap.

If Buddy or any of its generated artifacts still imports the old effect-layer paths directly, those imports will fail.

### Permission API transition

- `PermissionNext` was renamed to `Permission` in `vendor/opencode/packages/opencode/src/permission/index.ts`.
- The Buddy adapter still aliases `PermissionNext = Permission`, so Buddy source currently has a compatibility bridge.
- The underlying API surface is still different enough that any direct vendor imports should be treated as unstable.

### Tool surface changes

- The `todoread` tool is gone from the vendor tool registry.
- `todowrite` remains, but the read-side UI and tool registration were removed.
- This leaves stale `todoread` references in Buddy permission configs and tests as dead configuration that should be cleaned up.

### Settings schema changes

- `appearance.font` became `appearance.mono` and `appearance.sans`.
- Default shell tool expansion is now `false` instead of `true`.
- UI code now constructs font stacks from free-form font names rather than a closed dropdown of bundled fonts.

Any Buddy code that persists or hydrates settings needs to migrate the shape, even if a compatibility layer still exists in the app shell.

### Sync and server protocol changes

- Global events now have a `/global/sync-event` SSE stream with versioned `SyncEvent` payloads.
- The app bootstrap now delays event consumption until after root bootstrap and suppresses refresh storms around startup.
- SSE and session message/prompt endpoints are explicitly exempted from compression to avoid stream breakage.

Any Buddy code that mirrors or proxies OpenCode events should verify the new event schema and transport behavior.

## Notable Dependency / Runtime / Tooling Changes

Top-level workspace changes:
- `packageManager` bumped from `bun@1.3.9` to `bun@1.3.11`.
- Catalog bumps include `ai 6.0.138`, `effect 4.0.0-beta.42`, `@effect/platform-node 4.0.0-beta.42`, `@pierre/diffs 1.1.0-beta.18`, and `@types/bun 1.3.11`.

Vendor package changes that matter:
- `@ai-sdk/*` packages were moved to newer major lines.
- `@openrouter/ai-sdk-provider` moved to `2.3.3`.
- `gitlab-ai-provider 6.0.0`, `opencode-gitlab-auth 2.0.1`, and `opencode-poe-auth 0.0.1` were added.
- `@opentui/core` and `@opentui/solid` moved to `0.1.95`.
- `@tanstack/solid-query`, `@solid-primitives/timer`, `remend`, and `tree-sitter-powershell` were added.

Patched dependencies:
- `solid-js@1.9.10` patch fixes transition-state behavior in `runComputation`.
- `@ai-sdk/provider-utils@4.0.21` patch allows `data:` URLs in download validation.
- `@ai-sdk/anthropic@3.0.64` patch removes the `topP` vs `temperature` warning branch.

## What This Unlocks for Buddy

- Buddy can rely on a richer plugin substrate, including TUI-level plugin management and plugin install/update workflows.
- Buddy can route more provider types through OpenCode without custom glue, especially GitLab workflow models and Copilot-compatible Responses tooling.
- Buddy gets a stronger review/comment UX with file mentions, which is useful for curriculum and code-review surfaces.
- Buddy gains better Windows viability from the PowerShell-aware bash scanner and Windows signing pipeline.
- Buddy gets more predictable event mirroring through versioned sync events and better SSE handling.
- Buddy can use the new status popover and health reporting to diagnose provider, MCP, and server state more directly.

## Risks / Follow-Ups for Buddy Maintainers

- Audit any downstream code that still expects `account/effect.ts`, `auth/effect.ts`, or `PermissionNext` as a real vendor symbol rather than an adapter alias.
- Clean up stale `todoread` permission/tool references in Buddy curricula, tests, and generated types if they are no longer meaningful.
- Migrate any persisted settings readers/writers that assume `appearance.font` or a bundled font dropdown.
- Regenerate SDK/openapi artifacts if Buddy consumes OpenCode routes or event schemas directly, especially for `/global/sync-event` and the reorganized server routes.
- Verify that the new plugin install/compatibility checks match Buddy's plugin packaging assumptions before exposing them to users.
- Re-test desktop packaging on Windows, because the sync adds PowerShell-specific scanning and Windows signing flow.
- Confirm that formatting-on-write/apply-patch is acceptable for Buddy's file-event consumers, because the edit event now fires after formatting.

## Appendix: Evidence Commands

1. `git show --stat --oneline --decorate=short --summary e9b4a8abb --`
   - Output headline: `e9b4a8abb chore(vendor): sync opencode upstream to latest dev`
   - Summary: `781 files changed, 109007 insertions(+), 49594 deletions(-)`

2. `git diff --dirstat=files,10 78646e54c e9b4a8abb -- vendor/opencode packages .github patches package.json bun.lock`
   - Output highlights:
     - `26.7% vendor/opencode/packages/opencode/src/`
     - `13.7% vendor/opencode/packages/web/src/content/docs/`
     - `12.6% vendor/opencode/packages/ui/src/`
     - `10.9% vendor/opencode/packages/app/src/`

3. `git diff --name-status 78646e54c e9b4a8abb -- vendor/opencode/packages/opencode/src/account vendor/opencode/packages/opencode/src/auth vendor/opencode/packages/opencode/src/control-plane vendor/opencode/packages/opencode/src/plugin vendor/opencode/packages/opencode/src/provider vendor/opencode/packages/opencode/src/session vendor/opencode/packages/opencode/src/server`
   - Output highlights:
     - `D account/effect.ts`
     - `D auth/effect.ts`
     - `D control-plane/workspace-router-middleware.ts`
     - `D control-plane/workspace-server/{routes.ts,server.ts}`
     - `A plugin/{install.ts,loader.ts,meta.ts,shared.ts}`
     - `A server/router.ts`
     - `A session/{overflow.ts,projectors.ts}`

4. `git diff 78646e54c e9b4a8abb -- package.json`
   - Output highlights:
     - `@types/bun` -> `1.3.11`
     - `ai` -> `6.0.138`
     - `effect` / `@effect/platform-node` -> `4.0.0-beta.42`
     - added root `patchedDependencies` for `solid-js`, `@ai-sdk/provider-utils`, and `@ai-sdk/anthropic`

5. `git diff 78646e54c e9b4a8abb -- vendor/opencode/package.json`
   - Output highlights:
     - `gitlab-ai-provider` -> `6.0.0`
     - added `opencode-gitlab-auth`
     - added `opencode-poe-auth`
     - added `tree-sitter-powershell`
     - replaced the old OpenRouter patch with `solid-js` and `@ai-sdk/*` patches

6. `git diff 78646e54c e9b4a8abb -- vendor/opencode/packages/opencode/src/provider/provider.ts vendor/opencode/packages/opencode/src/session/llm.ts vendor/opencode/packages/opencode/src/session/message-v2.ts`
   - Output highlights:
     - GitLab workflow discovery and `duo-workflow` handling
     - `x-opencode-*` headers only for `opencode` providers, `User-Agent` for others
     - `SyncEvent`-based message events
     - async `toModelMessages`

7. `git diff 78646e54c e9b4a8abb -- vendor/opencode/packages/app/src/context/settings.tsx vendor/opencode/packages/app/src/components/settings-general.tsx vendor/opencode/packages/app/src/pages/session/review-tab.tsx vendor/opencode/packages/ui/src/components/line-comment.tsx`
   - Output highlights:
     - `appearance.font` -> `appearance.mono` / `appearance.sans`
     - review tab mention support
     - file-path mention autocomplete in line comments

