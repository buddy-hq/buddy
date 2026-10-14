# Buddy ↔ OpenCode surface inventory (pre-migration)

Read-only research by a Sonnet explorer, 2026-10-08. All line numbers are against baseline commit `a99d5c41a3` (vendor OpenCode 1.18.16). The worktree was already changing while this was written: `vendor/opencode/packages/opencode` deleted, seven adapter modules moving into `packages/transcript-contract`. Vendored sources were read with `git show HEAD:vendor/opencode/...`. Spot-check claims against code before acting on them.

Path prefixes: `ROOT=/Users/prashantbhudwal/Code/buddies/v2-upgrade`, `AD=ROOT/packages/opencode-adapter/src`, `RT=ROOT/packages/buddy/src/opencode-runtime`, `B=ROOT/packages/buddy/src`, `W=ROOT/packages/web/src`, `BT=ROOT/packages/buddy/test`, `V=ROOT/vendor/opencode` (v1.18.16 at HEAD).

## Summary

1. Web never talks to OpenCode directly; it uses only the generated `@buddy/sdk` via `getBuddyClient`. `W/lib/opencode-client.ts` has zero importers (dead). The only `@opencode-ai/sdk` use in web is the type `ProviderAuthAuthorization` in `onboarding-flow.ts:1`. No generic `/opencode` proxy: Buddy re-exposes OpenCode through explicit routes, plus a raw `/event` → `/global/event` SSE proxy (`routes/compatibility.ts:140-215`).
2. Eight modules monkey-patch vendored Effect services or globals via `Object.defineProperties` on shared service instances: `config`, `session-live`, `plugin-live`, `provider-live`, `skill-live`, `registry`, `tool-input-delta-live`, and `mcp-oauth-branding` (`McpOAuthProvider.prototype` and Node's global `ServerResponse.prototype.end`). This works only because `makeRuntime` shares one `memoMap` (`run-service.ts:7,35`).
3. Boot order is enforced by source-text match: `script/check-import-contract.ts:139-155` requires `await ensureToolInputDeltaBridgePatched()` to precede `const built = await Server.Default()` in `runtime.ts`.
4. The `ToolRegistry` patch is lazy (`registry.ts:259-263`), applied on first registry call, usually `ToolRegistry.prime()` in prompt/command transforms.
5. The tool UI decoration is `part.metadata.buddy.presentation`, added only to `message.part.updated` SSE frames (`http/opencode-event-stream.ts:143-158`) and history reads (`core-actions.ts:557`), and stripped before the model sees it (`buddy-runtime-plugin.ts:135-139`).
6. Buddy's message/part types are OpenCode v1 end to end: `MessageV2` = `@opencode-ai/core/v1/session` (`message.ts:1-26`) → OpenAPI in `routes/session.ts:454,506,555` → generated SDK types. 78 of 940 web `src` files touch message/part types or `message.part.*` events (91 with presentation and permission files); 48 web test files too. Event payloads are hand-validated in `W/lib/directory-chat/chat-event-schemas.ts`.
7. Largest call-site coupling: `Instance.provide` (wraps vendored `instanceContext`) — 56 prod sites in 26 files, 115 test sites in 34 files. `Session.get` 15 prod sites, `Session.messages` 10.
8. About 3,000 lines of Buddy product logic live inside the adapter: tool-presentation contracts, message-visibility rules, fork-title lineage, notebook file index, theme contrast, `.git/opencode` project-id cache writes (`project.ts:93-107`).
9. The agent-facing Bench prompt embeds the v1 SQLite schema (`session`, `message`, `part`) in `learning/features/bench/chat-transcripts.ts:5-6`; the model is told to read that DB with its own tools.
10. Dead or near-dead adapter surface: `ensureSessionToolPresentationPatched` (no-op, 0 callers), `File.init` (no-op stub, called 3×), `File.list`, `File.status`, `LLM.generateSmallText`, `Skill` namespace (test-only), `RuntimeHooks.config` (test-only), `createBuddyTool().toTool` (test-only), `Instance.reload/restore/bind`, many `Session*`/`SessionPrompt` wrapper methods.
11. `withConfigOverlay(_directory, fn)` ignores its directory (`config.ts:197-200`); five modules pass a directory that does nothing.
12. Mixed seams: the same operation goes through the SDK in one place and a direct adapter call in another (e.g. `core-actions.ts:229` creates via SDK, `core-actions.ts:292` loads directly).
13. Tool context depends on v1 plugin fields: 33 Buddy tool files call `ctx.ask(`, 7 use `ctx.messages`, 3 use `ctx.extra`; `buddy-tool-shim.ts:46-54` reads fields the published plugin type omits.
14. Tests are strong on seam semantics but nothing tests the `LLM.Service.stream` / `Session.updatePart` patches; only pure helpers (`opencode-adapter/test/tool-input-delta-live.test.ts`, `buddy/test/opencode-runtime/tool-input-delta-bridge.test.ts`).

## 0. Scope, method, counts

- Importers of `@buddy/opencode-adapter/*` (excluding `package.json`): 164 files — `B/` 79, `BT/` 58, `W/` 21, web tests 3, `buddy/script/build-node.ts:11` 1. Of 181 Buddy test files, 58 import the adapter and 10 call `loadOpenCodeApp()` to boot the full vendored runtime.
- Adapter: 54 files (53 `.ts` + `types/vendor-modules.d.ts`), 6,148 lines; 8 test files, 1,297 lines.
- Heaviest vendored imports in the adapter: `opencode/effect/run-service` 20, `opencode/effect/app-node-builder-v1` 17, `opencode/session/session` 4, `opencode/effect/instance-ref` 4, `ui/src/theme/*` by relative path 10; `core/src/global.ts`, `packages/opencode/package.json`, `session/prompt/gpt.txt` by relative path 1 each.
- Vendored `package.json` exports `"./*": "./src/*.ts"`, so every `opencode/<x>` import is a deep import into `V/packages/opencode/src/<x>.ts`.
- Other direct plugin/SDK imports in Buddy prod code:
  - `@opencode-ai/plugin`: `plugin-ask-compat.ts:3`, `buddy-tool-shim.ts:2`, `buddy-runtime-plugin.ts:2`, `openai-codex-auth.ts:3`, `openai-codex-provider.ts:1`.
  - `@opencode-ai/sdk/v2/client`: `RT/client.ts:1`; `B/routes/mcp.ts:6` (types `McpLocalConfig`, `McpRemoteConfig` only).
  - `@opencode-ai/sdk/v2`: `openai-codex-provider.ts:2`.
- "SDK v2" in those import paths is the 1.x server's second-generation JS client, not OpenCode v2. `workspace-file-references.ts:310` already calls `client.v2.reference.list()`.

## 1. How Buddy consumes OpenCode

| # | Channel | Evidence |
|---|---|---|
| C1 | Typed SDK client over in-process fetch to `Server.Default().app.fetch` | `RT/client.ts:18-36`; `RT/runtime.ts:92-97`; `RT/fetch-with-overlay.ts:18-27` |
| C2 | Direct calls to patched vendored Effect services via adapter wrappers, scoped by `Instance.provide` | `AD/instance.ts:36-80`; `AD/effect-runtime.ts:6-17` |
| C3 | Monkey-patched service methods (`*-live`, `config`, `registry`) | §2A |
| C4 | Plugin hooks (OpenCode → Buddy); Buddy hooks appended to the vendored plugin list by patching `Plugin.Service` | `RT/runtime.ts:63-69`; `AD/plugin-live.ts:203-255`; `RT/plugins/buddy-runtime-plugin.ts:257-271` |
| C5 | `GlobalBus` both ways; vendored `/global/event` streams it unfiltered | `AD/global-event.ts:29-36`; `V/.../httpapi/handlers/global.ts:33-41` |
| C6 | Raw SQLite and filesystem | `RT/legacy-migration-repair.ts:162-175`; `B/learning/features/bench/chat-transcripts.ts:20-38`; `AD/storage-db.ts:1` |
| C7 | Build/dev tooling coupled to the vendor tree | `package.json:10-12,178-196` (workspace globs, `patchedDependencies`); `package.json:122-124` (catalog sync); `packages/desktop-electron/scripts/electron-vite-build-policy.ts:22-23`; `packages/buddy/script/build-node.ts:11,119` (`OPENCODE_VERSION` define); `script/check-import-contract.ts:15-17,139-155` |

## 2. Adapter inventory

Classes: **A** monkey-patch of vendored internals; **B** thin wrapper/re-export; **C** Buddy logic using OpenCode types; **D** dead or near-dead.

### 2A. Patches (class A)

| Module (LOC) | What it does | Vendored internals | Prod callers | User-visible behaviour |
|---|---|---|---|---|
| `config.ts` (260) | Patches `Config.Service.get` (`:151-185`): looks up the per-directory overlay (`:166`), parses with vendored `ConfigVariable`/`ConfigParse` (`:129-149`), deep-merges into the cached config in place (`:52-71`), WeakSet prevents re-application (`:35,167,178`), drops `mcp` when authoritative (`:73-82`), preserves `"*"` permission precedence (`:103-127`), strips deprecated tui keys (`:92-101`). Also exports a `Config` namespace of v1 schemas (`:214-260`). | `opencode/config/{config,plugin,parse,variable}`; `core/v1/config/*`; `effect/{app-node-builder-v1,run-service,instance-ref}` (`:1-14`) | `RT/runtime.ts:9,85`; `RT/fetch-with-overlay.ts:1`; `B/config/runtime/opencode-sync.ts:1,81`; `B/config/contract/schema.ts:3,18-36`; `B/learning/skill-management/service/discovery.ts:5,95-98` | Per-notebook config overlay (personas, permissions, commands, skill paths, MCP, provider/model). Buddy's own config schema embeds OpenCode v1 `Mcp`/`Skills`/`Provider`/`Permission`/`Agent` schemas. |
| `session-live.ts` (251) | Patches `Session.Service` `create/list/fork/get/setTitle/setArchived/setPermission/children/remove` (`:130-240`); 256-entry LRU of canonical `Session.Info` objects updated in place (`:8-9,34-83`); `fork` renames to `Title (N)` with lineage metadata (`:155-170`). | `opencode/session/session`, `run-service` | `RT/runtime.ts:16,86`; cache helpers used by `AD/session.ts:5` | Compact fork titles; session list/get identity. LRU purpose undocumented; `session-live.test.ts` asserts clone-on-read and in-place permission updates. |
| `plugin-live.ts` (274) | Patches `Plugin.Service` `init/list/trigger` (`:203-255`); Buddy hooks run after vendored ones (`:229-247`); factories keyed by canonical `directory::worktree` (`:54-56,71-86`); supports a `config` hook (`:34-36,107-146`). | `opencode/plugin/index`, `config/config`, `@opencode-ai/plugin` `Hooks` | `RT/runtime.ts:8,63-69,87` | All Buddy plugin behaviour (tools, auth, provider, event, system transform, headers, params). |
| `provider-live.ts` (158) | Patches `Provider.Service` `list/getProvider/getModel/closest/getSmallModel/defaultModel` (`:40-141`) with per-provider async resolvers (`:15,153-158`). | `opencode/provider/provider` | `RT/runtime.ts:14,72-84` (OpenAI resolver) | ChatGPT-account model list in the picker and runtime model lookup. |
| `skill-live.ts` (66) | Patches `Skill.Service` `get/all/available` with a visibility filter (`:16-55`). | `opencode/skill/index` | `RT/skill-filtering.ts:4-10` + `RT/hidden-opencode-skills.ts:1-17` | Hides built-in `customize-opencode`. |
| `registry.ts` (453) | Patches `ToolRegistry.Service` `all/named/tools` (`:217-257`): per-directory tool JSON-schema overrides (`:158-168`), output policies that un-truncate by re-reading `metadata.outputPath` (`:112-156`), tool-def transformers (`:178-197`); holds the presentation catalog (`:306-345,393-408`). | `opencode/tool/registry`, `tool/tool`, `effect/instance-ref`, `agent/agent` | `RT/buddy-tool-shim.ts:5,149-167`; `RT/buddy-tool-presentation-catalog.ts:1,29-35`; `RT/subagent-forwarding.ts:5,116`; `B/learning/agent-execution/transforms/{message-transform-orchestration,command-transform}.ts` (`ToolRegistry.prime`, `:31`, `:49`) | Buddy tool registration, schemas, output limits, tool UI descriptors, subagent tool forwarding. |
| `tool-input-delta-live.ts` (422) | Patches `Session.Service.updatePart` (`:312-330`) and `LLM.Service.stream` (`:332-374`): tracks pending `whiteboard_create_view` parts (`:118-154`), wraps AI SDK `onInputDelta` (`:267-310`), emits `updatePartDelta` with field `state.raw` (`:13-14,260-264`), dedupes against normalized stream events (`:206-220`). Reaches `AppRuntime` via dynamic import (`:62-69`). Test-only exports in the prod module (`:412-421`). | `opencode/session/{session,llm}`, `effect/bridge`, `effect/app-runtime` | `RT/runtime.ts:17,89` | Progressive whiteboard rendering while the model streams tool input. |
| `mcp-oauth-branding.ts` (229) | Patches `McpOAuthProvider.prototype.clientMetadata` getter (`:124-143`) and Node's global `ServerResponse.prototype.end` (`:217-223`); rewrites the OAuth callback HTML (`:95-117`); Buddy brand constants (`:5-7`). | `opencode/mcp/oauth-provider` | `RT/runtime.ts:15,61` | Branded MCP OAuth client metadata and callback page. |
| `RT/env.ts` (361, not adapter) | Mutates vendored `Global.Path.*` after import (`:285-294`). | `core/src/global.ts:31` | `app.ts:1` | Aligns vendored paths with Buddy's directories. |

### 2B. Wrappers and re-exports (class B)

| Module (LOC) | What / internals | Prod callers | Notes |
|---|---|---|---|
| `instance.ts` (80) | `Instance.provide/current/directory/worktree/project/containsPath/bind/restore/reload/dispose/disposeAll` over `opencode/project/{instance-runtime,instance-context}` | 32 files; `provide` 56 sites; `disposeAll` at `write-config.ts:159`, `mutations.ts:42`, `library.ts:364`, `system-installer.ts:301` | `reload`, `restore`, `bind`: 0 callers. |
| `effect-runtime.ts` (17) | `withCurrentInstance` attaches `InstanceRef` + workspace refs (`opencode/effect/run-service`, `control-plane/workspace-context`) | `write-without-prompt.ts:3`, `create-buddy-tool.ts:8`, `plugin-ask-compat.ts:4`, all wrappers | Core of the Effect-internals coupling. |
| `session.ts` (106) | Wraps `Session.Service`, canonicalizes via the cache | `B/session/orchestration/{lookup,core-actions,interaction-actions,command-transcript}.ts`; memory `consolidation.ts`/`startup.ts`; `dynamic-tool-grants.ts`; `runtime-session-permissions.ts`; transforms; `notes/chat-capture.ts`; `routes/session.ts:6` (schema) | `fork`, `setTitle`, `remove`, `updateMessage`: 0 prod callers (HTTP routes reach the patched service instead). |
| `session-v2.ts` (59) | Wraps `@opencode-ai/core/session` `SessionV2` (list/get/messages/message/context) | `B/learning/features/memory/{session-extraction.ts:63-68,144-146,session-source.ts:46-131}`; `B/session/orchestration/interaction-actions.ts:680-698` | Only place Buddy already reads the v2-shaped store. |
| `session-status.ts` (29) | `SessionStatus` wrapper | `routes/session.ts:7` (schema); `interaction-actions.ts:565` (`get`) | `set`/`list` unused. |
| `session-prompt.ts` (87) | `SessionPrompt` wrapper + `registerPromptInputInterceptor` (`:81-86`); interceptor only affects calls through this wrapper, never the HTTP prompt route | Only prod prompt caller `memory/consolidation.ts:363`; interceptor registered at `RT/subagent-forwarding.ts:94` | `loop`, `shell`, `command`, `resolvePromptParts`, `cancel`: 0 callers. |
| `message.ts` (26) | `MessageV2` = `core/v1/session` schemas + `page()` on a separate Database runtime (`:7-17`) | `routes/session.ts:8`; `core-actions.ts:540` (`page`); `command-transcript.ts`; image-generation services; `ingest-full-text.ts` | Source of all Buddy message types. |
| `permission.ts` (56) | Mutable-rule copies of `PermissionV1` + vendored `evaluate/fromConfig/merge/disabled`; `PermissionNext` alias (`:47-56`) | `subagent-tool-forwarding.ts:111-113`; `skill-management/service/permissions.ts:80`; `routes/permission.ts:35`; `core-actions.ts:6`; type-only users | Buddy re-implements last-match evaluation in `skill-management/service/permissions.ts:32-43` instead of using `evaluate`. |
| `agent.ts` (37) | `Agent.Service` wrapper using `withConfigOverlay` | `workspace-file-references.ts:951`; `subagent-tool-forwarding.ts:408,597`; `config/orchestration/project-config-service.ts:45` | `defaultAgent` only used in `registry.ts:271`; `generate` unused. |
| `provider.ts` (52), `provider-auth.ts` (40) | Wrappers | `provider.ts`: `ingest-full-text.ts`, `memory/models.ts:32-80`, `prompt/context.ts:334`, `routes/config.ts`. `provider-auth.ts`: `routes/provider.ts:6` (schemas) | `Provider.parseModel` test-only. |
| `auth.ts` (29) | `Auth.get/set/all/remove` | `openai-codex-account.ts:676-681`; `openai-codex-auth.ts:634`; `image-generation/service/codex-images.ts:36-37`; `routes/auth.ts:4` (schema) | `all`/`remove` unused. Image generation reuses ChatGPT OAuth credentials. |
| `project.ts` (135) | `Project.Service` wrapper; `fromDirectory` first writes `<git-common-dir>/opencode` with a `buddy-local-<sha1>` id (`:45-107`) | `config/opencode/overlay-builder.ts:148`; `project/open-project-registry.ts:474,509`; `project-operations.ts:107,135`; `routes/project.ts:34` | Writes into the user's `.git`. B/C hybrid. |
| `lsp.ts` (25) | `LSP` wrapper | `lesson-workspace/service/diagnostics.ts:3` | `hasClients/touchFile/diagnostics` only. |
| `command.ts`, `mcp.ts`, `server.ts`, `app-runtime.ts`, `global.ts`, `storage-db.ts`, `system-prompt.ts`, `tool.ts`, `wildcard.ts`, `provider-icon.ts`, `id.ts` | Re-exports | `command`/`mcp`: schemas (`compatibility.ts:612`, `mcp.ts:24-25`); `server`: `runtime.ts:92`; `app-runtime`: `write-without-prompt.ts:8,44`; `global`: `env.ts:356`, `overlay-builder.ts:94`, `generated-image*.ts`; `storage-db`: `legacy-migration-repair.ts:163`, `chat-transcripts.ts:20`; `system-prompt`: `learning/personas/code.ts:1`; `tool`: `Tool`/`WriteTool`/`Truncate`/`ToolJsonSchema` in `create-buddy-tool.ts`, `buddy-tool-shim.ts`, `overlay-builder.ts:93`; `wildcard`: `permission-overrides.ts:118`, `skill-management/service/permissions.ts:37-38`; `provider-icon`: `W/components/provider-icon.tsx:3`; `id`: 19 prod files | `global`, `installation`, `provider-icon`, `system-prompt`, `theme*` import vendor files by relative path. |
| `installation.ts` (20) | Reads `V/packages/opencode/package.json` for `OpenCodeVersion`/`OpenCodeUserAgent`; re-exports `InstallationChannel` | `buddy-runtime-plugin.ts:6,141-152`; `openai-codex-account.ts:4`; `persona-availability.ts:1`; `packages/buddy/script/build-node.ts:11` | `opencode`-provider requests need the OpenCode User-Agent (onboarding with free models). |
| `index.ts`, `assets.d.ts`, `types/vendor-modules.d.ts` | Barrel and ambient types | | |

### 2C. Buddy logic using OpenCode types (class C)

| Module (LOC) | What | Callers | Behaviour |
|---|---|---|---|
| `tool-presentation.ts` (474) | Descriptor/phase/outcome schemas, `resolveToolPresentationSnapshot` (`:414-474`), permission-denied prefix match (`:323`) | 13 `W/` files (`chat-transcript.tsx:23` etc.); `bench/tools/present.ts:6`; `create-buddy-tool.ts:7` | Backend↔web tool UI contract. |
| `core-tool-presentations.ts` (511) | Catalog of vendored tool ids (`:10-33`) + runtime fallback (`:509-511`) | `registry.ts:14`; `session-tool-presentation.ts:2`; web test only | Tool UI for built-in and MCP tools. |
| `session-tool-presentation.ts` (119) | `withToolPresentationOnPart/Message(s)/UnknownPart` (`:70-111`) | `http/opencode-event-stream.ts:3,147`; `core-actions.ts:7,557` | Decorates SSE and history. `ensureSessionToolPresentationPatched` (`:115`) no-op, 0 callers. |
| `tool-presentation-strip.ts` (124) | Strips `buddy.presentation` from messages/model messages | `RT/tool-presentation-strip.ts` (re-export); `buddy-runtime-plugin.ts:138` | Keeps presentation out of LLM context. `stripToolPresentationFromModelMessages` no prod caller. |
| `message-visibility.ts` (64) | `isHiddenFromUserMessageInfo`, `isVisibleToUserTextPartInfo`, auto-repair id prefixes (`:3-4`), `hiddenFromUser`/`buddyPromptPart` metadata (`:5-19`) | `W/components/chat/utils/{message-visibility,user-message-text}.ts`; `B/notes/chat-capture.ts:5` | Hides auto-repair and prompt-context parts. |
| `session-title.ts` (69) | Fork lineage metadata `buddy.forkTitle` (`:8`) | `session-live.ts:6` | `Title (N)` naming. |
| `file-watcher.ts` (46) | Parses `file.watcher.updated` (`:3,22-44`) | `W/lib/directory-chat/use-chat-sync.ts:7,364`; `http/opencode-event-stream.ts:2,126`; `obsidian-vault/service.ts:8` | Notebook file refresh. |
| `file-watcher-native.ts` (43) | `@parcel/watcher` subscription; no OpenCode import | `obsidian-vault/service.ts:473` | Obsidian vault index. |
| `global-event.ts` (72) | `GlobalBus` pub/sub + `publishFileSystemChange` emitting `file.edited` and `file.watcher.updated` (`:38-64`) | `render-svg.ts:202`; `browser-render-requests.ts:305`; `notes/session-title-sync.ts:111,133`; `interaction-actions.ts:223` | Buddy events on the OpenCode stream. |
| `file.ts` (244), `notebook-file-scan.ts` (156) | Notebook file index via ripgrep excluding `.buddy`/`node_modules` (`file.ts:87-100`); contained `read`/`list` (`:127-243`); uses `RipgrepBinary` | `routes/compatibility.ts:276-286`; `project-file-editor-service.ts:130` | `/find/notebook-file-index`, file editor. |
| `llm.ts` (368) | Small-model structured output (`StructuredOutput` tool, JSON fallback), usage via `OpenCodeSession.getUsage` (`:76-116`) | `memory/extractor.ts:298,363` | Learner-memory extraction. `generateSmallText` 0 callers. |
| `theme.ts` (460), `theme-contrast.ts` (226) | Token normalization over vendored `ui/src/theme/*` | `W/theme/{types,color,default-themes,resolve,theme-catalog}.ts` | Themes; imports `V/packages/ui` by relative path. |
| `config-overlay.ts` (52) | In-memory overlay map by canonical directory | `opencode-sync.ts:5` | Overlay storage. |
| `parse-external.ts` (108) | Generic JSON/zod helpers | adapter-internal | |

### 2D. Dead or near-dead (checked by grep over `B/`, `W/`, tests)

- `File.init`: stub (`AD/file.ts:181-183`) called 3× with `.catch(() => undefined)` (`routes/compatibility.ts:239-244,311-316,349-354`). `File.status`, `File.list`: 0 callers.
- `Skill` (`AD/skill.ts`): only `BT/skills/upstream-skill-visibility.test.ts:5`.
- `RuntimeHooks.config` (`AD/plugin-live.ts:34-36,107-146`): only `BT/config/opencode-overlay-isolation.test.ts:277-282`.
- `BuddyTool.toTool` (`create-buddy-tool.ts:85,285`): only `BT/opencode-runtime/buddy-tool-shim.test.ts:143`; production registers via the plugin `tool` map.
- `createCompatiblePluginAskHandler` (`plugin-ask-compat.ts:30-37`): tests only, but lives in `src`.
- `W/lib/opencode-client.ts`: 0 importers.
- Mermaid auto-repair disabled (`interaction-actions.ts:77,957`) but its `Session`/`SessionV2` lookups remain.
- `BUDDY_MIGRATION_DIR`: set in `env.ts:316` and by Electron (`cli.ts:142`); no reader outside tests found.

## 3. `packages/buddy/src/opencode-runtime`

| File (LOC) | Role | Class |
|---|---|---|
| `runtime.ts` (102) | Boot: patch ordering + `Server.Default()` (§4) | A |
| `env.ts` (361) | XDG, runtime-root, `Global.Path` setup | A |
| `client.ts` (57), `in-process-fetch.ts` (59), `fetch-with-overlay.ts` (27) | SDK client over in-process fetch (base `localhost:4096`, `client.ts:29`); `fetchOpenCodeApp` runs `withConfigOverlay` before `app.fetch`; `in-process-fetch.ts` maps `x-buddy-directory` → `x-opencode-directory` (`:41-46`); auth-header builder duplicated with `client.ts:7-16` | B |
| `buddy-tool-shim.ts` (215) | `BuddyTool` → plugin `ToolDefinition`; bridges `ctx.ask/metadata/messages/extra/callID` (`:64-95`); runs tool under `Instance.provide` (`:109-128`) | B |
| `plugin-ask-compat.ts` (37) | Normalizes `ctx.ask` returning Promise or Effect (`:22-28`) | B |
| `subagent-forwarding.ts` (174), `subagent-tool-forwarding-runtime.ts` (130) | Register the prompt interceptor (`:92-112`) and task-tool transformer (`:114-173`); read `ctx.extra.promptOps` (`:59-62`) and `metadata.sessionId`; seed child teaching state and session permissions | A (via registry/prompt hooks) |
| `skill-filtering.ts` (10), `hidden-opencode-skills.ts` (17) | Skill-hiding policy | C |
| `buddy-tool-presentation-catalog.ts` (35) | Loads every Buddy tool descriptor into the registry per directory | C |
| `tool-presentation-strip.ts` (5) | Re-export | B |
| `system-prompt-capture.ts` (109) | Per-session full system prompt in a `globalThis` store (`:5,12-34`); written by `experimental.chat.system.transform` (`buddy-runtime-plugin.ts:248`); read by `learning/adapters/http/session/state-actions.ts:4` | C |
| `legacy-migration-repair.ts` (175) | Repairs the drizzle journal for `20260323234822_events` (`:7,41-46`) with raw SQL | C |
| `plugins/buddy-runtime-plugin.ts` (279) | Hooks: `tool`, `auth`, `provider`, `event` (`session.idle` cleans Bench captures, `:202-206`), `command.execute.before`, `chat.params`, `chat.headers`, `experimental.chat.messages.transform`, `experimental.chat.system.transform` (`:208-271`) | C |
| `plugins/openai-codex-{auth,account,provider,credentials}.ts`, `openai-auth-trace.ts` | ChatGPT OAuth (loopback port 1455 `auth.ts:24,549`; device flow `:695-744`), account email/usage/model catalog, provider hook | C |
| `UPSTREAM-HOOKS.md` (59) | Documents three missing upstream hooks: child-session spawn, skill visibility, pre-prompt transform | |

## 4. Boot sequence

1. `B/app.ts:1` side-effect imports `./opencode-runtime/env.js` before Hono/routes.
2. `env.ts` builds the plan (`:108-207`):
   - `BUDDY_RUNTIME_ROOT` (`:111-114`) → XDG data/cache/config/state = `<root>/{data,cache,config,state}`, tmp `<root>/tmp/buddy` (`:115-120,144-146`); otherwise `XDG_*` or `$HOME/.local/share` etc. (`:122-143`).
   - Buddy dirs = `<xdg>/buddy` unless `BUDDY_{DATA,CACHE,STATE}_DIR` (`:147-163`). OpenCode paths = `<buddy.data>/opencode` (`:92-105`).
   - Global config dir = `BUDDY_GLOBAL_CONFIG_DIR`, else `$BUDDY_TEST_HOME||$HOME/.buddy` (`:165-177`).
3. `configureOpenCodeEnvironment()` (`:297-318`, first call `:352`): sets `XDG_*` only with a runtime root (`:302-307`); sets `BUDDY_GLOBAL_CONFIG_DIR`, `OPENCODE_CONFIG_DIR` (`:308-309`), `OPENCODE_DB=opencode.db` (`:310`); `||=` sets `OPENCODE_DISABLE_EXTERNAL_SKILLS`, `OPENCODE_CLIENT=web`, `OPENCODE_ENABLE_QUESTION_TOOL`, `OPENCODE_ENABLE_EXA` (`:311-315`); sets `BUDDY_MIGRATION_DIR` by walking up from cwd/exec dir (`:316,222-243`); creates runtime dirs (`:270-283`).
4. Import-time override (`:340-361`): XDG data/cache/state → Buddy dirs; XDG config, `TMPDIR`, `TMP`, `TEMP` → Buddy tmp parent; dynamic import of `@buddy/opencode-adapter/global` (vendored module captures `Path` at import, `V/.../core/src/global.ts:9-31`); env restored; `configureOpenCodeEnvironment()` again mutates `Global.Path.*` (`:285-294`).
5. `runtime.ts:34` calls `configureOpenCodeEnvironment()` again at module load.
6. `loadOpenCodeApp()` (`runtime.ts:48-102`), memoized: `ensureRuntimeDirectories` (`:51`) → `initializeBenchCaptureStorage` (`:52`) → `repairLegacyOpenCodeMigrations` (`:54-60`) → `ensureMcpOAuthBrandingPatched` (`:61`) → register runtime plugin factory (`:62-70`) → register OpenAI provider resolver (`:71-84`) → `ensureConfigServicePatched` (`:85`) → `ensureSessionServicePatched` (`:86`) → `ensurePluginServicePatched` (`:87`) → `ensureProviderServicePatched` (`:88`) → `ensureToolInputDeltaBridgePatched` (`:89`) → `ensureSubagentForwardingPatched` (`:90`) → `ensureSkillServicePatched` (`:91`) → `Server.Default()` (`:92`) returns `{ fetch }` (`:93-97`). `ToolRegistry` is patched lazily on first use.
7. Per request, `fetchOpenCodeApp` runs `withConfigOverlay(dir, ...)`.
8. Per-notebook overlay is built before prompts, MCP, and session routes: `withConfigSync` (`http/route-helpers.ts:39-64`) → `syncOpenCodeProjectConfig` (`config/runtime/opencode-sync.ts:105-136`) → `buildOpenCodeConfigOverlay` (`config/opencode/overlay-builder.ts:137-208`) → `setConfigOverlay(dir, overlay, {authoritativeKeys:[mcp]})` (`opencode-sync.ts:81-83`). On fingerprint change, `Instance.dispose()` so vendored config re-bootstraps (`:119-128`); no vendored config PATCH, to avoid writing `config.json` into the project.
9. Desktop passes `OPENCODE_CLIENT=desktop`, `OPENCODE_EXPERIMENTAL_FILEWATCHER=true`, icon discovery (`desktop-electron/src/main/cli.ts:147-150`). The dev launcher also enables the filewatcher (`B/dev/start-with-safe-env.ts:32-35`).

## 5. Behaviour → seam matrix

| Behaviour | Path |
|---|---|
| Chat send | `W state/chat-actions` → `session.promptAsync` → `routes/session.ts:518` → `postSessionPromptAsync` (`interaction-actions.ts:775-806`) → `queueSessionPromptAsync` (`:434-470`). Transform: `ToolRegistry.prime`, prompt pipeline (`message-prompt-pipeline.ts:86-133`, sets `system`, `model`, `agent`, `tools`), `syncBuddyRuntimeSessionPermissions` (`runtime-session-permissions.ts:62-108`, `Session.setPermission`), then `client.session.promptAsync` (`interaction-actions.ts:148`). |
| Session list | `routes/session.ts:328` → `core-actions.ts:254-266` (`client.session.list`). `getSessionById` loads directly through the adapter (`:292`, `lookup.ts:73-98`). |
| Permission prompt | Vendored `permission.asked` → SSE passthrough → `W use-chat-sync.ts:544`. Reply: `chat-actions.ts:2408` → `routes/permission.ts:55-87` → `client.permission.reply`. After reconnect: `permission.list` (`chat-actions.ts:1317`). |
| Tool registration | `RT/buddy-tool-shim.ts:200-215` → plugin `tool` map (`buddy-runtime-plugin.ts:261-265`); schema/output policy/presentation catalog via `registry.ts`. ~43 `createBuddyTool(` definitions under `learning/`. |
| Subagent teaching state | In-memory `Map` capped at 512 (`learning/agent-execution/state/session-state.ts:5-7,41-54`), not persisted. Task transformer (`RT/subagent-forwarding.ts:114-173`) seeds child state + session permissions on `metadata.sessionId`. Only `concise_responses` persists, in session metadata (`concise-response-chat-state.ts:7-8,56-68`). |
| Skill hiding | `skill-live` + `hidden-opencode-skills.ts` (test `upstream-skill-visibility.test.ts:83`). |
| Per-notebook config overlay | §4 step 8. |
| Provider auth | `routes/provider.ts:248-340` → vendored `ProviderAuth` → OpenAI `auth` hook (`openai-codex-auth.ts:610-760`) → `Auth.set` (`:634`) → `provider-live`. Cancel: `provider.oauth.cancel`. |
| MCP | `routes/mcp.ts` (8 ops) → `client.mcp.*`. Buddy config overrides raw `mcp` (`config.ts:73-82`, `opencode-sync.ts:82`). OAuth branding: `mcp-oauth-branding.ts`. |
| File watching | Vendored watcher (flag-gated, `V/packages/core/src/filesystem/watcher.ts`) + Buddy `publishFileSystemChange`. `/event` transform adds `relativePath` (`opencode-event-stream.ts:120-141`). Obsidian uses its own `@parcel/watcher`. |
| Theme | `W/theme/*` → `AD/theme.ts` → `V/packages/ui/src/theme/*`. |
| LLM usage extraction | `llm.ts:76-116` → `memory/extractor.ts:298,363`. |
| Tool UI presentation | §6. |
| Whiteboard tool-input streaming | `tool-input-delta-live` emits `message.part.delta` field `state.raw`; web reads at `W/components/whiteboard/whiteboard-progressive.ts:501-506,617,802` and `state/chat-reducer.ts:271-274`. |
| Subagent UI | `W/components/chat/tools/render/task/*` reads `state.metadata.sessionId` (e.g. `task-card-header.tsx:35`). |

## 6. Event stream end to end

1. Web: `getBuddyClient(dir).event.stream` (`W/state/chat-sync.ts:435`).
2. Buddy `GET /event` (`routes/compatibility.ts:140-215`): `ensureBuddyToolPresentationCatalog` (`:163`), then `fetchInProcessOpenCode` for `/global/event` with SSE accept (`:168-174`).
3. Vendored handler subscribes to `GlobalBus` and forwards everything, no directory filter (`V/.../handlers/global.ts:33-41`).
4. `transformOpenCodeEventStreamResponse` (`opencode-event-stream.ts:225-312`) rewrites two payload types and passes the rest (`:160-171`): `file.watcher.updated` gets `relativePath` (outside-workspace paths dropped, `:120-141`); `message.part.updated` gets `metadata.buddy.presentation` (`:143-158`).
5. Buddy multiplexes Bench lease/action events into the stream when the query has `workspaceInstanceID` + `connectionGeneration` (`compatibility.ts:179-212`).
6. Web handles (`use-chat-sync.ts:339-640`): `server.connected`, `server.heartbeat`, `reference.updated`, `notes.library.updated`, `svg.render_request`, `server.instance.disposed`; `session.created/updated/status/error`; `message.updated/removed`, `message.part.updated/removed/delta`; `permission.asked/replied`; `question.asked/replied/rejected`; `file.watcher.updated`; Bench lease/action events. Everything else dropped silently.
7. Buddy in-process subscribers: `session.updated` for note-title sync (`notes/session-title-sync.ts:24-29,111`); `session.error`/`message.updated` for SVG repair (`interaction-actions.ts:213-232`).
8. Decoration: `withToolPresentationOnPart` (`session-tool-presentation.ts:70-90`) picks a descriptor (per-directory catalog → core catalog → runtime fallback, `registry.ts:393-408`), builds the snapshot (`tool-presentation.ts:414-474`), writes `metadata.buddy.presentation`, strips duplicates from `state.metadata`. History: `withToolPresentationOnMessages` (`core-actions.ts:557`). Web decodes at `W/components/chat/tools/parse-tool-presentation.ts:11-18` and `state/chat-tool-parts.ts:26`. Stripped before the model call (`buddy-runtime-plugin.ts:135-139,213`). `message.part.delta`, `message.updated`, and `sync` frames are not decorated.

## 7. Web and SDK

- Web `package.json` depends on `@opencode-ai/sdk` and `@buddy/opencode-adapter` (`:32,47`). All runtime data calls use `getBuddyClient` (`W/lib/buddy-client.ts:9-24`).
- Adapter modules web imports at runtime: `tool-presentation` (13 files, 4 type-only), `message-visibility`, `file-watcher`, `theme` (5 files), `provider-icon`; test-only `core-tool-presentations`. `theme` and `provider-icon` pull vendored UI code into the web build.
- `packages/sdk`: only `src/index.ts` (36 lines) is hand-written; `src/gen` is gitignored and absent in this worktree. Generated from the running backend's `/doc` (`scripts/generate.ts:17,34-37`). Its `AGENTS.md` calls it Buddy's compatibility API, not an OpenCode mirror. Requests carry `x-buddy-directory` (`src/index.ts:19-26`).
- OpenAPI types mirroring OpenCode v1 shapes: `Session` (`Session.Info`, `routes/session.ts:335,354,395,433,695,721,741`); `SessionStatus` (`:375`); `Message`, `Part`, `ToolPart`, `TextPart`, `ReasoningPart`, `FilePart`, `AgentPart`, `OutputFormat` (`MessageV2.WithParts`, `:454,506,555`); `PermissionRequest` (`routes/permission.ts:35`); `Project` (`routes/project.ts:28,45,69`); `McpStatus` (`routes/mcp.ts:24-25`); `FileNode`, `FileContent` (`compatibility.ts:298,336`); `Command` (`compatibility.ts:612`); `Provider`, `ProviderAuthMethod`, `ProviderAuthAuthorization` (`routes/provider.ts:40-52,256`); config providers (`routes/config.ts:52`); auth request body (`routes/auth.ts:28`).
- Not mirrored: events (SSE schema is `z.string()`, `compatibility.ts:150`); prompt/command bodies (loose objects, `routes/session.ts:96-134`); question/reference/skills (Buddy zod, `routes/question.ts:16-32`).
- Web type derivation: `W/state/chat-types.ts:2-14,26-79` builds `MessageInfo`/`MessagePart` from `Extract<SdkMessage, {role}>`; `chat-event-schemas.ts` hand-writes zod that `satisfies z.ZodType<MessageInfo>` (`:99-102,112,123,...`), so SDK drift is caught at typecheck.
- Web depth (files touching): `MessagePart`/`MessageInfo` 56; SDK `Part`/`Message`/`ToolPart` 47; tool-part detection 17; presentation 15; permission request 16; `message.*` event names 3 (`use-chat-sync.ts`, `chat-sync.ts`, `chat-stream-event-buffer.ts`). Union of the first, second, third, and event sets: 78; plus presentation and permission: 91. `W/` has 940 `.ts/.tsx` files; 48 test files match.
- Shapes web relies on: tool part `state.{status,input,raw,metadata,time,output,error,title,attachments}` (`components/chat/tools/parse-tool-state.ts:47-79`); part types `text`, `reasoning`, `tool`, `file`, `agent`, `step-start`, `step-finish`, `patch`, `snapshot`, `retry`, `compaction`, `subtask`; message `info.time.completed`, `parentID`, `finish`, `tokens`, `cost`; permission-denied prefix (`W/components/chat/tools/tool-permission.ts:6`, duplicated at `tool-presentation.ts:323`); pagination via `x-next-cursor` (`W/state/session-messages.ts:17,67`).

## 8. Bad separation and duplication

Product logic in the adapter:
- Tool UI contract (~1,100 lines: `tool-presentation.ts`, `core-tool-presentations.ts`, `session-tool-presentation.ts`).
- `message-visibility.ts`, `session-title.ts`, fork naming inside the patch (`session-live.ts:155-170`).
- Notebook file index with `.buddy` exclusion (`file.ts:87-100`).
- Theme contrast (`theme.ts`, `theme-contrast.ts`).
- Project-id cache written into `.git` (`project.ts:93-107`).
- `llm.ts` structured-output helper; Buddy brand constants in `mcp-oauth-branding.ts:5-7`.

Adapter internals leaking into routes and features:
- `routes/compatibility.ts:6-8` imports `Command`, `File`, `Instance`. `/file` and `/file/content` are served by vendored File via the SDK (`:319,357`) while their OpenAPI declares Buddy's `File.Node/Content` (`:298,336`); `/file/edit` and `/find/notebook-file-index` use Buddy's `File` — two file stacks.
- `http/session.ts:36-49` compares sessions via `OpenCodeInstance.project.id`.
- `learning/` writes OpenCode session permission rules for dynamic tool grants (`dynamic-tool-grants.ts:1-5`, `runtime-session-permissions.ts:102-105`).
- `write-without-prompt.ts:8-14,44` calls vendored `WriteTool` through `AppRuntime`.
- `diagnostics.ts:57-65` boots OpenCode by fetching `http://opencode.local/agent`.
- Memory consolidation runs a real OpenCode session and archives it (`consolidation.ts:331-387`).
- Two ways to ensure the runtime is booted: `loadOpenCodeApp()` (`runtime-session-permissions.ts:67`) and the `/agent` fetch.
- Two path authorities: vendored `Global.Path` (`generated-image.ts:74`, `overlay-builder.ts:94`) and Buddy's `storage/global.ts` (`config-paths.ts:49`, `open-project-registry.ts:62`).

Duplicated or fragile patterns:
- Auth-header builder duplicated (`RT/client.ts:7-16`, `RT/in-process-fetch.ts:14-23`).
- Session-not-found detection duplicated (`session/orchestration/lookup.ts:26-39`, `subagent-tool-forwarding.ts:62-69`).
- Realpath-or-resolve canonicalization repeated (`config-overlay.ts:26`, `registry.ts:53`, `plugin-live.ts:45`, `system-prompt-capture.ts:36`, `session-state.ts:11`).
- `patchPromise`/`ensurePatched` boilerplate in six modules.
- `withConfigOverlay`'s `_directory` ignored (`config.ts:197-200`); overlay applied once per cached config identity (`config.ts:167,178`), so changes need `Instance.dispose` (`opencode-sync.ts:122-127`).
- Process-wide `globalThis` singletons: `Symbol.for("buddy.opencodeSyncState")` (`opencode-sync.ts:20,46-61`), `__buddySystemPromptCaptureStore__` (`system-prompt-capture.ts:5`).
- String-matched vendored contracts: `NotFoundError` + message prefix `Session not found:` (`lookup.ts:26-39`); permission-denied prefix (`tool-presentation.ts:323`); `ctx.extra.promptOps` (`subagent-forwarding.ts:59-62`; vendored `task.ts:197`); `metadata.sessionId` (`subagent-forwarding.ts:47-51,134-139`).
- Boot-order check by source-text search (`check-import-contract.ts:139-155`); registry patch lazily relies on `prime()` callers.
- Buddy's on-disk config schema embeds OpenCode v1 schemas (`config/contract/schema.ts:18-36`).
- Bench prompt teaches the model the v1 SQLite layout (`chat-transcripts.ts:5-6`).
- `UPSTREAM-HOOKS.md` describes the prompt interceptor as general, but it only affects `consolidation.ts:363`; real chat prompts go through the SDK path.

## 9. Tests covering these seams

Adapter (`packages/opencode-adapter/test`, 8 files):
- `file.test.ts` (275): notebook scan edge cases (cap, abort, timeout, ordering); path containment vs symlinks.
- `global-event.test.ts`: workspace-contained filesystem events; subscribe/unsubscribe on vendored `GlobalBus`.
- `mcp-oauth-branding.test.ts`: `end` callback handling, branded client metadata, branded success page.
- `project.test.ts`: opens repos when the cache can't be written; file-origin repos stay distinct.
- `session-title.test.ts`: fork numbering and lineage; vendor-suffix adaptation.
- `theme-contrast.test.ts`: contrast across bundled themes.
- `tool-input-delta-live.test.ts`: delta forwarding/dedupe with a fake AI SDK stream (pure bridge only).
- `tool-presentation.test.ts`: phases, outcomes, descriptors incl. vendored MCP resource tools.

Buddy `opencode-runtime` and `http`:
- `BT/opencode-runtime/buddy-runtime-plugin.test.ts`: concise-prompt stripping, verbosity, tools in registry after sync, AGENTS.md filtering, concurrent overlay build, OpenAI auth branding, User-Agent semver.
- `buddy-tool-shim.test.ts`: presentation catalog registration, Zod → args shape, execution, optional args, metadata, attachments, `messages`/`extra` forwarding.
- `fetch-with-overlay.test.ts`: SDK sees Buddy overlays for agents, skills, commands, providers, MCP.
- `provider-model-resolution.test.ts`: refreshed provider lists change picker and runtime lookup.
- `session-live.test.ts`: clone-on-read and in-place permission updates.
- `tool-input-delta-bridge.test.ts`: bounds and malformed events (pure).
- `tool-presentation-strip.test.ts`; `llm-json-fallback.test.ts`; `openai-codex-{account,auth,provider}.test.ts`.
- `BT/http/opencode-event-stream.test.ts`: `message.part.updated` decoration (`:83`), MCP frames without descriptors (`:146`), watcher paths incl. Windows (`:216,242`), backpressure (`:268`). `sdk-response.test.ts`.

Other seam tests:
- `config/opencode-overlay-isolation.test.ts` (directory scoping, canonical aliases, MCP authority, plugin config hooks); `config/external-directory-permission.test.ts`; `config/pollution-regression.test.ts` (no `config.json` in the project); `parity/agent.test.ts`; `config/agent-default.test.ts`.
- `opencode-runtime-env.test.ts` (545 lines: env plan, `Global` alignment, fail-closed test-storage guards); `opencode-runtime-legacy-migration-repair.test.ts`; `opencode-sdk-client.test.ts`; `proxy-registration.test.ts`.
- `learning/subagent-tool-forwarding.test.ts` (869 lines: interceptor `:322`, task-tool transformer `:455`, named task tool `:601`, flashcard-author `:738`); `learning/runtime-tool-registration.test.ts`; `learning/dynamic-tool-permission-toggle.test.ts`; `learning/runtime-session-permissions.test.ts`; `learning/concise-response-chat-state.test.ts`; `learning/external-file-tool-permissions.test.ts`; `learning/learner-memory-pipeline.test.ts`.
- `skills/upstream-skill-visibility.test.ts`; `skills/tool-visibility.test.ts`.
- `session/session-api-parity.test.ts`; `session/message-route.test.ts` (persisted transcript after dispose, tool-history enrichment, cursor headers); `session/command-transcript.test.ts`; `session/abort-tools.test.ts`; `session/sse-event-compatibility.test.ts`; `session/prompt-preflight-regression.test.ts`.
- `mcp/routes.test.ts`; `permission/routes.test.ts`; `local-runtimes-routes.test.ts`. Shared fixture: `BT/helpers/opencode.ts`.

Gaps: nothing tests `LLM.Service.stream`/`Session.updatePart` patching; the `Config.Service.get` overlay merge is covered only indirectly (`opencode-overlay-isolation.test.ts`).

## 10. Unverified or open

- Exact generated SDK type names (generated files absent in the worktree).
- Why the `session-live` canonical-object cache exists.
- Whether `buddy-runtime-plugin.ts:273-279` (default `Plugin` export) is loaded as a normal plugin anywhere.
- The consumer of `BUDDY_MIGRATION_DIR`.
