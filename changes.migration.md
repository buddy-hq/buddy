# PI Migration Staged Changes (Iterative Summary)

This document summarizes the currently **staged** migration changes from OpenCode-driven flows toward a PI-backed runtime in Buddy.

## Snapshot

- **198 files changed**
- **12,640 insertions / 5,916 deletions**
- Change shape: broad runtime replacement + API/schema rewiring + UI transcript/event adaptations + test suite realignment.

## Iteration 1 — Footprint and high-level shift

### What moved

1. A new backend surface was introduced under `packages/buddy/src/pi-backend/*` (29 new files).
2. Legacy OpenCode runtime surface under `packages/buddy/src/opencode-runtime/*` was removed (12 files deleted).
3. HTTP proxying-to-OpenCode was removed (`packages/buddy/src/http/proxy*`, `http/session.ts` removed; proxy exports dropped from `http/index.ts`).
4. Session/config/question/compat routes were converted to PI-native handlers and schemas instead of proxy pass-through.

### Intent reflected in code

- `packages/buddy/src/index.ts` now describes the API as **“Buddy local PI-backed agent API.”**
- OpenCode env bootstrap import/export wiring was removed from the app entrypoint.

## Iteration 2 — Backend runtime migration details

### New PI backend runtime layer (`packages/buddy/src/pi-backend`)

Major new modules:

- `runtime.ts`: PI session lifecycle orchestration, active session tracking, prompt handling, model selection/thinking-level mapping, session state interactions.
- `session-event-bridge.ts`: converts PI session/tool events into Buddy event payloads (`message.updated`, part deltas, status updates, session errors).
- `mapper.ts`: maps PI sessions/messages/tool results into Buddy transcript/message shapes, stable IDs, and provider/model metadata.
- `mcp-runtime.ts`, `tools.ts`, `opencode-tool-bridge.ts`: PI tool exposure with OpenCode tool-implementation bridging where needed.
- `permissions.ts` + UI request path modules: permission ask/reject/always behavior routed through Buddy PI flows.
- `provider-actions.ts`, `oauth-actions.ts`, `auth-actions.ts`: provider/auth handling for PI runtime integration.

### Route and API contract rewiring

- `routes/session.ts` switched response/request schemas from OpenCode effect schemas to PI backend contracts:
  - `BuddySessionInfoSchema`
  - `BuddySessionCreateSchema`
  - `BuddySessionStatusMapSchema`
  - `PiTranscriptEntrySchema`
- `routes/question.ts` no longer proxies question accept/reject to OpenCode; it now resolves pending requests directly in Buddy PI path.
- `routes/compatibility.ts` replaced multiple proxy calls with local PI-backed implementations:
  - health endpoint now returns local PI health payload
  - global event stream now uses PI event bus
  - file list/content/read paths are local filesystem-backed (with project containment checks)
  - command listing now comes from PI command resolver

### Config/runtime refactor

- OpenCode config modules were moved/renamed into runtime-aligned locations:
  - `config/opencode/agents.ts -> config/runtime/agents.ts`
  - `config/opencode/models.ts -> config/runtime/models.ts`
  - `config/opencode/skills.ts -> config/skills/paths.ts`
- Added `config/runtime/config-access.ts`.
- Removed OpenCode-only fingerprint/overlay-builder files.
- Updated runtime sync + config store internals for PI migration behavior.

## Iteration 3 — Tooling, subagents, dynamic tools, and permission model

### Tool runtime conversion

- `learning/runtime/create-buddy-tool.ts` was reworked from OpenCode tool runtime bindings to PI tool definitions:
  - now produces PI `ToolDefinition` (`toPiTool`)
  - maps PI context/session/messages into Buddy tool context
  - handles permission asks through PI permission request APIs
  - emits PI-compatible tool results/metadata updates
- Added `learning/runtime/json-schema-typebox.ts` for JSON schema -> TypeBox conversion in PI tool definitions.

### Subagent forwarding behavior update

- `learning/agent-execution/transforms/subagent-tool-forwarding.ts` removed heavy OpenCode session/permission dependency paths and now reads runtime visibility from PI/session-runtime state.
- Persona/tool visibility now resolves through Buddy runtime access + dynamic tool discovery rather than OpenCode permission merges.

### Dynamic tool grant migration

- `learning/runtime/dynamic-tool-grants.ts` no longer mutates OpenCode session permission directly.
- Dynamic grants are now applied to teaching session runtime access state + synchronized via runtime session permission sync utilities.

## Iteration 4 — Web client parity adjustments for PI transcript/event model

### New transcript projection layer

- Added `packages/web/src/state/pi-transcript-view.ts`:
  - maps PI transcript entries into existing message/part view structures
  - reconstructs tool part states from tool execution + toolResult entries
  - supports custom prompt message mapping for Buddy prompt flows

### Event handling/store updates

- `use-chat-sync.ts` switched `message.updated` handling to consume transcript entries instead of legacy pre-shaped message info.
- Added optimistic user-message promotion logic to reconcile optimistic UI with incoming PI transcript identity.
- `chat-actions.ts`, `chat-store.ts`, `chat-types.ts`, `chat-reducer.ts` updated to PI transcript/provider/model data shapes and raw provider parsing paths.
- Task/tool rendering utilities under `components/chat/tools/*` were adjusted for updated tool part/state payloads.

### Onboarding/provider/auth touchpoints

- `provider-auth.ts`, onboarding route/components, provider settings/connect flows were adjusted for PI-backed provider/auth behavior.

## Iteration 5 — Tests, docs, dependencies, and patching

### Test suite realignment

- New PI-focused backend tests added under `packages/buddy/test/pi-backend/*`:
  - runtime/session bridge/mapper/tool bridge/provider/oauth/subagent/route coverage.
- Legacy OpenCode/proxy-specific tests were removed:
  - opencode runtime env/legacy migration/proxy registration & body forwarding/subagent forwarding legacy tests.
- Web tests updated for chat-store event behavior and new transcript/view logic.

### Docs/artifacts

- Added migration context notes in `AGENTS.md` (`# pi migration` section).
- Added planning/acceptance docs:
  - `docs/pi-gration/init.md`
  - `docs/artifacts/plans/opencode-tool-bridge-acceptance-checklist.md`
- Added `blocks.md` (large system prompt/input block compilation artifact).

### Dependencies and patches

- `packages/buddy/package.json` adds PI ecosystem dependencies:
  - `@earendil-works/pi-coding-agent`
  - `pi-mcp-adapter`
  - `pi-subagents`
  - `pi-web-access`
  - `@juicesharp/rpiv-ask-user-question`
  - `typebox`
- Root `package.json` adds patched dependency:
  - `@earendil-works/pi-ai@0.74.1` via `patches/@earendil-works%2Fpi-ai@0.74.1.patch`
- Patch content includes Buddy-branded OAuth success page updates for PI AI package output.

## Net effect of staged migration

The staged set is a **deep runtime migration**, not a shim: Buddy now introduces a PI-native backend/session/event/tool path, removes much of the previous OpenCode runtime/proxy layer, rewires API contracts and route behavior to PI-backed models, and updates web transcript/state handling so UI behavior remains functional against the new runtime event model.

## Iteration 6 — Detailed backend data flow (before vs now)

This section focuses on runtime data flow changes in the backend.

### A. Request entry and routing

#### Before (OpenCode-proxy-centric)

1. Hono route handlers often delegated to `proxyToOpenCode(...)` (`packages/buddy/src/http/proxy.ts`).
2. Proxy layer resolved directory mode, prepared body, rewrote query params, and forwarded request to OpenCode runtime app (`fetchOpenCode`).
3. Response returned from OpenCode was normalized and surfaced back to Buddy route callers.
4. A large portion of backend behavior was effectively “transport + passthrough + error normalization”.

#### Now (PI-runtime-owned)

1. Route handlers call PI-native action/runtime methods directly (e.g., `piSessionCollection`, `piGetSessionStatus`, `piPatchSessionById` in `session/orchestration/core-actions.ts`).
2. Compatibility routes implement local handlers for file listing/reading, health, event streaming, and command listing without proxy transport.
3. Data originates from PI runtime/session managers + Buddy-owned services, then is shaped into Buddy contracts before returning.
4. Backend behavior is now “owned execution + explicit mapping”, not “generic proxy forwarding”.

### B. Session lifecycle and prompt flow

#### Before

1. Session endpoints used OpenCode session objects and proxy/session helper flows.
2. Prompt and message lifecycle events depended on OpenCode runtime/session behavior and forwarding patches.
3. Session list/get/update/messages mostly mirrored OpenCode schemas and IDs.

#### Now

1. `PiRuntime` owns active-session lifecycle (`ensure/create/get/patch/list/abort/compact`) via PI session manager (`packages/buddy/src/pi-backend/runtime.ts`).
2. Prompt request parsing is PI-aware (`readPiPromptRequest`), including:
   - text/agent/file parts parsing
   - model/provider selection and variant/thinking mapping
   - optional custom prompt metadata handling.
3. Prompt execution path:
   - set model + thinking level on active PI session
   - inject Buddy turn prelude/custom prompt message
   - invoke PI session prompt/send path
   - track busy/idle and publish events through event bridge.
4. Session API responses now use PI-backed Buddy contracts (`BuddySessionInfoSchema`, `PiTranscriptEntrySchema`).

### C. Transcript and event pipeline

#### Before

1. Events and message payloads were largely shaped by OpenCode message/session structures.
2. Proxying kept many event contracts coupled to OpenCode route outputs.

#### Now

1. `PiSessionEventBridge` subscribes to PI `AgentSessionEvent` stream and emits Buddy event bus payloads:
   - `session.status`
   - `message.updated`
   - `message.part.updated`
   - `message.part.delta`
   - `session.updated`
   - `session.error`
2. Tool execution start/update/end are buffered and reconciled into stable Buddy tool parts.
3. PI transcript messages are serialized and mapped into Buddy transcript entries before UI consumption.
4. Net effect: event semantics are now generated from PI primitives, but shaped to maintain Buddy UI compatibility.

### D. Tool execution path

#### Before

1. Buddy tools were defined against OpenCode tool runtime contexts (`Tool.define(...)` style path).
2. Tool schema + execution lifecycle + permission asks were coupled to OpenCode runtime APIs.

#### Now

1. Buddy tools are defined as PI tool definitions (`toPiTool`) in `create-buddy-tool.ts`.
2. Tool execution receives PI context and is mapped into Buddy tool context:
   - session/message IDs derived from PI context
   - live session messages mapped from PI transcript format
   - optional model/session extras attached.
3. Permission ask path now goes through PI/Buddy permission request functions.
4. Tool updates/results emit PI-compatible update payloads (content/details), then flow through event bridge to UI.

### E. OpenCode tool behavior bridging (transitional runtime parity)

#### Before

1. OpenCode tooling was the primary runtime behavior path.
2. Proxy/runtime setup directly depended on OpenCode app loading and patching.

#### Now

1. PI remains session-loop owner, but selected tools can still execute via OpenCode implementations through `opencode-tool-bridge.ts`.
2. Bridge flow:
   - build OpenCode config overlay from Buddy project config
   - get OpenCode tool registry for selected tool IDs
   - convert OpenCode schema -> PI TypeBox schema
   - map PI live messages to OpenCode message format
   - execute OpenCode tool in-process with PI-provided session/message/tool call context.
3. Permission flow for bridged tools:
   - evaluate OpenCode permission rules
   - request user decision through Buddy PI permission UI path
   - apply allow/deny/always behavior with per-directory in-memory approval state.
4. Result is converted back into PI tool result payload for downstream event/UI flow.

### F. Session orchestration layer changes

#### Before

1. `session/orchestration/core-actions.ts` contained substantial OpenCode-aware logic:
   - session existence checks via OpenCode APIs
   - direct proxying to `/session/*` routes
   - OpenCode-specific revert/unrevert/summarize flow.

#### Now

1. `core-actions.ts` is mostly a thin adapter to PI backend action functions.
2. Unsupported operations are made explicit via PI-side unsupported operation handlers.
3. The orchestration layer became thinner and more declarative because runtime ownership moved into PI backend modules.

### G. Dynamic tools and subagent visibility flow

#### Before

1. Dynamic tool grants mutated OpenCode session permission rules and registered/unregistered tools through OpenCode runtime APIs.
2. Subagent tool forwarding merged OpenCode agent/session permission state to compute visible/denied tools.

#### Now

1. Dynamic grants write to Buddy teaching session runtime state (`sessionRuntime.access.tools`) and sync through runtime-session permission sync.
2. Subagent forwarding computes visibility from Buddy runtime access + dynamic tool discovery + persona constraints, not OpenCode permission merges.
3. This shifts capability control from external runtime permission records to Buddy-owned PI session runtime state.

### H. Question and permission interaction flow

#### Before

1. Question accept/reject flows were proxied to OpenCode routes.
2. Tool permission requests were often mediated through OpenCode runtime abstractions.

#### Now

1. Question routes resolve/reject pending question requests locally in Buddy PI route handlers.
2. Permission asks for PI-native and bridged tools go through Buddy PI request channels, then apply decisions back into active runtime flow.

### I. Summary of backend dataflow delta

1. **Control-plane ownership moved** from OpenCode proxy/runtime plumbing to PI runtime modules inside Buddy.
2. **Data shape moved** from OpenCode-native schemas to PI transcript/session primitives mapped into Buddy contracts.
3. **Tool execution moved** to PI-native definitions, with OpenCode tool execution kept as an in-process bridge when parity requires it.
4. **Capability/permission state moved** from OpenCode session permission mutation toward Buddy-owned session runtime access state and PI permission orchestration.

### J. Bridge purpose and exit criteria

#### Why the bridge exists

1. Decouple the migration into two tracks:
   - Track 1: move runtime ownership (sessions/events/routes/subagents) to PI now.
   - Track 2: migrate tool implementations from OpenCode to native PI/Buddy over time.
2. Preserve user-visible tool behavior during runtime transition by executing selected OpenCode tools through the bridge.
3. Reduce migration risk by avoiding a “rewrite-everything-at-once” cutover.

#### What the bridge should do (and not do)

1. Do:
   - keep tool behavior parity while PI owns orchestration.
   - map context/permissions/events correctly between PI and OpenCode tool runtimes.
2. Do not:
   - reintroduce OpenCode as product/runtime owner.
   - leak OpenCode auth/config/product UX into Buddy surfaces.
   - become a permanent architecture layer.

#### Exit criteria (remove bridge incrementally)

1. For each bridged tool family, native PI/Buddy implementation reaches parity on:
   - output behavior
   - metadata/streaming semantics
   - permission behavior (allow/reject/always and pattern handling)
   - cross-platform behavior (macOS + Windows).
2. PI-native implementation has targeted tests equivalent to current bridge parity coverage.
3. Tool can be switched off from bridge path without regressions in transcript/UI/state behavior.
4. Once all required tools satisfy criteria, remove OpenCode tool bridge and related compatibility glue.

---

## Iteration 7 — Adapter dead-code assessment (post-migration)

### Adapter surface still used in non-test runtime paths

1. `agent`
2. `config`
3. `id`
4. `instance`
5. `message`
6. `permission`
7. `registry`
8. `tool`
9. `theme` (UI/theme consumption)
10. `provider-icon` (UI icon sprite consumption)

### Adapter modules that look runtime-dead now

1. `app-runtime.ts`
2. `auth.ts`
3. `bus.ts`
4. `command.ts`
5. `file.ts`
6. `global.ts`
7. `llm.ts`
8. `lsp.ts`
9. `mcp.ts`
10. `plugin.ts`
11. `provider.ts`
12. `provider-auth.ts`
13. `provider-transform.ts`
14. `server.ts`
15. `session.ts`
16. `session-live.ts`
17. `session-system.ts`
18. `session-instruction.ts`
19. `session-prompt.ts`
20. `session-status.ts`
21. `session-tool-ui.ts`
22. `skill.ts`
23. `skill-live.ts`
24. `storage-db.ts`
25. `wildcard.ts`
26. `index.ts` (no direct runtime imports)

### Caveat

Some of the runtime-dead modules are still referenced by legacy tests/docs, so this is a runtime dead-code signal, not an immediate delete list.

---

## Iteration 8 — Upstream fetch algorithm impact after PI migration

### How `docs/guides/upstream-fetch.algo.md` should change

1. **Scope framing should change**
   - from: Buddy + vendored OpenCode runtime sync
   - to: **PI is runtime owner**, OpenCode is **tool-runtime bridge** for parity.

2. **Primary compatibility surfaces should be updated**
   - prioritize:
     - `packages/buddy/src/pi-backend/*` (`runtime.ts`, `session-event-bridge.ts`, `mapper.ts`, `opencode-tool-bridge.ts`, `permissions.ts`)
     - `packages/buddy/src/routes/{session,question,compatibility,mcp}.ts`
     - `packages/web/src/state/pi-transcript-view.ts` and chat sync/store.
   - de-emphasize old proxy/runtime ownership checks tied to removed OpenCode proxy flow.

3. **Validation checklist should be PI-first**
   - add explicit checks for:
     - transcript/event parity (`message.updated`, `message.part.updated`, `message.part.delta`, `session.status`)
     - bridged tool permission behavior (`allow once`, `allow always`, `reject`)
     - subagent forwarding + dynamic-tool runtime-state behavior in PI session runtime.
   - remove checks that assume old proxy pass-through as the primary path.

4. **Runbook structure should split into two tracks**
   - Track A: OpenCode vendor sync (bridge parity only)
   - Track B: PI runtime/package updates (primary runtime evolution)
   - keeps blast radius and triage clearer.

5. **Success criteria should be rewritten**
   - from “Buddy adapts to OpenCode runtime churn”
   - to “PI runtime remains stable and OpenCode bridge parity remains correct.”

### Will upstream fetches be easier now?

1. **Generally yes** for OpenCode upstream fetches:
   - runtime/session/event/route ownership has moved to PI, so OpenCode churn hits a narrower boundary.

2. **But not free**:
   - bridge parity still introduces integration cost (schema mapping, permission semantics, tool behavior drift across runtimes).

3. **Net assessment**:
   - easier than pre-migration OpenCode-coupled fetches, but still requires targeted bridge parity validation.
