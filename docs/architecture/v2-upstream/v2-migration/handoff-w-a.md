# W-A handoff: host lifecycle + Buddy runtime plugin on the v2 API

Written 2026-10-08 by the W-A agent when the workstream was reassigned mid-run. Paths are repo-relative unless they start with `vendor/opencode/...` (the vendored v2.0.24 tree). Nothing below has been typechecked, linted, or tested yet (see section 6).

## 1. Done

All of these files are written and complete. None has been verified.

| File | State | What it does now |
|---|---|---|
| `packages/opencode-adapter/src/host.ts` | new | `createOpenCodeHost(options)` wraps `@opencode/sdk` `OpenCode.create`. It dynamic-imports the SDK, so importing `host.ts` stays cheap: `env.ts` imports it at process start. It also exports `configureOpenCodeGlobalPaths(paths)`, the types `OpenCodeHost` (= `OpenCode.Interface`), `OpenCodeHostOptions`, `OpenCodeHostPaths`, `OpenCodeLogEntry` and `OpenCodeLogOptions`, the constant `OPENCODE_VERSION` (read from the vendored sdk `package.json`), the value `ClientError`, the namespace `OpenCodeTypes` (`export type * as` over every generated `@opencode/client` type), and the named types `OpenCodeEvent`, `SessionInfo`, `SessionMessageInfo`, `PermissionRequest`, `PermissionReply`, `PermissionEffect`, `LocationRef`. |
| `packages/opencode-adapter/src/plugin.ts` | new | Re-exports for Buddy plugin code: `Plugin` (promise API), `Permission` (schema, for `Permission.ID.create()`), `ToolError` (= `@opencode/schema/tool` `Tool.Error`), and the types `Registration`, `SessionContext`, `SessionPrompt`, `SkillEditor`, `ToolInfo`, `ToolResult`, `ToolContext`, `ToolEditor`, `Tool`. More re-exports will be needed (event types for the plugin event stream, etc.). |
| `packages/opencode-adapter/package.json` | edited | Added `"./host"` and `"./plugin"` exports (one small Edit). Left alone: another agent's `"./gateway/*"` wildcard, and the removed transcript-contract entries. |
| `packages/buddy/src/opencode-runtime/client.ts` | rewritten | `getOpenCodeClient(): Promise<OpenCodeHost>` returns the singleton host. It takes no directory argument, because v2 scopes each call with `location: { directory }`. It re-exports `type OpenCodeHost`. The coordinator asked for both names to stay stable. |
| `packages/buddy/src/opencode-runtime/runtime.ts` | rewritten | `getOpenCodeHost()` is a lazy singleton: it resets on a failed start, so the next call retries. `closeOpenCodeHost()` is for tests and shutdown. `ensureRuntimeDirectories()` is kept. Start order: `configureOpenCodeEnvironment()` → `ensureRuntimeDirectories()` → `initializeBenchCaptureStorage()` → `repairLegacyOpenCodeMigrations(paths.database)` → `createOpenCodeHost({ clientName: "buddy", paths, databasePath: paths.database, plugins: createBuddyOpenCodePlugins({ getClient: getOpenCodeHost }), log: { level: "warn", emit: console forwarder }, fetchModels: !OPENCODE_DISABLE_MODELS_FETCH })`. **It imports `./plugins` (`plugins/index.ts`), which does not exist yet.** |
| `packages/buddy/src/opencode-runtime/env.ts` | rewritten | The pure planner `resolveOpenCodeEnvironmentPlan` is kept. The plan's `openCode` is now `{ data, cache, config, state, tmp, database }`: `database` = `<buddy data>/opencode/opencode.db`, and `bin`/`log`/`repos` were removed. The plan's `defaults` is now only `{ configDirectory }`. New export `openCodeRuntimePaths()`. `configureOpenCodeEnvironment()` sets XDG_* only when `BUDDY_RUNTIME_ROOT` is set, sets `BUDDY_GLOBAL_CONFIG_DIR` and `BUDDY_MIGRATION_DIR`, runs `mkdirSync` on the OpenCode dirs, calls `configureOpenCodeGlobalPaths`, and returns the paths. It runs once at module load. `BUDDY_TMP_DIR` is still exported. Removed: the v1 temporary-environment dynamic import of `@buddy/opencode-adapter/global`, and the env vars `OPENCODE_CONFIG_DIR`, `OPENCODE_DB`, `OPENCODE_CLIENT`, `OPENCODE_ENABLE_QUESTION_TOOL`, `OPENCODE_ENABLE_EXA` and `OPENCODE_DISABLE_EXTERNAL_SKILLS`. v2 core does not read any of them (checked with grep over core/util/server/sdk/plugin). |
| `packages/buddy/src/opencode-runtime/legacy-migration-repair.ts` | edited | `repairLegacyOpenCodeMigrations(databasePath: string)` now takes the DB path explicitly. The `@buddy/opencode-adapter/storage-db` import is gone. The module is **kept on purpose** (reason in section 2). |
| `packages/buddy/src/opencode-runtime/hidden-opencode-skills.ts` | rewritten | Identity is now v2 `{ id, path }`. The hidden skills are the v2 built-ins `opencode` (`/builtin/opencode.md`, the OpenCode self-help skill that replaced v1 `customize-opencode`) and `report` (`/builtin/report.md`, files OpenCode bug reports via `gh`). Exports `isSuppressedOpenCodeSkill({ id, path })` and `removeSuppressedOpenCodeSkills(editor: SkillEditor)`, which is meant for `ctx.skill.transform`. |
| `packages/buddy/src/opencode-runtime/buddy-tool-presentation-catalog.ts` | rewritten | Buddy-owned, with no v1 registry dependency, as the coordinator requested. Exports `registerBuddyToolPresentationCatalog(directory: string, registrations: readonly BuddyToolPresentationRegistration[]): void`, `ensureBuddyToolPresentationCatalog(directory: string): Promise<void>` (lazily loads all Buddy feature and dynamic tools, then registers them for that directory) and **`getBuddyToolPresentationDescriptor(directory: string, toolName: string): ToolPresentationDescriptor \| undefined`**. That last one returns the Buddy-authored descriptor for that directory, falls back to `getCoreToolPresentationDescriptor(toolName)` (the same semantics as v1 `ToolRegistry.getToolPresentationDescriptor`), and returns clones. Catalog keys are the realpath'd directory. With this module in place, `packages/opencode-adapter/src/registry.ts` can be deleted. |
| `packages/buddy/src/learning/runtime/create-buddy-tool.ts` | edited | The authoring API (`createBuddyTool({...})`) is unchanged, but its types are now Buddy-owned. Added `BuddyToolExecuteResult` (`{ title, output, metadata, attachments? }`), `BuddyToolAttachment` (`{ type: "file", mime, url, filename? }`), `BuddyToolPermissionRequest` (`{ permission, patterns, always, metadata: TJsonObject }`), and a `BuddyToolContext` with `sessionID`/`messageID`/`agent` as `string`, `abort: AbortSignal`, `callID?`, `extra?: TJsonObject`, `messages: MessageV2.WithParts[]` and `metadata()`/`ask()`. `BuddyTool.jsonSchema` is now **required** (`TJsonObject`). Removed: `toTool()` (the v1 Effect registry path), the v1 `@buddy/opencode-adapter/tool` and `effect-runtime` imports, and the `effect` import. `messages` still has a type-only import from `@buddy/opencode-adapter/message`, which is v1 and broken (a deliberate seam, see section 4). New exported types: `BuddyToolAttachment`, `BuddyToolExecuteResult`, `BuddyToolPermissionRequest`. |

Edited by others, not by me: `script/check-import-contract.ts` (changed by someone else; I have not touched it yet) and `packages/buddy/test/opencode-runtime/buddy-tool-shim.test.ts` (W-B swapped an import line).

## 2. Design decisions and why

- **One host per process, created lazily.** The SDK is dynamic-imported inside `createOpenCodeHost`. The host gets explicit `paths`, `databasePath`, `clientName`, `plugins`, `log` and `fetchModels`, and the adapter adds `config: { directory: paths.config }`. Nothing reaches OpenCode through env vars any more.
- **App identity and the User-Agent.** The host passes `app = { name: clientName ("buddy"), version: OPENCODE_VERSION (2.0.24), channel: "latest" }`. v2 sends `User-Agent: opencode/<channel>/<version>/<app.name>` on every model request (`vendor/opencode/packages/core/src/app.ts` `useragent`). The `opencode` provider plugin also sets it explicitly for Console/Zen (`core/src/plugin/provider/opencode.ts:172`). So v1's `chat.headers` UA hook is dropped: the release identity now comes from `app.version`. Also note that `app.name` becomes MCP `clientInfo.name` and the `x-opencode-client` header. W-F may want MCP OAuth branding to say "Buddy".
- **XDG/tmp isolation.** In v2, `Global.Path` (`vendor/opencode/packages/util/src/global.ts`) is computed when the module loads, from `XDG_*` and `os.tmpdir()` (`util/src/global-roots.ts`), and `tmp = os.tmpdir()/opencode`. That is why the smoke run showed `/private/tmp/opencode`. `Path` is a plain mutable object, and `Global.make()`/`layerWith()` read it lazily when the layer is built. The only value captured at module load is `Flock.setGlobal({ state })`. So `configureOpenCodeGlobalPaths` overwrites `Path.data/cache/config/state/tmp/bin/log/repos` and calls `Flock.setGlobal` again. `host.ts` imports `vendor/opencode/packages/util/src/global.ts` and `flock.ts` through **relative paths**, because `@opencode/util` is not a dependency of the adapter, and `bun install` is forbidden. The other direct readers of `Global.Path` (`core/src/file-access.ts` `home`, `util/src/observability/logging.ts`, `server/src/process.ts`) all read lazily. Resulting layout, same as v1: data = `<buddy data>/opencode`, cache = `<buddy cache>/opencode`, state = `<buddy state>/opencode`, tmp = `<buddy tmpParent>/opencode`, config = Buddy global config dir (`~/.buddy` or `BUDDY_GLOBAL_CONFIG_DIR`). **Not verified:** that the relative import resolves to the *same module instance* that the SDK reaches through `@opencode/util/global`. It should, because Bun resolves symlinks to their real path. A test must assert `host.server.info().paths.tmp` equals the realpath of the Buddy tmp dir.
- **DB path.** The DB path is the absolute `<buddy data>/opencode/opencode.db`, which is exactly v1's `Global.Path.data + OPENCODE_DB`. So v2's auto-mounted V1Migration (`core/src/database/v1-migration.bun.ts`) migrates old sessions in place.
- **Why legacy-migration-repair stays.** v2's `DatabaseMigration.applyOnly` (`core/src/database/migration.ts`) seeds its new `migration` table from `__drizzle_migrations` rows only `WHERE name IS NOT NULL`. A v1 DB with the known null-name `20260323234822_events` row, which Buddy's repair fixes, would make v2 replay `CREATE TABLE event_sequence`. The Database layer would die and the host would never boot. The repair must run before `OpenCode.create`. Once v2's `migration` table is seeded, the repair becomes a harmless no-op.
- **Client API.** `getOpenCodeClient()` returns the host itself (generated client + `sessions`/`events` aliases + `plugin()` + `close()`). The following are all gone: per-directory clients, the `x-opencode-directory` header, basic-auth headers, and the config overlay fetch.
- **Raw fetch / event stream.** The promise SDK does not expose its in-memory `fetch` (`sdk/src/promise.ts` builds the client from `host.fetch` internally, and `sdk/src/internal/*` is not exported). Decision: delete `in-process-fetch.ts` and `fetch-with-overlay.ts` (not done yet, see section 4). Routes should use `client.event.subscribe({ signal })`, a typed `AsyncIterable<OpenCodeEvent>` over one shared SSE connection, and re-encode it for Buddy's SSE. v2 has one global stream; each event carries `location?: { directory, workspaceID? }`.
- **Plugin structure (designed, not yet written).**
  - `plugins/index.ts` exports `createBuddyOpenCodePlugins({ getClient }): Plugin.Plugin[]`, which returns `[createBuddyRuntimePlugin(...)]`. **This is the seam where W-F appends the v2 Codex/provider plugin.** No v1 Codex hooks are registered.
  - `plugins/buddy-runtime-plugin.ts` holds `createBuddyRuntimePlugin({ getClient, loadToolMessages? })` → `Plugin.define({ id: "buddy.runtime", setup(ctx) })`. Everything per-directory closes over `ctx.location.directory`.
  - `getClient` is injected rather than imported, to avoid a runtime ↔ plugin import cycle. Tools only call it during execution.
- **Promise tool error semantics (v2 trap, see section 5).** A rejected promise tool becomes a defect. The runner still marks the tool failed and the model continues (`core/src/session/runner/step.ts` `classifyToolExits` → `failUnsettledTools`). The shim should rethrow Buddy errors as `ToolError({ message })` so `toSessionError` gives `type: "tool.execution"` instead of `"unknown"`. The one exception is abort errors, which must be rethrown untouched.
- **Tool input schema.** Pass a Standard Schema passthrough: `{ "~standard": { version: 1, vendor: "buddy", validate: (value) => ({ value }), jsonSchema: { input: () => tool.jsonSchema, output: () => tool.jsonSchema } } }`. v2 then advertises Buddy's normalized JSON Schema (`core/src/tool/runtime.ts` `isStandardJSONSchema` path), and validation stays in `tool.run` (`normalizeInput` → zod → `formatValidationError`), exactly like v1's `parameters: Schema.Unknown + jsonSchema`. If we passed zod or raw JSON Schema instead, v2 would validate *before* `normalizeInput`, which would be a regression.
- **Output policy.** v2's `ToolOutput.truncate` skips any result whose `metadata.truncated !== undefined` (`core/src/tool-output.ts`). The shim should set `metadata.truncated = false` when `tool.output` (maxLines/maxBytes) is set and the output fits it. That replaces the v1 registry's re-read of `outputPath`. The v1 JSON-schema catalog is not needed; the schema goes straight into `input`.
- **Tool result mapping (designed).**
  - **Content:** `{ content: [{ type: "text", text: output }, ...attachments.map(a => ({ type: "file", uri: a.url, mime: a.mime, name: a.filename }))], metadata }`.
  - **Never include an `output` key.** With no output schema, v2 dies with "Tool result declared output without an output schema".
  - **Metadata must be JSON:** v2 stores it as `Schema.Json`, so drop `undefined` values.
  - **Title:** v2 tool state has no `title` field. Put it at `metadata.buddy.title` so the gateway (W-C) can render it.
  - **Options:** `options: { codemode: false }`, `name: tool.id`.
  - **Progress:** `ctx.metadata({ title, metadata })` maps to `context.progress({...metadata, buddy: {..., title}})`, which publishes ephemeral `session.tool.progress`.
- **ask / permission (designed, file not written).** `opencode-runtime/tool-permission.ts`, `askBuddyToolPermission(client, { sessionID, agent, messageID, callID, request, signal })`:
  1. Generate `id = Permission.ID.create()`. The create route accepts a caller-supplied id.
  2. Subscribe to `client.event.subscribe({ signal: AbortSignal.any([signal, local]) })` and wait for the first `server.connected` (`SharedEvents` replays it to late subscribers, and it marks the subscription live).
  3. Call `client.permission.create({ sessionID, id, action: request.permission, resources: request.patterns, save: request.always, metadata: JSON-safe(request.metadata), source: { type: "tool", messageID, id: callID }, agent })`.
  4. If the effect is `allow`: return. If `deny`: throw `ToolError("Permission denied: <action>")`. If `ask`: wait for `permission.replied` with `data.requestID === id`.
  5. On `once`/`always`: return. On `reject`: call `client.session.interrupt({ sessionID })` (fire-and-forget on the server side) to keep v1/built-in "deny ends the turn" behaviour, then throw `ToolError("The user declined this tool call")`.
  6. On abort while waiting: best-effort `client.permission.reply({ sessionID, requestID: id, decision: "reject" })` so the UI dock clears; swallow errors.
  `create` is **non-blocking**: it returns `{ id, effect }` (`core/src/permission.ts` `ask`).

## 3. v1 hook/patch → v2 replacement, with status

| v1 item | v2 replacement | Status |
|---|---|---|
| `tool` hook + `buddy-tool-shim.ts` | `ctx.tool.transform(e => e.add(info))`, with `Tool.Info` built by a rewritten shim (section 2 design) | not started (create-buddy-tool types done) |
| `plugin-ask-compat.ts` / `ctx.ask` | `tool-permission.ts`: host `permission.create` + `permission.replied` wait | designed, not written. Delete `plugin-ask-compat.ts`. |
| `experimental.chat.system.transform`: CLAUDE.md/context.md filter | **delete**. v2 discovers only `AGENTS.md` (global config dir + ancestors: `core/src/config/plugin/instruction.ts`; nested via read tool: `core/src/tool/plugin/read.ts` `FILENAME = "AGENTS.md"`). Config `instructions` is normalized but has no consumer in 2.0.24. Nothing is left to filter. v1 kept AGENTS.md too, so behaviour matches. | decided, not applied |
| system transform: concise-response stripping | `ctx.session.hook("context")`: map `event.system` (`Array<{type:"text", text}>`) through `stripConciseResponseInstructions` when `readTeachingSessionState(directory, event.sessionID)` says base concise is off | not started |
| system transform: system-prompt capture | same hook: `captureSessionSystemPrompt({ directory, sessionID, fullSystemPrompt: system.map(p => p.text).join("\n\n") })`. `system-prompt-capture.ts` itself needs no change. | not started |
| `experimental.chat.messages.transform` tool-presentation strip | **delete**. v2 sends only `tool.state.content` to the model, never tool `metadata` (`core/src/session/runner/to-llm-message.ts` `toolResult`), and `providerMetadata` comes only from provider state. Delete `opencode-runtime/tool-presentation-strip.ts` and `test/opencode-runtime/tool-presentation-strip.test.ts`. The transcript-contract module stays (adapter `session-tool-presentation.ts` uses it). | decided, not applied |
| `chat.params` textVerbosity | `ctx.session.hook("context")`: `event.options.textVerbosity` low → medium for production personas when concise responses are off (keep `applyConciseResponseTextVerbosity`). The order works: v2's internal `VerbosityPlugin` (sets "low") is in `internal.pre`, which activates before SDK plugins (`core/src/plugin/supervisor.ts`), so Buddy's hook sees "low". | not started |
| `chat.headers` opencode UA | **delete**. v2 sends `opencode/latest/2.0.24/buddy` via `app` (section 2). | done (host side). Delete the hook code when the plugin is rewritten. |
| `command.execute.before` compact display | `ctx.session.hook("prompt")` + a Buddy-owned scope. v2 template commands call `ctx.session.prompt({ text: expanded })` with no metadata (`core/src/config/plugin/command.ts`), so the prompt hook cannot tell a command apart from a normal prompt. Plan: new `opencode-runtime/command-display.ts` with `runWithCommandInvocationDisplay({ sessionID, command, argumentsText }, run)`; the route wraps `client.session.command(...)` in it. The prompt hook consumes the pending entry once per sessionID and sets `event.metadata.buddy.command = { name, arguments, display: "/cmd args" }`. The model still gets the full expanded `prompt.text`; the transcript (W-C) renders `display` for user messages that carry it. Do not import `session/orchestration/command-transcript.ts` (it pulls in v1 adapters); re-implement the 3-line `formatCommandInvocationDisplay`. | designed, not written |
| `event` `session.idle` bench cleanup | `ctx.event.subscribe({ signal })` loop; on `session.execution.succeeded \| failed \| interrupted` call `cleanupBenchCapturesForSession(event.data.sessionID)`. `session.idle`/`session.status` are declared but never published in v2. The plugin event stream is Location-filtered (`core/src/bus.ts` `local`). Setup returns a cleanup that aborts the loop. | not started |
| skill hiding (`skill-filtering.ts` + `skill-live`) | `ctx.skill.transform(removeSuppressedOpenCodeSkills)`. Built-in `SkillPlugin` is in `internal.pre`, so its skills already exist when Buddy's transform runs. | helper done; wiring not started. Delete `skill-filtering.ts`. |
| Codex `auth`/`provider` hooks | out of scope; seam = `plugins/index.ts` `createBuddyOpenCodePlugins` | seam designed, file not written |
| subagent forwarding | stop calling at boot (`runtime.ts` no longer calls `ensureSubagentForwardingPatched`); files left untouched | done |
| `legacy-migration-repair.ts` | kept (section 2) | done |
| adapter `plugin-live.ts`, `skill-live.ts`, `tool-input-delta-live.ts`, `config-overlay.ts` (+ package.json exports + tests) | delete. v2 streams tool input natively (ephemeral `session.tool.input.*` deltas). Check routes/session/http importers first. | not started |
| `script/check-import-contract.ts` `checkToolInputDeltaBridgeStartup` | remove the check (it hardcodes v1 `runtime.ts` strings). The file was already modified by someone else, so read it first. | not started |
| tests | see section 4 | not started |

## 4. What is left, in order

1. `packages/buddy/src/opencode-runtime/tool-permission.ts`: implement `askBuddyToolPermission` exactly as in section 2.
2. `packages/buddy/src/opencode-runtime/buddy-tool-shim.ts`: rewrite.
   - `loadBuddyPluginTools(): Promise<BuddyTool[]>`: feature + dynamic tools, with the duplicate-id check.
   - `buddyToolToToolInfo(tool, runtime: { directory, getClient, loadMessages }): ToolInfo`: section 2 mapping, catching errors into `ToolError`, output policy → `truncated: false`, JSON-safe metadata, `buddy.title`.
   - `registerBuddyToolPresentationCatalog(directory, tools)` call in plugin setup.
   - `messages`: call the injected `loadMessages({ directory, sessionID })`. The default in `runtime.ts`/plugin options is `async () => []`. **Seam for W-C:** fill it with gateway-mapped transcript messages, and swap the `MessageV2.WithParts` type in `create-buddy-tool.ts` for the transcript-contract message type.
   - Tools that read `ctx.messages` (they get `[]` until then): `image-generation/service/generated-image-authorization.ts` (fails closed), `svg-rendering/tools/render-svg.ts`, `diagrams/tools/render-mermaid.ts`, `reading/tools/ingest-full-text.ts`, `lesson-workspace/tools/write-without-prompt.ts` (the last also uses v1 internals of its own). `ctx.extra` is never set in v2.
3. `packages/buddy/src/opencode-runtime/command-display.ts` (section 3).
4. `packages/buddy/src/opencode-runtime/plugins/buddy-runtime-plugin.ts`: rewrite as `createBuddyRuntimePlugin`, with this `setup`:
   1. `preloadBuddyBootstrapGraph()`
   2. tools
   3. catalog
   4. `ctx.tool.transform`
   5. `ctx.skill.transform(removeSuppressedOpenCodeSkills)`
   6. `ctx.session.hook("context", …)` (verbosity + concise strip + capture)
   7. `ctx.session.hook("prompt", …)` (command display)
   8. execution-event cleanup loop
   9. return cleanup

   Keep `applyConciseResponseTextVerbosity` exported. Drop `compactCommandInvocationBeforeExecute`, the instruction filter, the strip, the UA hook and the Codex hooks.
5. `packages/buddy/src/opencode-runtime/plugins/index.ts`: `createBuddyOpenCodePlugins({ getClient, loadToolMessages? })`.
6. Delete from `packages/buddy/src/opencode-runtime/`:
   - `fetch-with-overlay.ts`
   - `in-process-fetch.ts` (used by `routes/compatibility.ts:168` for `/global/event`; W-C replaces it with `client.event.subscribe`)
   - `plugin-ask-compat.ts`
   - `skill-filtering.ts`
   - `tool-presentation-strip.ts`
   - `UPSTREAM-HOOKS.md` (stale: all three hooks it requests now exist in v2)

   Then update `index.ts` to export `./env`, `./runtime`, `./system-prompt-capture`.
7. Delete adapter modules + their `exports` entries + tests: `plugin-live.ts`, `skill-live.ts`, `tool-input-delta-live.ts`, `config-overlay.ts`. Grep importers first and keep anything routes/session/http still import.
   - Also obsolete after this work: `registry.ts` (catalog moved; other v1 users: `learning/agent-execution/transforms/*`, adapter `session-tool-presentation.ts`), `effect-runtime.ts`, `tool.ts`, `global.ts`, `storage-db.ts`. Do not delete them while other files still import them.
   - `global.ts` should become a one-liner re-exporting v2 `util/src/global.ts` (`Global.Path`) for `image-generation/service/generated-image*.ts`, `config/opencode/overlay-builder.ts` and `test/config/external-directory-permission.test.ts`.
   - `storage-db.ts` is still imported by `learning/features/bench/chat-transcripts.ts`.
8. `script/check-import-contract.ts`: remove `checkToolInputDeltaBridgeStartup` (and its `OPENCODE_RUNTIME_SOURCE` use if it is only for that).
9. Tests under `packages/buddy/test/opencode-runtime/`.
   - Delete: `fetch-with-overlay.test.ts`, `tool-input-delta-bridge.test.ts`, `tool-presentation-strip.test.ts`, `buddy-runtime-plugin.test.ts` (v1-shaped; rewrite).
   - Rewrite `buddy-tool-shim.test.ts` against `buddyToolToToolInfo`.
   - New host-boot test: boot the real host via `createOpenCodeHost` with temp roots from `test/helpers/temporary-directory.ts`, inside the preload sandbox. Pass `plugins: [createBuddyRuntimePlugin(...), probe]`, where `probe` stores `ctx` keyed by `ctx.location.directory`. Boot a Location with `host.location.get({ location: { directory } })` or `session.create`. Assert:
     - every Buddy tool appears in `probeCtx.tool.list()` with `options.codemode === false`;
     - `host.skill.list({ location: { directory } })` has no `opencode`/`report`;
     - `host.server.info().paths.tmp` = realpath of the Buddy tmp dir;
     - the DB file is created at the planned path.
   - Permission test: create a session with `permissions: [{ action: "buddy_probe", resource: "*", effect: "ask" }]`, run `askBuddyToolPermission`, check that `host.permission.list({ sessionID })` shows the request, reply `once` → resolves, reply `reject` → throws.
   - Unit-test the context hook (verbosity, concise strip, capture) on a synthetic `SessionContext` event; triggering a real model request needs a provider or the `simulation` option.
   - Always `closeOpenCodeHost()`/`host.close()` in `afterAll`.
   - Also update `packages/buddy/test/opencode-runtime-env.test.ts`. It asserts removed plan fields (`defaults.database/client/...`, `openCode.bin/log/repos`) and spawns children that import `@buddy/opencode-adapter/global` and `storage-db`. Rewrite those children to import `env.ts` and assert `openCodeRuntimePaths()` / the plan, and test the host-boot paths in the new host test.
   - `test/skills/upstream-skill-visibility.test.ts` uses the old `{ name, location }` identity; it belongs with skill-management.
10. Verify (section 6 commands), then write the final report the coordinator wants.

## 5. Known broken or half-migrated state, and v2 traps

- **The tree does not compile yet.** `runtime.ts` imports the missing `./plugins`. `buddy-tool-shim.ts`, `plugins/buddy-runtime-plugin.ts` and `plugin-ask-compat.ts` are still v1 code. `create-buddy-tool.ts` imports v1 `@buddy/opencode-adapter/message` (type-only).
- **Callers of the removed `loadOpenCodeApp`:** `learning/features/lesson-workspace/service/diagnostics.ts:4` and `learning/agent-execution/permissions/runtime-session-permissions.ts:11`. Both also use v1 `Instance`; they belong to later workstreams.
- **Callers of the old `getOpenCodeClient(directory)` and v1 client methods:** routes/session/skill-management (expected breakage).
- **Promise plugin tools cannot fail "typed".** `@opencode/plugin` wraps `execute` in `Effect.promise` (`plugin/src/promise/adapter.ts` `executePromiseTool`), so every rejection is a defect. It still settles as a failed tool and the model continues. Throw `ToolError` to get a clean `tool.execution` message.
- **`permission.replied` carries no `message`.** A host tool cannot tell reject-with-feedback from a plain reject. A plain reject also cascades to every other pending request in that session (`core/src/permission.ts` `reply`).
- **The non-blocking `permission.create` never removes the request itself.** Only a reply (or location close) removes it, which is why the abort cleanup is needed.
- **Plugin activation order:** `internal.pre` → SDK plugins (Buddy) → instance plugins → `internal.post`. `post` includes `ConfigInstructionPlugin`, `ConfigSkillPlugin`, `ConfigCompatibilityPlugin` and `ConfigCommandPlugin`. So Buddy's `skill.transform` **cannot** remove skills added by `post` plugins.
- **External skills cannot be turned off any more.** v2 always loads `~/.claude/skills`, `~/.agents/skills` and project `.claude`/`.agents` skills (`core/src/config/plugin/compatibility.ts`, `core/src/config/discovery.ts`). v1's `OPENCODE_DISABLE_EXTERNAL_SKILLS` has no equivalent. The only levers are `ServerOptions.config.project: false` (also drops project `opencode.json` and AGENTS.md) or agent permission rules on `skill`. W-F must decide.
- **No `tools` map per prompt.** Per-session tool hiding is a `session.permissions` deny rule, or deleting the tool from `session.hook("context").tools` (also enforced at execution).
- **No HTTP tool-list endpoint.** Use a probe plugin's `ctx.tool.list()` in tests.
- **The SDK sets up plugins on every Location boot,** and the plugin event stream is Location-filtered.
- **`Global.Path` is process-global.** Two hosts with different roots in one process would clobber each other's paths. Tests must boot hosts one at a time.
- **`fetchModels` must stay false in tests,** or models.dev is fetched. The preload sets `OPENCODE_DISABLE_MODELS_FETCH=1`, which `runtime.ts` maps to `fetchModels: false`; tests that call `createOpenCodeHost` directly must pass `fetchModels: false`.
- **`ctx.session.hook("context").system` is `Array<SystemPart>`** (`{ type: "text", text, cache?, metadata? }`), not `string[]`. It is `[agent.system or default prompt, initial instructions]` (`core/src/session/model-request.ts` `baseTranscript`).
- **Lint rules (anti-slop) to respect:** no `{[k: string]: unknown}` dictionaries, no `unknown` params (except a param named `cause`), no `typeof` checks, no conditional empty-object spreads (use `Object.assign({}, cond ? {...} : undefined)`), and every `as` cast needs a `// SAFETY:` comment.

## 6. Verification run

None. No typecheck, lint, or tests were run on these files before the handoff. Commands to use:

- `bun ./node_modules/oxlint/bin/oxlint --config ./.oxlintrc.json <files>`
- `bun run --cwd packages/opencode-adapter typecheck`, then `bun run --cwd packages/buddy typecheck`. Run them one at a time (never concurrently) and filter the output to the owned files.
- Focused tests, from `packages/buddy`: `bun ../../script/run-test-command.ts -- bun test --preload ./test/preload.ts test/opencode-runtime/<file>`
