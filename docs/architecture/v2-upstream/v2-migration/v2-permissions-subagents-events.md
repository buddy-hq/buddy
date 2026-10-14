# OpenCode v2.0.24: permissions, subagents/jobs, events/messages

Read-only research for the Buddy v2 migration (phases 4-6 in `STATUS.md`). Source: `git archive` of tag `v2.0.24`, referred to below as OC. Every claim cites an OC-relative `path:line` (or `path:start-end`). Statements that are my inference from the code rather than something the code or a spec says outright are marked **(inferred)**. Section "Implications for Buddy" at the end of each part is derived reasoning, kept separate from the evidence.

Package shorthand: `packages/core` (engine), `packages/schema` (Effect schemas, event definitions), `packages/protocol` (HTTP API groups), `packages/server` (handlers, SSE feed), `packages/client` (generated Promise/Effect/Solid clients), `packages/sdk` (`@opencode/sdk`, in-process host), `packages/plugin` (plugin API types), `packages/app` + `packages/session-ui` (GUI).

## 0. Headline findings

1. **Permission model is a flat list of `{action, resource, effect}` rules, last match wins**, evaluated over `agent.permissions ++ session.permissions` (session rules come last, so they override the agent). No match means `ask`. `packages/core/src/permission.ts:87-97, 158-163`.
2. **"always" is project-scoped and allow-only.** It persists `{action, resource}` rows keyed by project ID, applied to every session/agent in that project, after (and unable to override) configured denies. There is no session-scoped or chat-scoped "always". `packages/core/src/permission.ts:148-156, 176, 299-305`; `packages/core/src/permission/sql.ts:7-20`.
3. **A host can replace a session's whole ruleset at any time** with `PATCH /api/session/:id {permissions}` (Promise client: `sessions.update({sessionID, permissions})`), or set it at create. It is a wholesale replace, emits durable `session.permissions`, and is re-read on the next model step and on every `Permission.assert`. Children and forks copy the parent's rules at creation only. `packages/protocol/src/groups/session.ts:360-377`; `packages/core/src/session/session.ts:82-88`; `packages/core/src/session.ts:287-288`; `packages/core/test/session-create.test.ts:411-435`.
4. **There is no `tools` map on a prompt** and no other per-prompt tool toggle. Per-session tool visibility comes from (a) session `permissions` with `{action:<tool>, resource:"*", effect:"deny"}` as the last matching rule, which removes the tool from the model's tool list, or (b) a plugin `session.context` hook deleting entries from `event.tools`. `packages/schema/src/prompt-input.ts:29-34`; `packages/core/src/tool.ts:225-238, 292-295`; `packages/plugin/src/effect/session.ts:33-36`.
5. **Pending permissions are in-memory and ephemeral.** Pending map lives in the Permission service; `permission.asked` / `permission.replied` are ephemeral events on the global SSE stream and are not replayed after a disconnect. `packages/core/src/permission.ts:130`; `packages/schema/src/permission.ts:44-53`; `packages/app/src/session/requests/auto-approve.ts:29-31`.
6. **`subagent` is a normal tool (`codemode:false`)**: child session via `Session.create({parentID, title, agent, model})`, blocking by default or `background:true`; a process-local `Job` is keyed by the child session ID; completion of a background child is injected into the parent as a `synthetic` message wrapped in `<subagent ...>` with `metadata.source = "subagent"`. `packages/core/src/tool/plugin/subagent.ts:29-48, 184-256`; `packages/core/src/session/subagent-completion.ts:21-46`.
7. **The Job service has no HTTP route, no client method, no events, and is not on the public plugin `Context`.** Jobs are observable only indirectly (child sessions, `GET /api/session/active`, synthetic completion messages, `shell.*` events). Only backgrounded jobs with a `recovery` descriptor persist a small KV marker so a restart can notify the parent. `packages/core/src/job.ts:127-137, 198-208, 480`; `packages/plugin/src/effect/plugin.ts:26-54`.
8. **No synchronous "child session created" hook.** The nearest seams are `tool.execute.before` for `subagent`, `ctx.event.subscribe()` for `session.created` (async, can race the first prompt), the `session.prompt` hook (runs when the child's first prompt is admitted), and the `session.context` hook (runs before every model request, deterministic). Children inherit the parent's `metadata` and `permissions` by default. `packages/core/src/session.ts:262-290`; `packages/core/src/session/prompt.ts:40-51`; `packages/core/src/session/model-request.ts:404-408`.
9. **One global SSE stream** (`GET /api/event`, client `event.subscribe`, SDK alias `events`) carries every location's events. Text/reasoning/tool-input deltas and tool progress are ephemeral; the matching `*.ended` / `tool.success` / `tool.failed` events carry full values. Busy/idle is `session.execution.started` vs `succeeded|failed|interrupted` plus `GET /api/session/active`. `session.status` / `session.idle` are declared in the public manifest but nothing in core/server/sdk/plugin publishes them. `packages/protocol/src/groups/event.ts:44-54`; `packages/schema/src/session-event.ts`; `packages/schema/src/session-status-event.ts:35-53`.
10. **v2 messages have no part IDs and no `role`.** A message is a tagged union on `type` (`user | assistant | synthetic | system | skill | shell | compaction | idle | agent-switched | model-switched | location-switched`); an assistant message holds an ordered `content[]` of `text | reasoning | tool` items. Tools are keyed by call `id`, unique only within that assistant message. `packages/schema/src/session-message.ts:160-217, 295-307`.

---

## A. Permissions (PermissionV2)

### A.1 Data shapes

**Request** (`Permission.Request`), `packages/schema/src/permission.ts:25-39`:

| Field | Type | Notes |
|---|---|---|
| `id` | `per_<ascending>` string | `:10-14`; caller may supply on the external `create` route (`protocol/src/groups/permission.ts:66`) |
| `sessionID` | Session.ID | owner session (child sessions own their own requests) |
| `action` | string | the permission "namespace": a tool name or a special action such as `external_directory` |
| `resources` | string[] | each resource is evaluated separately |
| `save` | string[]? | patterns to persist if the user replies `always` |
| `metadata` | Record<string, unknown>? | free-form, tool-supplied |
| `source` | `{type:"tool", messageID, id}`? | assistant message + tool call ID that triggered it (`:16-23`) |
| `message` | string? | set by a `permission.evaluate` hook (`core/src/permission.ts:191-202`) |

`Permission.AssertInput` (what tools pass) adds `agent?` and omits `message`, `packages/core/src/permission.ts:42-47`.

**Rule**: `{action: string, resource: string, effect: "allow"|"deny"|"ask"}`; `Ruleset = Rule[]`. `packages/schema/src/permission.ts:55-66`.

**Reply**: `"once" | "always" | "reject"`, `packages/schema/src/permission.ts:41-42`. On the HTTP body the field is named `decision` (renamed from `reply`; `V2_HTTP_API_AUDIT.md:215`) plus optional `message`, `packages/protocol/src/groups/permission.ts:119-122`.

**Saved permission** (`PermissionSaved.Info`): `{id: "psv_…", projectID, action, resource, time:{created, updated}}`, `packages/schema/src/permission-saved.ts:8-24`. SQLite table `permission` with unique index on `(project_id, action, resource)`, FK to project with cascade delete, `packages/core/src/permission/sql.ts:7-20`. There is no `effect` column; saved rules are always `allow` (`core/src/permission.ts:148-156`).

### A.2 Evaluation order (exact algorithm)

`Permission.evaluateInput`, `packages/core/src/permission.ts:173-189`, with helpers at `:87-97, 148-167`:

1. **Configured stack** = `agent.permissions ++ session.permissions` (flat concat, no precedence logic beyond position). `agent` is `input.agent ?? session.agent` resolved through the Agent service; if the agent cannot be resolved the stack is `[{*,*,deny}]`. `:19, 158-163`. The same concat is used for tool-list filtering: `packages/core/src/session/context.ts:129-139`.
2. **Hard deny short-circuit.** If any requested resource evaluates to `deny` against the configured stack, return `deny` immediately. Saved rules and the plugin hook are not consulted. `:165-167, 175`.
3. **Add saved rules** (all `allow`) at the **end**: `all = configured ++ savedRules(project)`. Project = `location.project.id`. `:148-156, 176`. Since deny was already handled in step 2, saved rules can only turn `ask` into `allow`.
4. **Per resource**: `evaluate(action, resource, all)` = the **last** rule where `Wildcard.match(action, rule.action) && Wildcard.match(resource, rule.resource)`; if none, synthesize `{action, resource:"*", effect:"ask"}`. `:87-97`. Aggregate: any `ask` => `ask`, otherwise `allow`. `:177-178`.
5. **Plugin hook** `permission.evaluate` receives `{sessionID, agent?, action, resources, metadata?, source?, effect, message?}` and may overwrite `effect` and `message`. Final result is the hook's values. `:179-188`; hook type `packages/plugin/src/effect/permission.ts:7-20`. Example producer: managed-policy plugin forcing `deny` with a message, `packages/core/src/config/plugin/policy.ts:44-60`.
6. **Outcome** (`assert`, blocking): `deny` => typed `BlockedError{rules, permission, resources, reason}`; `allow` => proceed; `ask` => create pending request, publish `permission.asked`, await reply. `:231-263`. `ask` (non-blocking variant used by the HTTP `create` route) does the same evaluation, creates the pending request when the result is `ask`, and returns `{id, effect}` without waiting. `:223-229`.

**Wildcard semantics** (`packages/core/src/util/wildcard.ts:3-14`): `*` => `.*`, `?` => `.`, every other regex metachar escaped; anchored `^…$`, dotAll; backslashes normalized to `/`; a pattern ending in `" *"` also matches the bare prefix (`"ls *"` matches `"ls"`); case-sensitive except on win32. Note the argument order: `Wildcard.match(action, rule.action)` means the request's action is the *input* and the rule's action is the *pattern*; the same for resources.

**Default agent rules** (every agent starts from these), `packages/schema/src/agent.ts:39-54`:
`*:* allow`, `external_directory:* ask`, `read:*.env ask`, `read:*.env.* ask`, `read:*.env.example allow`. Core appends four `external_directory` allows (tool-output dirs, tmp, config dir) to every newly created agent, `packages/core/src/agent.ts:59-64, 74-85`.

**Built-in agents** (`packages/core/src/plugin/agent.ts`): `build` adds `question allow` (`:81-86`); `general` (subagent) adds `question deny`, `subagent deny` (`:88-97`); `explore` (subagent) is `*:* deny` followed by explicit allows for shell/grep/glob/webfetch/websearch/read (with `.env` asks) and `subagent deny` (`:99-126`); `title` and `summary` are `*:* deny` (`:134-148`). `plan` pushes `question allow`, `edit deny`, then `edit allow` only inside its plan directory (`packages/core/src/plugin/plan.ts:38-41`).

**Config layering onto agents** (`packages/core/src/config/plugin/agent.ts:83-124`): top-level config `permissions` (`packages/schema/src/config.ts:54-56`) is appended to every existing agent, then to each newly defined agent; then `agents.<id>.permissions` (`packages/schema/src/config/agent.ts:21`) is appended. Legacy v1 `permission` and `tools` maps are normalized into rules, `packages/core/src/config/normalize.ts:180-183, 487-530` (`tools: {x: false}` becomes `{action:x, resource:"*", effect:"deny"}`, `migrateTools` `:487-498`). Agent plugin transforms can push arbitrary rules (`ctx.agent.transform(editor => editor.update(id, a => a.permissions.push(...)))`, e.g. `plugin/agent.ts:80-97`). The relative order of the built-in `opencode.agent` plugin vs the config plugin is determined by transform registration order, which I did not trace **(not verified)**.

**What each tool asks** (action / resources / save):

| Action | Resources | `save` | Source |
|---|---|---|---|
| `shell` | each parsed command text | `"<prefix tokens> *"` | `core/src/tool/plugin/shell.ts:134-142`; `core/src/shell/parse.ts:196-197` |
| `read` | path relative to location (absolute if external) | `["*"]` | `core/src/file-access.ts:154-159` |
| `external_directory` | `<dir>/*` | `<project-root>/*` | `core/src/file-access.ts:117-121, 135-141` |
| `edit` (edit, write, patch share it) | path | see leaf | `core/src/tool/plugin/edit.ts:181`, `write.ts:79`, `patch.ts:197` |
| `glob`, `grep`, `webfetch`, `websearch`, `skill`, `question` | tool specific | tool specific | `core/src/tool/plugin/{glob:69,grep:88,webfetch:125,websearch:50,skill:52,question:65}.ts` |
| `subagent` | `[agentID]` | `[agentID]` | `core/src/tool/plugin/subagent.ts:138-151` |
| MCP tool | `["*"]` | `["*"]`; action is `<server>_<tool>` | `core/src/tool/mcp.ts:16-17, 51-60` |
| MCP resources | `opencode_list_mcp_resources`, `opencode_read_mcp_resource` | | `core/src/tool/plugin/mcp-resource.ts:37, 66` |

Host-registered plugin tools get **no automatic permission check**: "The registry has no `Permission.Service` dependency and performs no execution authorization" (`packages/core/src/tool/AGENTS.md:50-54`). The public plugin `ctx.permission` exposes only `list`, `get`, `reply` and `hook("evaluate")`, not `ask`/`assert` (`packages/plugin/src/effect/permission.ts:22-24`; `packages/core/src/plugin/host.ts:404-424`). A host tool that wants a prompt must either call the HTTP `permission.create` route through the client and then wait for `permission.replied`, or be gated by a `permission.evaluate` / `tool.execute.before` hook **(inferred)**. Whole-tool hiding still works for plugin tools because it keys off the tool's effective name (`options.permission ?? name`, `core/src/tool.ts:231`).

### A.3 Reply semantics

`Permission.reply`, `packages/core/src/permission.ts:265-325`. In all cases a `permission.replied` event is published **before** the waiting tool resumes (`:270-274`). Unknown request ID => `Permission.NotFoundError` (HTTP 404 `PermissionNotFoundError`, `packages/protocol/src/errors.ts:209`; Promise helper `isPermissionNotFoundError`, `packages/client/src/promise/generated/types.ts:2714`).

| Reply | Effect |
|---|---|
| `once` | Resolve only this request. `:306-307` |
| `always` | If `request.save` is non-empty: insert one saved row per `save` pattern for `location.project.id` (`:299-305`; `saved.ts:63-78`, `onConflictDoNothing`). Resolve this request. Then re-evaluate **every other pending request in the Location's Permission service (not just the same session)**; those that now evaluate to `allow` are auto-resolved, each with a `permission.replied{reply:"always"}` event. `:308-322`. If `save` is empty or absent, nothing is persisted and no sweep runs: it behaves like `once` while the event still says `always`. |
| `reject` (no `message`) | Fail this request with `DeclinedError`, **and fail every other pending request of the same session** (each gets its own `permission.replied{reject}`). `:276-297`. |
| `reject` + `message` | Same cascade, but with `CorrectedError{feedback: message}`. |

`message` is only used as reject feedback (`:276-279, 289-292`); it is ignored for `once`/`always`.

Consequences for the running turn:
- `DeclinedError` is deliberately tunnelled as a defect through the tool leaf (`core/src/permission.ts:247-253`; `core/src/tool/AGENTS.md:29`) and resurfaces at `SessionModelRequest.executeTool` (`core/src/session/model-request.ts:383-399`). The runner marks the tool failed with `{type:"aborted", message:"The user declined this tool call"}` and **interrupts the whole step/execution** (`core/src/session/runner/step.ts:199-206, 208-209, 264-267`). The turn ends; the model does not see the rejection.
- `CorrectedError` stays typed, so the leaf turns it into a `ToolFailure`; the session error is `{type:"permission.rejected", message: feedback}` (`core/src/session/to-session-error.ts:62`) and **the model continues** with the feedback text.
- `BlockedError` (rule `deny`) is also `permission.rejected` with message `Permission denied: <action>` or the hook's `reason` (`core/src/permission.ts:70-79`; `to-session-error.ts:61`); the tool call fails and the model continues.
- When the Permission service closes (location shutdown / host close) every pending request gets a `replied{reject}` and fails with `DeclinedError` (`core/src/permission.ts:133-146`).

### A.4 Routes, client methods, events

All under the Promise client (`@opencode/client`, which the SDK spreads onto its handle: `packages/sdk/src/promise.ts:25-31, 61-68`). Generated code: `packages/client/src/promise/generated/client.ts:1498-1591`; Effect twin: `packages/client/src/effect/generated/client.ts:1106-1167, 1600`. Protocol: `packages/protocol/src/groups/permission.ts`; handlers: `packages/server/src/handlers/permission.ts`.

| Purpose | HTTP | Client method | Returns | Proto / handler |
|---|---|---|---|---|
| List pending in a location | `GET /api/permission/request` (`?location[directory]=`) | `permission.request.list({location?})` | `{location, data: Request[]}` (not unwrapped) | proto `:23-35`; handler `:33-38` |
| List pending for a session | `GET /api/session/:sessionID/permission` | `permission.list({sessionID})` | `Request[]` | proto `:88-100`; handler `:59-68` |
| Get one pending | `GET /api/session/:sessionID/permission/:requestID` | `permission.get({sessionID, requestID})` | `Request` | proto `:101-115`; handler `:69-75` (404 if not owned by session) |
| Reply | `POST /api/session/:sessionID/permission/:requestID/reply` body `{decision, message?}` | `permission.reply({sessionID, requestID, decision, message?})` | `void` (204) | proto `:116-134`; handler `:76-85` |
| Create/evaluate externally (non-blocking) | `POST /api/session/:sessionID/permission` body `{id?, action, resources, save?, metadata?, source?, agent?}` | `permission.create({...})` | `{id, effect}` | proto `:62-87`; handler `:39-58` |
| List saved (project) | `GET /api/permission/saved?projectID=` (defaults to the location's project) | `permission.saved.list({projectID?})` | `PermissionSavedInfo[]` | proto `:36-47`; handler `:86-97` |
| Remove saved | `DELETE /api/permission/saved/:id` | `permission.saved.remove({id})` | `void` (204) | proto `:48-59`; handler `:98-105` |
| Set/replace session rules | `POST /api/session` / `PATCH /api/session/:sessionID` with `permissions` | `sessions.create({permissions})`, `sessions.update({sessionID, permissions})` | | see A.5 |

There is no route to *add* a saved rule or to list pending requests across locations; `request.list` is per location (default location if omitted).

**Events** (ephemeral, `packages/schema/src/permission.ts:44-53`), both in the public manifest (`packages/schema/src/event-manifest.ts:57, 71-81`):
- `permission.asked`: `data` = the full `Request` (including `message`). Types: `PermissionAsked` at `packages/client/src/promise/generated/types.ts:1547-1563`.
- `permission.replied`: `data` = `{sessionID, requestID, reply}`. `types.ts:1565-1572`.

Events are not replayed on reconnect, so a client must re-list (`permission.list` per session or `permission.request.list` per location) after `server.connected`. The GUI's own comment says exactly that: "The event stream does not replay requests asked while this client was disconnected" (`packages/app/src/session/requests/auto-approve.ts:29-31`).

In-process plugin alternative: `ctx.permission.list/get/reply` (+ ownership check) and `hook("evaluate")`, `packages/core/src/plugin/host.ts:404-424`.

### A.5 Configuring and replacing rules

- **Per agent**: config `agents.<id>.permissions` and global `permissions` (A.2), or an agent plugin transform. Agents are Location-scoped and reload on config change (`packages/core/src/config/plugin/agent.ts:60-80`).
- **Per session, at create**: `POST /api/session {permissions}` -> `Session.create({permissions})`. `packages/protocol/src/groups/session.ts:219-231`; `packages/server/src/handlers/session.ts:125-148`. Plugin form: `ctx.session.create({permissions})`, `packages/core/src/plugin/host.ts:527-541`.
- **Per session, at runtime (replace)**: `PATCH /api/session/:sessionID {title?, metadata?, permissions?}`. `permissions !== undefined` triggers `Session.setPermissions`, which publishes durable `session.permissions {sessionID, permissions}`; the projector overwrites the stored column. `packages/protocol/src/groups/session.ts:360-377`; `packages/server/src/handlers/session.ts:258-282`; `packages/core/src/session/session.ts:82-88`; `packages/schema/src/session-event.ts:121-129`; `packages/core/src/session/projector.ts:584-591`. `[]` is valid and clears the session layer (`!== undefined` check, handler `:276`). Test: "stores permission rules, inherits them through children and forks, and replaces them", `packages/core/test/session-create.test.ts:411-435`. The audit file states "Permission rules are updated through `session.update`" and that rules emit `session.permissions`, `V2_HTTP_API_AUDIT.md:150, 216`. There is no append/patch-merge operation: read-modify-write is the host's job. Plugin form: `ctx.session.update({sessionID, permissions})`, `core/src/plugin/host.ts:553-560`.
- **Inheritance**: `Session.create` sets `permissions: input.permissions ?? parent?.permissions` and `metadata: input.metadata ?? parent?.metadata` (`packages/core/src/session.ts:287-288`); passing `permissions: []` explicitly clears. Forks copy as well (test above, `:411-435`). The copy is made at creation; changing the parent later does **not** reach existing children **(inferred from the create path; the test only covers creation-time inheritance)**.
- **When changes take effect**: the runner re-selects context each step (`packages/core/src/session/runner/llm.ts:199-203, 215-217`), and `SessionContext.select` re-reads the session and recomputes the tool snapshot from `agent ++ session` rules (`packages/core/src/session/context.ts:106-139`). Every `Permission.assert/ask` reads the session fresh (`core/src/permission.ts:158-163`). Already-pending asks are **not** re-evaluated by a PATCH; the only re-evaluation is the sweep after an `always` reply (`:310-322`).
- **Not available**: no `tools` map and no other tool toggle on a prompt. Prompt payload is `{id?, text, files?, agents?, skills?, metadata?, delivery?, resume?}` (`packages/protocol/src/groups/session.ts:394-403`; `packages/schema/src/prompt-input.ts:29-34`). `agents` there are `@agent` mention attachments (`packages/schema/src/prompt.ts:50-54`), not an allow-list. Prompt `metadata` is opaque, stored on the user message, and visible to the `session.prompt` hook (`packages/plugin/src/effect/session.ts:14-20`).
- **Other per-session levers**: `POST /api/session/:id/agent` (`session.switchAgent`) changes which agent's rules apply (`packages/protocol/src/groups/session.ts:328`); a plugin `session.context` hook can `delete event.tools[name]` or rewrite descriptions (`packages/plugin/src/effect/README.md`, "Session context is mutable immediately before provider dispatch"); a plugin `tool.execute.before` hook can rewrite input or fail the call with `Tool.Error` (`packages/core/src/plugin/hooks.ts:23-30`; `packages/core/src/tool.ts:271`).
- **SDK per-session plugin instances**: `OpenCode.create({instances:{key(session), configure(key)}})` builds one plugin set per `(key, Location)`, with `key` derived from `Session.Info` (including `metadata`). Child sessions inherit `metadata`, so they resolve to the same instance. `packages/sdk/README.md` ("Session-Selected Plugins"); `packages/sdk/src/promise.ts:9-23, 33-52`; `packages/sdk/src/internal/instances.ts:49-107`. Lifetime: "Loaded instances live until the host closes" and `configure` runs on a cache miss (README).

### A.6 Tool list: removed vs fails at execution

Both, depending on the rule shape:

- **Removed from the model's tool list**: in `Tool.snapshot(permissions)` a tool is skipped when `whollyDisabled(tool.options?.permission ?? name, rules)`, i.e. the **last rule whose `action` pattern matches the tool's permission action** has `resource === "*"` (literal) and `effect === "deny"`. `packages/core/src/tool.ts:225-233, 292-295`. `edit/write/patch` map to action `edit` (`options.permission`), others use their effective name (`<namespace>_<name>` for namespaced/MCP tools; `core/src/tool/runtime.ts:274-279`). `execute` (CodeMode) is removed if `execute` is wholly disabled (`tool.ts:238`). Skill and MCP instruction discovery use the same rule set (`core/src/session/context.ts:131-139`).
  - Consequences: a later `allow` for the same action un-hides the tool; a trailing `{*,*,deny}` hides everything including `execute`; an `ask` at `resource "*"` does **not** hide the tool.
  - `Tool.Info` options in the built-ins: all built-in direct tools use `codemode:false` (e.g. `subagent.ts:104`, `shell.ts:192`); MCP/namespaced tools default into CodeMode (`core/src/tool/AGENTS.md:33`).
- **Present but fails at execution**: resource-specific denies (e.g. `{shell, "rm *", deny}`) leave the tool visible; the leaf's `Permission.assert` returns `BlockedError` and the call becomes a failed tool part with error type `permission.rejected` (`core/src/session/to-session-error.ts:61`).
- **Execution of a tool the context hook removed** fails per call with `Tool is not available for this request: <name>` (`packages/core/src/tool.ts:272-275`), so a `session.context` removal is both hiding and enforcement.
- Registry statement of intent: "Tool filtering is catalog visibility, not execution authorization" (`packages/core/src/tool/AGENTS.md:54`).

### A.7 How the app GUI renders and answers permission prompts

| Concern | Where |
|---|---|
| Prompt component | `SessionPermissionDock`, `packages/app/src/session/requests/session-permission-dock.tsx:8-76`, built on `DockPrompt kind="permission"` (`packages/session-ui/src/components/dock-prompt.tsx:5`). Shows i18n title, optional per-action description via key `settings.permissions.tool.<action>.description` (`:15-22`), and the `resources` as `<code>` lines (`:64-73`). Buttons: Deny -> `reject`, Allow always -> `always`, Allow once -> `once` (`:39-52`). No feedback text field, so the GUI never sends `message`. |
| Where it mounts | `packages/app/src/session/composer/session-composer-region.tsx:48-62`, in the composer region (the composer itself is hidden while a request is pending: `Show when={!controller.state.blocked()}` at `:69`; `blocked` memo `requests/model.ts:77-83`). |
| Which request is shown | `createSessionRequestModel`, `packages/app/src/session/requests/model.ts:15-170`. Syncs `data.session.permission.sync(sessionID)` on route change (`:26`). `sessionPermissionRequest` walks the **session tree** (the session plus all descendants) and returns the first pending request, so a subagent's prompt surfaces in the parent's view (`packages/app/src/session/requests/session-request-tree.ts:3-59`; `requests/model.ts:71-75`). |
| Answering | `decide(response)` -> `serverSDK.api.permission.reply({sessionID, requestID, decision})` (`requests/model.ts:135-154`). |
| Store | `packages/client/src/solid/data.ts`: `permission.asked` appends (dedup by id) `:1160-1166`; `permission.replied` removes `:1167-1169`; `session.permission.sync` -> `api().permission.list({sessionID})` `:1739-1743`; `reply` swallows `PermissionNotFound` `:1747-1754`. |
| Auto-approve | Purely client-side: `settings.permissions.autoApprove` (`packages/app/src/settings/model.tsx:277`) makes `createPermissionAutoApprover` (`packages/app/src/session/requests/auto-approve.ts:16-151`) reply `once` to every `permission.asked` and to a sweep of `permission.request.list` per location using `session.active` for the location inventory (`:63-123, 125-141`). Installed in `packages/app/src/runtime/server/runtime.tsx:184`. There is no server-side auto-approve mode. |
| Saved permissions UI | None found in `packages/app`; only the store slice `project.permission` and `permission.saved.list` sync exist (`packages/client/src/solid/data.ts:1820-1832`). |

### A.8 Implications for Buddy (derived)

1. v2 has no "session" or "chat" scope for `always`. To preserve chat-scoped grants, Buddy must either append allow rules to that chat's `session.permissions` (read-modify-write PATCH, last-match-wins ordering) or keep an in-memory per-session allow set consulted by a `permission.evaluate` hook. Project-scoped "always" is native: map it to `always` + `save` patterns, and expose `permission.saved.list/remove` for management.
2. Expose reject-with-message in Buddy's UI if you want "decline and continue"; a plain `reject` ends the whole turn and also rejects every other pending request in that session.
3. A per-chat tool toggle can reuse the old "replace every prompt" approach: `sessions.update({sessionID, permissions: [...]})` before `sessions.prompt`. To hide tool `X` for a chat, put `{action:"X", resource:"*", effect:"deny"}` **last**; to un-hide something an agent denies, append an `allow` (session rules win by position). Because session rules also override subagent agents' own rules (see B.1), prefer narrowly-scoped deny rules plus hook-based enforcement over broad allows.
4. `session.permissions` PATCH does not change already-created children. Buddy needs its own propagation (see B.3).
5. Sessions are in-memory-database by default for the embedded host (`packages/sdk/src/internal/host.ts:39`), which means saved permissions and the session table vanish on restart unless `database.path` is set.

---

## B. Subagents and background jobs

### B.1 The `subagent` tool

File: `packages/core/src/tool/plugin/subagent.ts` (plugin id `opencode.tool.subagent`, tool name `subagent`, `options:{codemode:false}` so it is a direct tool, `:17, 64-66, 104`).

**Input** (`:29-48`): `agent: string` (required), `description: string` (3-5 word label, required), `prompt: string` (required), `model?: "providerID/modelID[#variant]"`, `sessionID?: Session.ID` (continue an existing child), `background?: boolean`. **Output** (`:50-54`): `{sessionID, status: "completed"|"running", output: string}`. Model-visible content for a completed call is `<subagent sessionID="…" state="completed">\n…\n</subagent>`, otherwise the background instruction text; tool-part `metadata` is `{sessionID, status}` (`:258-265`). The `execute.before` hook normalizes empty-string `model` / `sessionID` to absent (`:271-280`). A `context`/`compaction`/`generate` hook appends the list of available subagents (non-primary, non-hidden agents whose `subagent` action is not denied by the *selected agent's* rules) to the tool description (`:282-309`).

**Execution flow** (`:108-257`):
1. Load parent session; compute depth by walking `parentID` up; fail when `depth >= experimental.subagent_depth` (default 1, `schema/src/config/experimental.ts:11-13`). `:110-133`. With the default, a child cannot spawn grandchildren. Built-in `general`/`explore` also deny `subagent` (`plugin/agent.ts:93-96, 121`).
2. Resolve agent: unknown => failure; `mode === "primary"` => "cannot run as a subagent". `:134-137`.
3. **Permission check on the spawn itself**: `permission.assert({action:"subagent", resources:[agent.id], save:[agent.id], sessionID: parent, agent: context.agent, source})`, evaluated against the **parent** session/agent. `:138-151`.
4. If `sessionID` given: must exist and have `parentID === context.sessionID`; if the requested agent differs, `switchAgent`; model override/agent model => `switchModel`. `:153-182`.
5. Model for a new child: `override ?? agent.model ?? parent.model`. `:184`.
6. **Create child**: `sessions.create({parentID: context.sessionID, title: input.description, agent, model})` (`:185-198`). In `Session.create` a `parentID` forces the parent's `location` (`packages/core/src/session.ts:266-268`) and the child **inherits the parent's `metadata` and `permissions`** (`:287-288`). The tool passes neither explicitly, and its input has no field to supply them. The only structural marker of "this is a subagent" is `parentID` (and `title`, `agent`); there is no `kind: "subagent"` metadata.
7. `context.progress({sessionID: child.id, status:"running"})` (`:201`) publishes the ephemeral `session.tool.progress` with that metadata (`packages/core/src/session/runner/publish-llm-event.ts:563-571`), which is how a UI learns the child ID before the tool finishes.
8. **Prompt the child** with the standard `sessions.prompt` (outside the job): first prompt text is `"You are a subagent spawned by another session.\n" + input.prompt`; continuing a child sends `input.prompt` unchanged; a **new background** child is admitted with `resume:false` (the job's `run` starts it). `:203-218`.
9. `subagents.start(recovery)` registers the Job (B.2) with `recovery = {kind:"subagent", parentSessionID, childSessionID, agent: agent.name, description}`; note `agent` there is the agent's display **name**, not its ID (`:220-227`).
10. **Background** (`background:true`): `subagents.background(recovery)` then return `{sessionID, status:"running", output:<instructions to not poll>}` immediately (`:229-232`; text `:19-27`).
11. **Blocking**: `jobs.block({id: child.id, sessionID: parent})`; if the parent tool call is interrupted, it interrupts the child and cancels the job (`:234-240`). If the user backgrounds it meanwhile (`POST /api/session/:id/background`) the result is `backgrounded`, `subagents.notify` is registered, and the tool returns the background result (`:241-244`). Terminal results: `error` => `ToolFailure("Subagent failed (sessionID: …): …")`, `cancelled` => `ToolFailure("Subagent cancelled (sessionID: …)")`, else `{sessionID, status:"completed", output}` (`:245-256`).

**Completion text**: the job's `run` calls `sessions.resume(child)` then reads the child's last 20 messages (desc) and returns the joined `text` parts of the most recent completed, non-error assistant message, falling back to `"Subagent completed without a text response."`. `packages/core/src/session/subagent-job.ts:44-52`; `packages/core/src/session/subagent-completion.ts:8-19`.

**Completion injection for background children**: `SubagentJob.notify` forks an observer on `jobs.wait({id: childSessionID})` (`subagent-job.ts:23-34`) which calls `SubagentCompletion.deliver` (`subagent-completion.ts:21-46`): `sessions.synthetic({id: notificationID?, sessionID: parentSessionID, description, text: '<subagent sessionID="…" state="completed|error|cancelled" description="…">\n…\n</subagent>', metadata:{source:"subagent", childID, agent, state}})`, then `jobs.completeBackground(notificationID)`. `resume` is omitted by default, so the synthetic message wakes the parent's execution (`specs/v2/session.md:13`). Restart path passes `resume:false` for parents that are already being resumed (`restart.ts:149-156`).

**Permission derivation for the child (summary)**: there is no explicit derivation. The child's effective rules at any time are `childAgent.permissions ++ child.session.permissions`, where `child.session.permissions` is a **copy of the parent's session rules taken at creation** (or absent). Two implications **(inferred from `permission.ts:158-163` and `session.ts:287-288`)**: (a) a parent's session-level deny/hide rules propagate to children; (b) a parent's session-level *allow* rules sit after the child agent's rules and therefore **override** restrictive subagent agents such as `explore` (`*:* deny` then allows), since last match wins. The child's permission requests are owned by the child session ID and appear in the parent's UI through the session-tree lookup (A.7).

### B.2 Job service

File: `packages/core/src/job.ts` (global node, deps `[KV.node]`, `:480`). Interface `:127-137`:

| Method | Semantics |
|---|---|
| `start({id, type, title?, metadata?, recovery?, notificationID?, run})` | Registers a running job and forks `run` in a scope; if a job with that `id` is already running, returns the existing one and does not run `run` again. `:252-297` |
| `get(id)` | snapshot `Info {id, type, title?, status: running\|completed\|error\|cancelled, started_at, completed_at?, output?, error?, metadata?, notificationID?}` `:40-51, 246-250` |
| `wait({id, timeout?})` | await completion or timeout; non-recoverable results get consumed into a 25-entry history `:299-315, 38` |
| `block({id, sessionID})` | foreground wait that records `sessionID` as a blocker; races completion vs "backgrounded" `:328-355` |
| `background(id)` | mark backgrounded; for recoverable jobs allocate a durable `notificationID` and persist the marker `:357-385` |
| `backgroundAll({sessionID, type?})` | background every running job currently blocking that session `:387-409` |
| `cancel(id)` | mark cancelled and close the job scope `:411-439` |
| `pendingBackground` / `completeBackground(notificationID)` | read/delete persisted markers `:441-463` |

**Events**: none. The layer has no Bus dependency (`:178-180, 480`). **HTTP/client**: none; grep of `protocol/`, `server/`, `client/` finds no job route or method (`server/src/routes.ts:58` only wires the node). **Plugin access**: `Job.Service` is provided to internal built-in plugins (`core/src/plugin/internal.ts:128`) but the public plugin `Context` has no job domain (`packages/plugin/src/effect/plugin.ts:26-54`).

**Persistence/recovery**: the registry is a process-local `Map` (`:63-67, 180-183`). Only jobs that carry a `recovery` descriptor **and** have been backgrounded write a KV record `job.background/<notificationID>` containing `{id, notificationID, recovery, status, output?, error?}` (`:198-208, 357-369`); it is deleted by `completeBackground` after the notification has been admitted (`:452-463`). The job id equals the child session ID for subagents and the shell ID for shells (`subagent-job.ts:39`, `shell.ts:238`). KV lives in the same database, so with the SDK's default `:memory:` database nothing survives a restart (`packages/sdk/src/internal/host.ts:39`; `packages/sdk/README.md`, "Use a persistent `database.path` to recover Sessions after restart").

**Restart recovery** is `SessionRestart.resumeSuspendedSessions` (`packages/core/src/session/execution/restart.ts:192-231`). The embedded SDK host runs it in the background at startup (`packages/sdk/src/internal/host.ts:50-52`), as do the server entry points (`packages/server/src/fetch.ts:47`, `process.ts:105, 237-238`). It reads `jobs.pendingBackground` and: shells => admit a synthetic "Command cancelled because the server restarted" (or the stored result) to the owning session (`restart.ts:101-136`); subagents => if parent/child vanished drop the marker, if already finished deliver the stored result, else re-register a backgrounded job and `execution.resume(child)` and deliver on completion (`:138-190`). Resume attempts are bounded (default 10) with a durable counter (`:15-33, 77-99`). Foreground jobs are not recovered: their tool call is orphaned and reconciled by the runner (`specs/v2/session.md:78`).

**Cancel paths**: interrupting a child session (`POST /api/session/:id/interrupt`) calls `jobs.cancel(sessionID)` for any non-shutdown interruption (`packages/core/src/session/execution.ts:127-131`), which turns the job `cancelled`; foreground parent sees "Subagent cancelled", background parent gets a synthetic "Subagent cancelled" notice. There is no direct "cancel job" API.

### B.3 Hook points for seeding per-child state and tool policy

There is **no** `session.created` / `child.created` hook in `SessionHooks` (list: `prompt, context, compaction, generate, title, model.request, http.request, http.response, experimental.ws.*, retry`; `packages/plugin/src/effect/session.ts:138-151`). Available seams, ordered by when they run:

| # | Seam | Blocking before child's first model request? | What you get | Evidence |
|---|---|---|---|---|
| 1 | `tool.execute.before` filtered to `tool === "subagent"` | Yes (runs before the tool body) | parent `sessionID`, `agent`, `messageID`, call `id`; mutable `input` (agent, model, background, sessionID, prompt); may fail with `Tool.Error` to veto | `core/src/tool.ts:103-111, 271-272`; `plugin/src/effect/tool.ts:20-28`; `core/src/plugin/hooks.ts:23-30`; the built-in subagent plugin already uses it (`subagent.ts:271-280`) |
| 2 | Event `session.created` via `ctx.event.subscribe()` | **No** (stream subscription; async) | `parentID`, `agent`, `model`, `metadata`, `permissions`, `location` | `schema/src/session-event.ts:48-66`; usage pattern `core/src/plugin/plan.ts:76-96`; the tool calls `create` then `prompt` back-to-back (`subagent.ts:185-218`), so an event consumer can lose the race **(inferred)** |
| 3 | `session.prompt` hook | Yes for the child's initial prompt (unless it is an idempotent retry that was already admitted) | `sessionID`, `messageID`, mutable `prompt`, `metadata`, `delivery`; look up `parentID` with `ctx.session.get` | `core/src/session/prompt.ts:40-51, 90`; `specs/v2/session.md:43`; types `plugin/src/effect/session.ts:14-20` |
| 4 | `session.context` hook (also `compaction`, `generate`) | Yes, every model request | `sessionID`, `agent`, `model`, `system`, `messages`, `options`, and `tools` (delete/rename/redescribe). Best deterministic enforcement/seeding point; the Plan plugin uses it to reconcile reminders every request | `core/src/session/model-request.ts:223-256, 404-409`; `plugin/src/effect/session.ts:33-36`; `core/src/plugin/plan.ts:58-75` |
| 5 | `permission.evaluate` hook | Yes, per permission check | `sessionID`, `agent`, `action`, `resources`, `source`; set `effect`/`message` | A.2 |
| 6 | `tool.execute.after` filtered to `subagent` | After the call | `status`, `result.metadata.{sessionID,status}`; for background spawns it fires immediately (hook `status:"completed"` with `result.metadata.status:"running"`), for blocking spawns it fires when the child finishes | `core/src/tool.ts:131-149`; `subagent.ts:229-232, 258-265` |
| 7 | Metadata/permission inheritance | n/a | host keys put on the parent (`sessions.create({metadata})` or `update`) are copied to every child at creation | `core/src/session.ts:287-288`; `core/test/session-create.test.ts:357-380` |
| 8 | SDK `instances` selector | n/a | per-thread plugin closure shared by parent and children when they derive the same `key` from inherited `metadata` | `packages/sdk/README.md`; `sdk/src/internal/instances.ts:49-107` |

The Promise plugin API (what `@opencode/sdk` accepts via `OpenCode.create({plugins})` / `opencode.plugin(plugin)`, `packages/sdk/src/promise.ts:55-59`) exposes the same domains and hook names: `ctx.session.hook`, `ctx.tool.hook`, `ctx.permission.hook`, `ctx.event.subscribe`, `ctx.agent.transform`, `ctx.tool.transform` (`packages/plugin/src/promise/{plugin,session,tool,permission,event}.ts`); tool `execute` there receives an `AbortSignal` and a Promise `progress` (`packages/plugin/src/promise/tool.ts:11-24`).

Also: plugins can create and mutate sessions (`ctx.session.create/update/prompt/synthetic/interrupt`, `plugin/src/effect/session.ts:153-172`; `core/src/plugin/host.ts:526-560`), so a plugin can PATCH a child's `permissions` or `metadata` as soon as it sees it (seams 2, 3 or 6), but nothing guarantees that happens before the child's first step; seams 3-5 do.

### B.4 Background shell

- **Tool**: `shell` (`packages/core/src/tool/plugin/shell.ts:22`, `codemode:false` `:192`). Input `{command, workdir?, timeout?, background?}` (`:47-60`); foreground default timeout 120 s, background has none (`:23, 198`). Output `{exit?, signal?, shellID?, truncated, timeout?, output, status?: completed|running}` (`:62-74`).
- **Job wiring** (`:236-268`): `jobs.start({id: shellID, type:"shell", title: command, metadata:{sessionID, shellID}, recovery:{kind:"shell", sessionID, shellID, command}, run})`. `background:true` => `jobs.background(job.id)` + `notifyWhenDone`, returns `{shellID, status:"running", output:"Command moved to the background (shell ID …)\nOutput is streaming to: <file>"}` (`:95-100, 251-255`). Foreground => `jobs.block`; if the user backgrounds it, `shell.timeout(id, 0)` removes the timeout and the same notify path is used (`:260-263`). Cancelling the tool call cancels the job and removes the shell (`:234, 259`).
- **Completion**: `sessions.synthetic({id: notificationID, sessionID: owner, description: command, text: '<shell id="…" state="completed|error|cancelled" command="…">…</shell>', metadata:{source:"shell", shellID, jobID, state, …}})`, then `jobs.completeBackground` (`:154-186`; `packages/core/src/shell/result.ts:45-63`).
- **HTTP**: shell processes are a separate location-scoped service. `GET /api/shell` (running only), `POST /api/shell`, `GET /api/shell/:id`, `GET /api/shell/:id/output?cursor&limit` (byte-cursor paging of a capture file), `DELETE /api/shell/:id` (terminate + remove). Client `shell.list/create/get/output/remove`. `packages/protocol/src/groups/shell.ts:10-80`; client `generated/client.ts:1906-1972`. Events `shell.created`, `shell.exited`, `shell.deleted` (ephemeral, `packages/schema/src/shell.ts:55-58`). Tool-started shells are tagged with `metadata.sessionID` (`shell.ts:241`), which is how the GUI attributes them.
- **Move foreground work to background**: `POST /api/session/:id/background` => `Session.background` => `jobs.backgroundAll({sessionID})` and a synthetic note telling the model the work is backgrounded. `packages/protocol/src/groups/session.ts:765-779`; `packages/core/src/session.ts:442-458`; client `sessions.background({sessionID})`.
- **User `!shell`**: `POST /api/session/:id/shell {command}` emits durable `session.shell.started` / `session.shell.ended` (`packages/protocol/src/groups/session.ts:478-496`; `schema/src/session-event.ts:304-326`).
- **Plugin hook**: `ctx.shell.hook("create.before")` can rewrite `command`, `cwd`, `timeout`, `shell`, `env` (`packages/plugin/src/effect/shell.ts:3-17`; `core/src/shell.ts:274`).
- **Persistence**: process-local; markers as in B.2; after restart a running shell is reported cancelled (`restart.ts:101-136`).

### B.5 How the app GUI shows subagents and background jobs

| Piece | File and notes |
|---|---|
| Running menu (header and in-timeline) | `SessionRunningMenu`, `packages/app/src/session/header/session-running-menu.tsx:29-150+`; mounted at `packages/app/src/session/screen.tsx:338` and `packages/app/src/session/timeline/message-timeline.tsx:395`. Items = blocking foreground tool calls + background tasks. Click navigates to the child session (`openRoute`) or reveals the tool part; Stop calls `api.session.interrupt({sessionID: child})` for subagents and `api.shell.remove({id})` for shells (`:130-140`). |
| Deriving "what is running" | `createSessionBackground`, `packages/app/src/session/requests/background.ts:8-142`. (a) completed `subagent`/`shell` tool parts whose `state.metadata.status === "running"` (background) minus those with a later synthetic message carrying `metadata.source` `subagent`/`shell` and matching `childID`/`shellID`/`jobID` (`:15-76`); (b) currently `running` `subagent`/`shell` tool parts of the active assistant message = blocking (`:78-96`); (c) child sessions with `parentID === owner` whose `data.session.status` is running (`:106-119`); (d) running shells with `metadata.sessionID === owner` (`:121-132`). Owner is the parent when viewing a child (`requests/model.ts:91-98`). |
| Move to background | `requests/model.ts:112-123` -> `api.session.background({sessionID})`. |
| Tool card | `ToolRegistry.register({name:"subagent"})`, `packages/session-ui/src/tools/tool-renderer.tsx:1846-1990`: child ID from `props.metadata.sessionID` (fallback `taskSession(...)`), title from agent definition, subtitle from `input.description` with "(background)" when `metadata.background === true` or (`completed` and `metadata.status === "running"`) (`:1866-1881`); spinner while tool is streaming/running or the child session status is not idle (`:1883-1890`); click navigates to the child (`navigateToSession`). |
| Completion row | `packages/session-ui/src/timeline/session-timeline-row.tsx:436-460` (label from synthetic `metadata.source/state/agent`) and `:530-548` (`childID` link). |
| Timeline grouping | category `subagents` with placement per detail level, `packages/session-ui/src/timeline/detail.ts:4-72, 106`. |
| Events consumed | all through the generic store in `packages/client/src/solid/data.ts`: `session.created` (child appears; `:631-641`), `session.execution.started\|succeeded\|failed\|interrupted` (status, `:1009-1011, 1025-1031`), `session.synthetic` (`:805-814`), `session.tool.*` (`:919-980`), `shell.created\|exited\|deleted` (`:1245-1257`). No dedicated job/subagent events exist. |

### B.6 Implications for Buddy (derived)

1. Subagent bookkeeping in Buddy should be built on child sessions (`parentID`), `session.created`, `session.execution.*`, and the `<subagent …>` synthetic message with `metadata.source="subagent"`; there is no job API to subscribe to.
2. Per-child state and tool policy: rely on inheritance (stash a Buddy chat ID in parent `metadata`), enforce in the `session.context` + `tool.execute.before` hooks keyed by `sessionID -> root/metadata`, and optionally mirror rules into the child's `permissions` via the `session.created` event. Do not assume the event handler runs before the child's first step.
3. Define Buddy subagent roles as agents with `mode:"subagent"` (their own `permissions`/`system`/`model`) rather than trying to pass per-spawn permissions through the tool, which has no such inputs.
4. To keep the model from fanning out, set `experimental.subagent_depth` or deny `subagent` on child agents (already done for `general`/`explore`).

---

## C. Events and messages

### C.1 Event stream

- **Route**: `GET /api/event` (SSE), `packages/protocol/src/groups/event.ts:44-54`. Handler emits a synthetic `server.connected` first, then live frames, plus a `: heartbeat` comment every 15 s, headers `text/event-stream`, `no-cache`. `packages/server/src/handlers/event.ts:11-34`.
- **Scope and delivery**: global across all locations ("The global cross-location event stream is intentional", `specs/v2/event-stream-architecture.md:45`). Volatile by contract: no replay, events during a disconnect are missed (`protocol/src/groups/event.ts:51`; spec `:153`). Each subscriber has a dropping queue of 4,096 frames; overflow fails that connection (`packages/server/src/event-feed.ts:8, 64-68`; spec `:53-62`). Clients should resync on every `server.connected` (what the GUI does: `packages/client/src/solid/data.ts:595-626`).
- **Client**: Promise `event.subscribe({signal, onActivity}) -> AsyncIterable<OpenCodeEvent>` (`packages/client/src/promise/generated/client.ts:1689-1694`). The wrapped client replaces it with a **shared** single connection fanned out to all subscribers, caching and replaying `server.connected` to late subscribers (`packages/client/src/promise/client.ts:10-17`; `packages/client/src/shared-events.ts:9-148`, esp. `:44, 114`). SDK handle: `opencode.events` is the same object as `opencode.event` (`packages/sdk/src/promise.ts:26-29, 63-64`). Type: `OpenCodeEvent` (`packages/client/src/promise/index.ts:23`; union built in `packages/protocol/src/groups/event.ts:14-36, 62-68`, which also admits `rpc.*` events and `server.connected`).
- **Envelope** (`packages/schema/src/event.ts:60-71`): `{id: "evt_…", type, created: ms, metadata?, location?, data}` plus `durable: {aggregateID, seq, version}` for durable events (`:101-110`). Ephemeral events have no `durable` (`:126-134`). The GUI's message IDs for synthetic/idle rows derive from `evt_` -> `msg_` (`schema/src/session-message.ts:26-28`; `data.ts:76`).
- **Per-session replayable log** (experimental): `GET /api/experimental/session/:sessionID/log?after=<seq>&follow=<bool>`, client `sessions.log({sessionID, after?, follow?})` -> SSE of durable session events followed by a `{type:"log.synced", aggregateID, seq?}` marker, then live durable events if `follow`. Ephemeral deltas are absent. `packages/protocol/src/groups/session.ts:724-742`; `packages/schema/src/event-log.ts:7-21`; `packages/core/src/session.ts:163-173`; `specs/v2/session.md:106-112`.

**Event types** (all in `ServerDefinitions`, `packages/schema/src/event-manifest.ts:71-81`; session ones defined in `packages/schema/src/session-event.ts`). D = durable, E = ephemeral.

| Concern | Event type (data highlights) |
|---|---|
| Session lifecycle | `session.created` D `{sessionID, projectID, location, parentID?, agent?, model?, metadata?, permissions?, title?}` (`:48-66`); `session.deleted` D (`:176-185`); `session.forked` D; `session.renamed` D; `session.metadata.updated` D; **`session.permissions` D** `{permissions}` (`:121-129`); `session.agent.selected` D; `session.model.selected` D; `session.moved` D; `session.viewed` D; `session.usage.updated` E `{cost, tokens}` (`:166-175`); `session.instructions.updated` D; `session.revert.staged\|cleared\|committed` D |
| Busy / idle | `session.execution.started` D; `session.execution.succeeded` D; `session.execution.failed` D `{error}`; `session.execution.interrupted` D `{reason: user\|shutdown\|superseded\|inactivity}` (`:238-257`). Snapshot: `GET /api/session/active` -> `{data: {[sessionID]: {type:"running"}}}` (`protocol/src/groups/session.ts:273-283`), client `sessions.active()`. `session.status` E `{status: idle\|busy\|retry}` and deprecated `session.idle` E are declared (`schema/src/session-status-event.ts:35-53`, listed `event-manifest.ts:75`) but **no publisher exists** in core/server/sdk/plugin (grep); only a stale listener at `packages/app/src/session/usage-exceeded-dialogs.tsx:96`. The GUI computes busy/idle from `execution.*` + `session.active` (`data.ts:255-260, 1009-1011, 1025-1031`; `packages/app/src/shell/routes/session-ui-provider.tsx:73-80`). |
| Model step | `session.step.started` D `{assistantMessageID, agent, model, snapshot?, started}`; `session.step.streamed` D; `session.step.ended` D `{finish, rawFinish?, cost, tokens, snapshot?, files?}`; `session.step.failed` D `{error, finish?, ...}` (`:327-385`) |
| Text streaming | `session.text.started` D `{assistantMessageID, ordinal}`; **`session.text.delta` E `{assistantMessageID, ordinal, delta}`**; `session.text.ended` D `{…, text}` (full value) (`:387-424`) |
| Reasoning streaming | `session.reasoning.started` D; `session.reasoning.delta` E; `session.reasoning.ended` D `{text}` (`:426-463`) |
| Tool-call input streaming | `session.tool.input.started` D `{assistantMessageID, id, name}`; **`session.tool.input.delta` E `{id, delta}`**; `session.tool.input.ended` D `{id, text}` (raw input JSON text) (`:471-504`) |
| Tool status | `session.tool.called` D `{id, input, executed}` (running); `session.tool.progress` E `{id, metadata}` (replacement metadata); `session.tool.success` D (v2) `{id, content: NonEmpty<text\|file>, metadata?, executed}`; `session.tool.failed` D (v2) `{id, error, content?, metadata?, executed}` (`:506-562`) |
| Errors | `session.step.failed.error`, `session.execution.failed.error`, `session.tool.failed.error`, `session.compaction.failed.error`, `session.retry.scheduled {attempt, at, error}` D (`:567-581`). Error shape `{type, message, status?, response?}` (`schema/src/session-error.ts:7-14`); types include `permission.rejected`, `tool.execution`, `aborted`, `provider.*` (`core/src/session/to-session-error.ts:40-62`; `runner/step.ts:199-206`). |
| Inbox | `session.inbox.enqueued\|delivered\|cancelled\|delivery.changed` D (`:204-236`). Prompt admission returns `Session.Inbox.User`; the user message appears on `delivered`. |
| Other message-producing | `session.synthetic` D `{text, description?, metadata?}`; `session.skill.activated` D; `session.shell.started\|ended` D; `session.compaction.started\|ended\|failed` D, `session.compaction.delta` E |
| Permissions / forms / shells | `permission.asked\|replied` E; `form.created\|replied\|cancelled` E (`schema/src/form.ts:170-172`); `shell.created\|exited\|deleted` E |
| Connection | `server.connected`, `global.disposed` (`schema/src/server-event.ts:5-8`) |

The `question` tool and MCP elicitations use **forms** (`/api/session/:id/form*`, `form.*` events), not the permission channel; the GUI shows them in the same dock area (`packages/app/src/session/requests/model.ts:39-69`; `packages/core/src/tool/plugin/question.ts:58-100`).

### C.2 Message and part data model

**Message union** (`packages/schema/src/session-message.ts:295-307`; HTTP form `PublicSessionMessage` swaps `LocationSwitched` for a public-location variant, `packages/protocol/src/groups/message.ts:42-64`). Discriminator is `type`, not `role`. Common base `{id: "msg_…", metadata?, time:{created}}` (`:32-36`).

| `type` | Notes |
|---|---|
| `user` | `{text, files?, agents?, skills?}`; stored files are `{data: base64, mime, source: inline\|uri, name?, description?, mention?}` (`:73-81`; `schema/src/prompt.ts:19-48`). Sending uses `PromptInput.FileAttachment {uri, name?, description?, mention?}` (`schema/src/prompt-input.ts:9-20`). |
| `assistant` | `{agent, model, content[], snapshot?{start,end,files}, finish?, rawFinish?, providerState?, cost?, tokens?, error?, retry?, time:{created, streamed?, completed?}}` (`:211-236`). `finish` in `stop\|length\|tool-calls\|content-filter\|error\|unknown` (`schema/src/llm.ts:5`). |
| `synthetic` | `{text, description?}` + base metadata (host/system-injected, e.g. subagent/shell completion) (`:83-89`) |
| `system` | frozen instruction-update text (`:91-99`) |
| `skill`, `shell`, `agent-switched`, `model-switched`, `location-switched` | `:44-71, 101-123` (`shell`: `{shellID, command, status, exit?, output?, time}`) |
| `compaction` | `status: running\|completed\|failed` variants (`:238-281`) |
| `idle` | turn boundary marker `{outcome: succeeded\|failed\|interrupted}`; shutdown does not record one (`:283-293`) |

**Assistant content parts** (`:160-202`): exactly three kinds, no part IDs, no `step-start`/`step-finish`/`patch`/`file` parts.
- `text` `{text, state?}`
- `reasoning` `{text, state?, time?{created, completed?}}`
- `tool` `{id, name, executed?, providerState?, providerResultState?, state, time:{created, ran?, completed?}}` where `id` is the provider call ID, **unique only within the assistant message** (`specs/v2/session.md:76`).

**Tool states** (`:125-158`): `streaming {input: string}` -> `running {input: object, metadata: Json}` -> `completed {input, content: NonEmpty<Tool.Content>, metadata?}` or `error {input, error: SessionError, content?, metadata?}`. `Tool.Content` is `{type:"text", text}` | `{type:"file", uri, mime, name?}` (`schema/src/tool.ts:67-84`). Files produced by tools exist only inside tool `content`.

**Reading messages**: `GET /api/session/:sessionID/message?limit&order&cursor&type`, client `message.list({sessionID, limit?, order?, cursor?, type?})` (note: top-level `message`, not under `session`) -> `{data: Message[], cursor: {previous?, next?}}`. `limit` 1-200, server default 50; `order` `asc|desc`, default `desc` (newest first); `cursor` is an opaque base64url JSON `{id, order, direction}` taken from `cursor.next` / `cursor.previous` of the previous page, and **cannot be combined with `order`**; `type` filters before pagination and must be repeated when following a cursor, and the list omits `idle` from the filterable types. `packages/protocol/src/groups/message.ts:8-40, 66-93`; `packages/server/src/handlers/message.ts:9-64`; `packages/client/src/promise/generated/client.ts:1097-1109`. Paging semantics: with `order=desc`, `cursor.next` returns older messages and `cursor.previous` returns newer ones (`packages/core/src/session/store.ts:139-170`; GUI loads newest first then reverses and follows `cursor.next`: `packages/client/src/solid/data.ts:1628-1655, 1683-1700`).
Related reads: `GET /api/session/:id/message/:messageID` (`sessions.message.get`, `client.ts:999-1010`); `GET /api/session/:id/context` (messages after the last compaction, `protocol/src/groups/session.ts:567-578`); `GET /api/session/:id/inbox` (admitted but undelivered inputs, `:605-616`); sessions list is separately cursor-paged and filterable by `parentID` (use `parentID` to list a session's children; `protocol/src/groups/session.ts:40-50, 180-198`).

### C.3 Where the GUI consumes these (sync/store layer)

| Layer | File |
|---|---|
| SSE connect/reconnect, batching (16 ms flush in the app), stall watchdog, requires first frame `server.connected` | `packages/client/src/solid/connection.ts:60-181` (`createClientConnection`) |
| App-level connection and event bus (`event.on(type)`, `event.listen`, per-directory filtering) | `packages/app/src/runtime/server/client.tsx:15-120` |
| Central store: `store.session.{info,family,active,message,messageCursor,pending,permission,form}`, `project.permission`, `location.*`; `handleEvent` switch applying every event above | `packages/client/src/solid/data.ts` (store type `:106-131`; `handleEvent` `:593-1295`; message helpers `:419-470`; message sync/paging `:1628-1700`; permission API `:1730-1754`) |
| Wiring into the app (createData with `api`, `event`, `connection`) | `packages/app/src/runtime/server/runtime.tsx:160-184` |
| Desktop wrapper (optimistic session removal) | `packages/app/src/runtime/server/data.ts:1-30` |
| Directory/global bootstrap reads | `packages/app/src/runtime/server/global-sync/*`, `packages/app/src/runtime/server/sync.tsx` |
| Presentation | `packages/app/src/session/timeline/*` (controller, message-timeline, virtualizer, projection), `packages/session-ui/src/timeline/*` (rows, projection, detail), `packages/session-ui/src/tools/tool-renderer.tsx` |

Store behaviours worth copying: streaming handlers locate the target as "the latest part of that kind" in the assistant message (`editText`/`editReasoning`/`editTool` use `findLast`, ignoring `ordinal`; `data.ts:446-466`) and drop events for rows that were never loaded; `*.ended`/`tool.success`/`tool.failed` overwrite deltas with the canonical values (`:914-917, 953-980, 997-1003`); on `execution.*` it inserts an `idle` row, and if any tool part is still `streaming|running` it invalidates and refetches the message list (`:1025-1062`); a `session.created` event skips the initial pending/message reads because the session starts empty (`:631-641`).

### C.4 Implications for Buddy (derived)

1. Subscribe once (SDK `events`), key everything by `sessionID`, treat `server.connected` as "refetch active + the sessions I display".
2. Build streaming UI from `step.started` -> `text/reasoning/tool.*` events, reconcile on the durable `*.ended` events, and use `message.list(order:"desc")` + `cursor.next` for history. Use `session.log` only if you need durable replay with a cursor.
3. Do not rely on `session.status`; derive busy/idle as above. Tool-part identity is `(assistantMessageID, toolCallID)`; text/reasoning parts have only positional identity (`ordinal` on events).
4. Expect `permission.asked` for child sessions to arrive on the same stream; filter by session tree, not by the visible session ID alone.

---

## D. Not verified / open points

- Relative registration order of the built-in `opencode.agent` transform vs the config agent plugin, hence the exact position of config rules relative to built-in agent rules in a given host. The rules appended by each are documented above; the interleaving is a function of plugin registration order which I did not trace.
- Whether a PATCH to a parent's `permissions` should be propagated to children is a policy question; the code only copies at creation (`core/src/session.ts:287-288`).
- `session.status` producer: none found; if Buddy needs retry visibility use `session.retry.scheduled`.
- I did not exercise any of this at runtime; all findings are from static reading of v2.0.24 (tests cited where they pin behaviour: `core/test/session-create.test.ts`, `core/test/tool-subagent.test.ts`).

## E. File index

| Topic | Files |
|---|---|
| Permission engine | `packages/core/src/permission.ts`, `packages/core/src/permission/{saved,sql}.ts`, `packages/core/src/util/wildcard.ts`, `packages/schema/src/{permission,permission-saved}.ts` |
| Permission HTTP | `packages/protocol/src/groups/permission.ts`, `packages/server/src/handlers/permission.ts`, `packages/client/src/promise/generated/client.ts:1498-1591` |
| Session rules | `packages/protocol/src/groups/session.ts:219-240, 360-377`, `packages/server/src/handlers/session.ts:128-148, 258-282`, `packages/core/src/session.ts:262-290`, `packages/core/src/session/session.ts:82-88`, `packages/core/src/session/projector.ts:438-460, 584-591` |
| Tool visibility | `packages/core/src/tool.ts:225-295`, `packages/core/src/session/context.ts:106-139`, `packages/core/src/session/model-request.ts:201-290, 404-409`, `packages/core/src/tool/AGENTS.md` |
| Plugin API | `packages/plugin/src/effect/{plugin,session,tool,permission,shell}.ts`, `packages/plugin/src/effect/README.md`, `packages/core/src/plugin/{hooks,host,agent,plan}.ts` |
| Subagents/jobs/shell | `packages/core/src/tool/plugin/{subagent,shell}.ts`, `packages/core/src/job.ts`, `packages/core/src/session/{subagent-job,subagent-completion}.ts`, `packages/core/src/session/execution/restart.ts`, `packages/core/src/session/execution.ts:127-131`, `packages/core/src/shell/result.ts` |
| Events | `packages/schema/src/{event,event-manifest,session-event,session-status-event,server-event,event-log}.ts`, `packages/protocol/src/groups/event.ts`, `packages/server/src/{handlers/event.ts,event-feed.ts}`, `packages/client/src/{shared-events.ts,promise/client.ts}`, `specs/v2/event-stream-architecture.md` |
| Messages | `packages/schema/src/{session-message,tool,prompt,prompt-input,session-inbox,session-error}.ts`, `packages/protocol/src/groups/message.ts`, `packages/server/src/handlers/message.ts`, `packages/core/src/session/store.ts:139-185` |
| GUI | `packages/client/src/solid/{data,connection}.ts`, `packages/app/src/runtime/server/{client.tsx,runtime.tsx,data.ts}`, `packages/app/src/session/requests/*`, `packages/app/src/session/header/session-running-menu.tsx`, `packages/session-ui/src/{components/dock-prompt.tsx,tools/tool-renderer.tsx,timeline/*}` |
| SDK | `packages/sdk/src/{promise.ts,internal/host.ts,internal/instances.ts}`, `packages/sdk/README.md` |
