# Runtime switch sheet

Current as of 2026-10-22 evening (owner questions deferred). Phase 3 of [`runtime-decoupling-plan.md`](runtime-decoupling-plan.md).

This sheet says what it would take to run Buddy on an agent runtime other than OpenCode. It is for the owner and for an engineer deciding whether to switch. Pi is the first candidate the plan names, so each port has a short Pi note.

**How to read it.**

- Code claims cite `file:line` in the v2 branch as of 2026-10-22 evening.
- **Inference** marks anything not read directly in code: Pi fit, work estimates, export strategies.
- Pi notes rest on Pi's public docs and source, read on 2026-10-21. No Pi code was run.
- Conformance cases are named by key (C1, X1, …). The index is in Appendix A.

Path prefixes:

| Prefix | Directory |
|---|---|
| AR | `packages/agent-runtime/src/` (the port and extension contracts) |
| R | `packages/opencode-adapter/src/runtime/` (port implementations) |
| G | `packages/opencode-adapter/src/gateway/` |
| E | `packages/opencode-adapter/src/extension/` (the inbound bridge) |
| H | `packages/opencode-adapter/src/host.ts` |
| AD | `packages/opencode-adapter/src/` (files at the package root) |
| B | `packages/buddy/src/` |
| T | `packages/buddy/test/conformance/` |
| TC | `packages/transcript-contract/src/` |
| W | `packages/web/src/` |
| DS | `packages/desktop-electron/src/` |
| OC | `vendor/opencode/packages/core/src/` |
| OP | `vendor/opencode/packages/protocol/src/groups/` |

## 1. Summary

### Portable now

- Buddy's backend reaches the runtime only through `AgentRuntime`: eleven ports plus name and version (AR/runtime.ts:13–27). It hands the runtime one `RuntimeExtension`: tools, notebook plan, hooks, ChatGPT service (AR/extension.ts:111–116).
- Three production source files import the adapter: the composition root, runtime info and runtime paths (`script/check-import-contract.ts:15–18`). The Node build script also imports it (`packages/buddy/script/build-node.ts:11`). The web talks only to Buddy's HTTP API.
- A switch therefore means: a new adapter that implements the eleven ports and consumes the extension; a new `createRuntime` in B/runtime/agent-runtime.ts:30–49; new path planning in B/runtime/runtime-paths.ts; desktop launch and build changes; dropping Buddy's OpenCode-specific workarounds (section 3G); a new conformance harness (below).
- Buddy already owns its tools, teaching state, delegated-permission computation (`evaluatePermission`, TC/permission-rules.ts:63), notebook config and its resolution into a `NotebookPlan` (B/runtime/buddy-extension.ts:11), the ChatGPT account service (B/chatgpt/account.ts), the transcript contract, artifacts, notes and memory.

### Largest gaps, in order of the work they add (inference)

1. **Approvals.** OpenCode enforces rules, hides denied tools from the model, raises requests, saves "always" grants per project and routes Buddy tool asks. Pi has only a `tool_call` hook. Buddy would build a rule engine at call time, a request registry and a grant store.
2. **Subagents.** There is no Subagents port. OpenCode's native `subagent` tool and job scheduler do the work, and Buddy's hooks read that tool's input shape (B/runtime/buddy-subagents.ts:18,102–103). Pi has no subagents.
3. **Conversation store and IDs.** Session tree, metadata, fork, revert with file snapshots, cursor pages. Web and Buddy code still assume OpenCode's `msg_`/`prt_` ID shapes (section 3A); the web no longer relies on their lexical order (W26d).
4. **Event projection.** Buddy's live stream (snapshots before deltas, hydration for a late joiner, resync, sealed terminal state, output of a running shell command) is built in the adapter from OpenCode's events and shell capture files (G/stream.ts:30–117; section 3G).
5. **Notebook plan application.** Per-notebook agents, providers, models, MCP servers, skills, commands and rules, applied with revisions and a reload barrier (E/notebook.ts:130–351).
6. **The conformance harness is OpenCode-bound.** The test bodies speak Buddy's HTTP API. The harness scripts the model through an OpenCode plugin, seeds chats through the native `session.import`, and writes `opencode.json` fixtures (T/harness.ts:6,66–132,154–156,177–189; T/harness-config.ts:5,31–61,123,130). Both harness files are on the adapter-import allowlist (`script/check-import-contract.ts:32–33`). A new runtime needs a new harness before the suite can judge it. The UI E2E layer (`packages/desktop-electron/e2e/`) is closer to neutral: it scripts the model through a loopback OpenAI-compatible server configured in `buddy.jsonc` (`e2e/fixtures/notebook.ts:4–26`), though its reference fixture still writes `opencode.json` (:38).

### Fit at a glance (Pi notes are inference)

| Area | What OpenCode does for Buddy | Pi |
|---|---|---|
| Conversations | session tree, metadata, fork, revert with snapshots | partial: JSONL tree, fork, custom entries |
| Execution | serialized admission, queue/steer, no-reply, commands | partial: prompt, steer, follow-up, abort |
| Events | event bus Buddy projects into its stream | partial: per-session events, `agent_settled` |
| Workspace | project identity, file search | partial: `cwd` only |
| Approvals | full rule engine, requests, saved grants | absent: `tool_call` hook only |
| Forms | agent questions, listable after reconnect | partial: extension UI prompts only |
| Catalog | agents/personas, skills, commands | partial: skills and commands; no agent catalog |
| Providers | catalog, keys, OAuth attempts, credential store | partial to native: multi-provider, OAuth, `auth.json` |
| MCP | servers, status, OAuth | native, but opt-in for SDK hosts |
| References | local and git reference catalog | absent |
| ChatGPT | credentials, retry and 401 policy, account models | partial: ChatGPT login exists |
| Tools | native tool bridge | native: custom tools |
| Hooks | prompt, context, hydrate, before-tool | partial: extension events |
| Subagents | native tool, jobs, parent notification | absent |
| Notebook plan | transforms with revisions and barrier | partial: settings and resources, no barrier |

### User data a switch must move, by impact

1. **Chats and attachments:** SQLite `opencode.db`, tables `session_v2` and `session_message` plus queue, instruction and event tables. Prompt attachments are inline bytes. On desktop, chats from v1 are still only in the v1 tables until the v1 chat import lands (section 4.0).
2. **Artifact links:** notebook `.buddy/` files that embed session, message, tool-call and adapter-made part IDs.
3. **Teaching and subagent lineage:** `buddyTeaching` JSON in session metadata, parent links, completion messages.
4. **Credentials, MCP, config:** the `credential` table (secrets), Buddy JSONC, native `opencode.json[c]` (the only place references and project commands are configured), skills, plan documents. MCP sign-ins from v1 are not imported (section 4.0).
5. **Snapshots and full tool output:** git snapshot repositories and 7-day output files under the runtime data root.
6. **Grants and drafts:** the `permission` table, per-session rules, the web's draft, model and chat stores, theme keys.
7. **Plugin storage:** the `kv` table and native account tables.

No single route exports all of this. Ports give Buddy's view. OpenCode's public API gives more. The rest needs a file and database inventory (section 4).

## 2. Per port

Each port lists what OpenCode provides, what any runtime must provide (by conformance case), what is not covered by any case, what Buddy would add by hand, and a Pi note.

### Rules every adapter keeps

| Rule | Where |
|---|---|
| One error type, `RuntimeError` with `kind` and `subject`; HTTP status by kind (404, 409 for conflict/busy/interrupted, 503 unavailable, 500 internal) | AR/errors.ts:1–53; native mapping R/errors.ts:8–55 |
| Reads throw; prompt, command, compact and admit return `RuntimeResult` | AR/execution.ts:62–65 |
| Caller message IDs must start with `msg_` (checked in the adapter, advertised in the route schema) | R/execution.ts:33–38; B/routes/session.ts:137 |
| Transcript shape is transcript-contract. Order is `message.order` (a string) and `part.position` | TC/message.ts:13,23 |
| The web orders messages by `time.created`, then compares `order` as a string, then falls back to the ID (one comparator since W26d). `order` and `position` are optional. OpenCode's adapter sets `order` to the native message ID | W/state/transcript-repository.ts:272–279; G/message.ts:425,492; TC/message.ts:13,23 |
| Normalized tool fields (file changes, summary, shell, todos, questions, skill content, outcome) are filled by the adapter | TC/message.ts:216–223; G/message.ts:107–177; G/tool-presentation.ts:12–25 |
| Tool presentation lookup is given once at construction | B/runtime/agent-runtime.ts:39; R/options.ts:3–5 |

So a replacement must give messages creation times, and `order` strings that sort correctly as plain strings when two messages share a time (inference from the comparator above).

### Conversations (AR/conversations.ts:45–59)

| | |
|---|---|
| OpenCode today | Wraps native `session.*` and `message.list/get` (R/conversations.ts:27–89; G/session.ts:36–127; G/message.ts:518–560). Metadata writes from the runtime and from plugin hooks share one process-wide per-session lock and merge (AD/session-metadata.ts:5–30; R/conversations.ts:50–58; E/hooks.ts:21–23; AF2). `transcript` walks the whole history and projects it; it is not native export (R/conversations.ts:77–88). Archive and fork title are Buddy metadata handled in the gateway (G/session.ts:87,112). |
| Must provide | C1 (create with metadata, family, recursive remove), C2 (chronological cursor pages), C3 (fork with exclusive boundary), C4 (revert and unrevert). Children are also used by S1–S3 and by the approvals route (B/routes/permission.ts:31–42). |
| No case covers | list filters (`search`, `updatedSince`, `include`), archive, metadata key deletion and concurrent unrelated keys, transcript fidelity, file restore on revert (C4 checks the boundary only). |
| Buddy adds if missing | Parent and child links with recursive removal; a metadata store with merge and delete; newest-first pages returned oldest-first; fork before a message; revert and unrevert that also restore files (needs a snapshot store); projection into transcript-contract with stable IDs and order. |
| Pi (inference) | `SessionManager` keeps a JSONL tree with entries, branches, branched sessions and custom entries that can hold metadata. Its `parentSession` describes forks, not delegation. Buddy would add the delegation index, a merged metadata view, pagination and revert with files, or supply its own `SessionManager` over Buddy storage. |

### Execution (AR/execution.ts:60–71)

| | |
|---|---|
| OpenCode today | Per-session serialized admission that switches agent and model before the prompt (G/write.ts:28–53,65–76). A re-sent synchronous prompt with an explicit ID that was already delivered is a 409 (G/write.ts:68–79); `admit` skips that check and native admission can return the existing input (G/write.ts:116; OC/session/inbox.ts:154–166). `noReply` becomes native `resume: false` (R/execution.ts:29). Observation correlates inbox, step and terminal events (G/execution.ts:20). A command that is not found falls back to the skill of that name (G/write.ts:158–174). The visible slash command is stored as `metadata.buddy.command` by a host decorator and prompt hook (E/command-display.ts:15–66). Interrupt, background, statuses, wait and generate are direct native calls (G/session.ts:130–141; R/execution.ts:121–138). |
| Must provide | X1–X6. X4 and S3 for interrupt. H2 and H3 exercise compaction. |
| No case covers | the delivered-ID conflict; observer close, disconnect and cancellation; commands while busy; the skill fallback; foreground to background; `wait`; `generate`. |
| Buddy adds if missing | A per-session admission queue; message ID allocation; queue versus steer delivery; a no-reply user message; correlation of a prompt to its final assistant message; command expansion with skill fallback and display metadata; generation from session context without a user turn. |
| Pi (inference) | Prompt waits for the run; steer and follow-up exist; abort exists; compaction exists. `sendCustomMessage` adds a custom message without a turn, which is not a user prompt, so X6 needs work. No durable admission ID. `agent_settled` is the event that means "turn finished". |

### Events (AR/events.ts:4–11)

| | |
|---|---|
| OpenCode today | `stream` subscribes to native events and runs a stateful translator (G/event.ts:35; G/stream.ts:30–117): directory filter (:56), approval and question events (:57–66), hydration of a joined session or message (:84–92), resync from the latest 50 messages (:93–97), replay after hydration (:99–102). While a shell command runs, the stream reads its capture file every 500 ms (:39,49–55), and on connect it re-hydrates replies with running shells (:69–83); both rely on the host's shell observer (section 3G). `signals` maps three execution outcomes and renames (R/events.ts:16–28). Buddy uses signals for Bench capture cleanup and note title sync (B/runtime/agent-runtime.ts:11–28; B/notes/session-title-sync.ts:108). The SSE route consumes `stream` (B/http/opencode-event-stream.ts:119). |
| Must provide | V1 (snapshots before deltas, sealed before idle), V2 (late joiner hydrated), V3 (rename and completion visible and durable). Also the live-versus-history checks (T/live-history.test.ts:21,52,69), running shell output before completion and after reconnect (T/tools.test.ts:89), and `signals` for a finished turn and a rename (T/bench.test.ts:43; T/notes.test.ts:16). |
| No case covers | forced resync, duplicate or stale deltas, translator memory bounds, `signals` for failed or interrupted turns. |
| Buddy adds if missing | The `BuddyEvent` projection with the four guarantees above, live output of running shell commands, plus a global signal stream across sessions. |
| Pi (inference) | `subscribe` gives message deltas, `message_end`, `agent_settled`, `session_info_changed`, per session. Buddy would add a per-directory fan-in over many sessions and hydration for late joiners. |

### Workspace (AR/workspace.ts:36–42)

| | |
|---|---|
| OpenCode today | `project.list/update`, `location.get`, `file.find` (R/workspace.ts:16–72). `location` does not return `workspaceID` (R/workspace.ts:32–42). Project identity is OpenCode's: for git, a hash of the remote, else a cached ID, else the root commit, else a global fallback; a directory without markers gets a directory hash (OC/project.ts:347–379). |
| Must provide | No case. Q1 asserts the location directory only. |
| No case covers | project identity, `projects`, `updateProject`, `project`, `findFiles`. |
| Buddy adds if missing | A project registry keyed by notebook directory with name, icon, start command and sandboxes; file search. |
| Pi (inference) | Only `cwd`. Buddy would own projects. A new project identity changes the key of saved grants and snapshot repositories (section 4.5, 4.6). |

### Approvals (AR/approvals.ts:19–27)

| | |
|---|---|
| OpenCode today | The native permission engine evaluates rules, hides denied tools, asks, and saves "always" grants per project (table OC/permission/sql.ts:7–19). The adapter lists pending requests by directory or by an explicit session list (R/approvals.ts:30–34); the session-tree walk is in Buddy's route (B/routes/permission.ts:31–42). Request actions are mapped to Buddy words (`external_directory` → `outside_notebook`) with `file` and `command` extracted (G/permission.ts:9–34). Saved grants are project-scoped (G/permission.ts:62–73). Session rules are read and updated under a per-session queue with an updated/unchanged/missing result (G/permission.ts:75–113). Buddy tool asks use a fixed protocol: subscribe before create, carry reject feedback through a decorated reply, interrupt on a reject without feedback, reject an unsettled ask on cancellation (E/tools.ts:117–135,170–224; H:210). |
| Must provide | A1 (denied tool hidden from the model; the scripted model checks for v2's `shell` tool, and the case fails when the deny rule is removed), A2 (outside access asks; rejection feedback reaches tool and assistant), A3 (always grant saved and reused by a new conversation). K4 depends on the same engine. |
| No case covers | Buddy's own `ToolCall.ask` path (A2 uses the native `read` tool, T/approvals.test.ts:24); sibling feedback; ask cancellation; the tri-state rule update; a revoked grant asking again; deeper session trees. |
| Buddy adds if missing | Rule evaluation at call time and tool hiding (Buddy's matcher in TC/permission-rules.ts:49–66 is used today only to compute policy; that it matches native semantics is an inference), a request registry with stable IDs visible after reconnect, once/always/reject with feedback, a project-scoped grant store, per-session rule storage, Windows path rules. |
| Pi (inference) | Absent. A `tool_call` handler can block a call and `ctx.ui.confirm` needs a host UI. Project trust is not tool permission. This is the largest single build. |

### Forms (AR/forms.ts:18–22)

| | |
|---|---|
| OpenCode today | Native `session.form.*` behind the question tool (R/forms.ts:63–97). Directory scope walks sessions and keeps those inside the canonical notebook directory (R/forms.ts:11–47). Only agent questions are shown, and answers are validated against them (G/form.ts:10,28). |
| Must provide | F1 (listed after reconnect, answer reaches the assistant), F2 (cancel after reconnect returns to idle), F3 (invalid single choice leaves the request open). |
| No case covers | non-agent forms excluded; nested directories; custom free-text answers (multi-select is covered by F1); host restart (F1/F2 reconnect the client, not the host). |
| Buddy adds if missing | A question registry with session and tool attribution that survives client reconnect, validates answers and resumes or cancels the turn. |
| Pi (inference) | Extension UI offers select, confirm and input. No queryable registry. Buddy would build a question tool that waits on a Buddy-held request. |

### Catalog (AR/catalog.ts:28–38)

| | |
|---|---|
| OpenCode today | Agents, agent rules and skills from native lists, with OpenCode-only skills suppressed (R/catalog.ts:36–76; E/notebook.ts:103–113). Commands merge native commands and skills, commands winning on a clash (G/command.ts:3–11). The plan operations publish, list active directories, sync and await through adapter registries and a native RPC (R/catalog.ts:17–35; E/notebook.ts:115–131,286–351). |
| Must provide | K1 (personas selectable, Buddy tools offered), K2 (configured agent selectable), K3 (skills and commands discoverable), K4 (notebook tool policy scoped to its notebook), K5 (reloaded config changes the next prompt). |
| No case covers | revision rejection, barrier failure, multi-location sync options, `agentRules`, `activeNotebookDirectories`. |
| Buddy adds if missing | A persona and agent catalog with mode, hidden flag, model and rules; skill discovery and suppression; a command catalog; a plan revision registry and barrier. |
| Pi (inference) | Agent Skills and prompt templates exist. There is no agent or persona catalog. Buddy would map each persona to a system prompt, tool set and model itself. |

### Providers (AR/providers.ts:43–52)

| | |
|---|---|
| OpenCode today | Native provider, model and integration lists plus Buddy's `buddy.providers` RPC for full definitions (G/provider.ts:29–94). Auth methods, OAuth attempts, keys and credential removal through `integration.*` and `credential.remove` (G/integration.ts:22–88). Errors classified by native tag (R/providers.ts:10–34). The DTO is Buddy's, including `bundled` and `free` (AR/providers.ts:6–17). |
| Must provide | P1 (capabilities, variants, limits), P2 (key save and removal without exposing the key), P3 (distinct OAuth attempts; cancel prevents completion). |
| No case covers | a successful OAuth exchange (the fixture's callback throws, T/harness-config.ts:58–60), token refresh, `defaultModel`, multi-account removal. |
| Buddy adds if missing | A model catalog with capabilities, variants, limits and tier costs; key and OAuth flows with attempt handles and expiry; a credential store. |
| Pi (inference) | `pi-ai` covers many providers and OAuth logins, including ChatGPT and Claude subscriptions, with an `auth.json` store. Buddy would translate the DTO and add attempt handles. Credentials would move from OpenCode's table to Pi's store, by copy or re-login. |

### MCP (AR/mcp.ts:29–37)

| | |
|---|---|
| OpenCode today | `mcp.list/connect/disconnect`; OAuth through `integration.oauth.*`; token removal through `credential.remove` (R/mcp.ts:46–87). Server definitions come from Buddy config through `NotebookPlan.mcp` (AR/notebook-plan.ts:76–94), translated to native snake case (E/notebook.ts:89–97). MCP sign-in tokens stay in the runtime's own credential store. |
| Must provide | M1 (saved definitions readable, disabled until connected), M2 (local server connects and disconnects), M3 (invalid definitions rejected). |
| No case covers | remote OAuth (`startAuth`, `authProgress`, `cancelAuth`, `removeCredentials`) and the three error statuses. |
| Buddy adds if missing | An MCP client manager with the six statuses, connect and disconnect, and pollable OAuth attempts. |
| Pi (inference) | Native MCP over stdio and HTTP with OAuth per name and URL. SDK hosts must register the built-in MCP extension themselves. Tokens would not carry over. |

### References (AR/references.ts:24–26)

| | |
|---|---|
| OpenCode today | `reference.list` returns entries from native config (R/references.ts:9–11). Buddy has no reference config of its own: the conformance fixture writes `opencode.json` with a `references` key (T/harness-config.ts:130). Git references are cloned under the runtime data root (H:137). Buddy owns the composer part, `reference` with legacy `opencode-reference` still decoded (TC/prompt.ts:4–5), and expands it into the prompt (B/learning/prompt/workspace-file-references.ts:306,545). |
| Must provide | Q1 (catalog describes notebook docs), Q2 (both part spellings expand to the same model input), Q3 (unavailable reference is a 400 before admission). |
| No case covers | git sources, hidden references. |
| Buddy adds if missing | A reference config (local and git), git clone and cache, the catalog. Existing `references` entries in `opencode.json[c]` would need importing. |
| Pi (inference) | Absent; Pi resources and skills are a different concept. Small, self-contained build. |

### ChatGPT (AR/chatgpt.ts:115–134)

| | |
|---|---|
| OpenCode today | Outbound calls go through a native RPC, `buddy.codex` (R/chatgpt.ts:7–33), into a native plugin that runs Buddy's account service (E/chatgpt.ts:102–127). Credentials, and the retry, rejection and account-switch policy around them, come from OpenCode's credential store and native hooks. Account models are overlaid on the provider catalog (E/chatgpt.ts:42–99). |
| Must provide | No conformance case. |
| No case covers | everything: identity, models, usage, image, credential resolve and reject, account switch. |
| Buddy adds if missing | The service is already Buddy's (B/chatgpt/account.ts). The adapter must supply `ChatGPTCredentials`, call `credentialSwitched` on an account switch, and reproduce the retry and 401 policy at the provider layer. |
| Pi (inference) | "Sign in with ChatGPT" exists. No evidence of an account-switch event or of hooks that can intercept retries and HTTP responses. |

### Extension side: tools (AR/extension.ts:22–66)

| | |
|---|---|
| OpenCode today | Each `RuntimeTool` becomes a native tool with a pass-through schema (E/tools.ts:72–112), registered per location (E/plugin.ts:21–24). History is loaded per call through the gateway's message projection (E/tools.ts:33–52; G/message.ts:518–540; AF2). Progress goes through `context.progress` with `buddy.title` (E/tools.ts:28–31,98). Attachments map to native URIs; `truncated: false` is set when output fits the tool's limits (E/tools.ts:54–70). Errors become native tool errors and abort passes through (E/tools.ts:105–109). |
| Must provide | K1 and K4 show tools are offered and scoped. |
| No case covers | the run contract itself: abort, progress, history, attachments, output limits, `ask`. |
| Buddy adds if missing | Nothing in the tools; only the bridge. |
| Pi (inference) | Good fit: `customTools` and `registerTool` with execute and update callbacks. JSON Schema to TypeBox may need a pass-through. Tool history must come from Buddy's own projection. |

### Extension side: hooks and context (AR/extension.ts:68–109)

| | |
|---|---|
| OpenCode today | `hydrate` runs on context, compaction and generate; `prompt` on prompt; `beforeTool` on tool execute; `context` after the adapter's prompt presentation (E/hooks.ts:85–107). Prompt presentation (hide ignored segments, re-append stored system text after compaction) is adapter work (E/hooks.ts:43–76). Hooks get a `SessionAccess` over the plugin context (E/hooks.ts:14–41); its `patchMetadata` takes the same per-session lock as the runtime's writers (AD/session-metadata.ts:7–30; AF2), and teaching writes also take their own (B/learning/agent-execution/state/teaching-session-metadata.ts:39–48). Buddy's `context` hook drops instruction blocks by parsing OpenCode's `Instructions from: <path>` headings, strips concise-response text, sets verbosity and captures the system prompt (B/runtime/buddy-hooks.ts:22–64). |
| Must provide | H1 (per-prompt system context scoped to its chat), H2 (teaching context reaches the model; teaching state survives compaction), H3 (global auto-compaction setting applies to a running chat). |
| No case covers | instruction filtering, concise stripping, hydrate after restart before compaction or generate, `ExtensionError` mapping. |
| Buddy adds if missing | The same hook points in the same order; system text as an aligned array; structured instruction sources, or the same heading convention. |
| Pi (inference) | Extension events cover input, context, session start, compaction and `tool_call`. The ordering and the alignment of system parts are Buddy's to rebuild. |

### Extension side: subagents (no port; `ports-design.md:56`)

| | |
|---|---|
| OpenCode today | The native `subagent` tool enforces a depth limit (OC/tool/plugin/subagent.ts:118–132), checks that a resumed child belongs to the caller (:164), creates the child with a parent link (:188–189) and runs it in the foreground or as a background job (:200). A finished background child is reported to the parent as a synthetic message with `{source: "subagent", childID, agent, state}` (OC/session/subagent-completion.ts:37–43). Buddy's `prompt` hook gives the child its role, rules and teaching snapshot before its first step (B/runtime/buddy-subagents.ts:31–98). `beforeTool` validates the native input `{agent, sessionID}` (:100–123). The adapter projects tool parts and completions (G/subagent.ts:30–74). |
| Must provide | S1 (foreground child has its role before step one and completes in the parent's tool part), S2 (background child finishes and the parent gets the result), S3 (stopping a background child tells the parent). |
| No case covers | resume with the wrong parent or role, malformed lineage, recovery after restart, exactly-once parent notification. |
| Buddy adds if missing | A spawn-and-continue tool, child sessions with parent links, the depth limit, foreground join, background jobs with recovery, parent notification, stop propagation, and the transcript parts `subagent` and `completion`. |
| Pi (inference) | Absent. A second `createAgentSession` gives none of these guarantees. Second largest build. |

### Extension side: notebook plan (AR/notebook-plan.ts:101–114)

| | |
|---|---|
| OpenCode today | Buddy builds the plan from its config (B/runtime/buddy-extension.ts:11). The adapter decodes it to native types (E/notebook.ts:49–101: `aisdk:` package prefix, snake-case MCP OAuth, permission decoding), fingerprints it (:36–47), publishes it by canonical directory after decoding (:130–139,343), installs transforms for integrations, providers, models, agents, skills, commands and MCP (:196–281), syncs through an RPC that rejects an unknown revision (:286–326), and reinstalls late transforms after `plugin.updated` (:327). |
| Must provide | K1–K5; M1–M3 and P1 indirectly; the notebook checks (T/notebooks.test.ts:59,74; T/config-patch.test.ts:5). |
| No case covers | stale transform order, an unavailable revision, barrier failure, diagnostics, full provider and model settings (variants, tier costs, headers). |
| Buddy adds if missing | A way to apply per-notebook agents, providers and models, MCP servers, skills, commands and rules at runtime, effective before the next prompt (K5). |
| Pi (inference) | Settings, resources, models and MCP exist. No per-notebook plan with a revision barrier. |

Global auto-compaction is not in the plan. Buddy writes OpenCode's compaction JSON itself (section 3C).

### Extension side: host lifecycle (no port, by design: `ports-design.md:39`)

| | |
|---|---|
| OpenCode today | The composition root starts lazily, coalesces, retries a failed start and serializes close and restart (B/runtime/agent-runtime.ts:30–75); a final shutdown refuses a restart (:77–80; N2F). The adapter installs environment and native global paths (H:105–139), creates directories, initializes Bench capture storage, repairs the legacy migration journal (H:186–201), builds the host with a global catalog plugin, the ChatGPT plugin and one runtime plugin per location (R/index.ts:30–54), wraps it in the shell observer, which subscribes to the host's events before the host is returned (H:144; AD/shell-observer.ts:83–117; section 3G), and decorates approvals and command display (H:210; R/index.ts:50). |
| Must provide | Every conformance case starts the host. The restart checks (T/storage.test.ts:40,67,89). The Node backend smoke (plan 0.3) runs on macOS and Windows. |
| Buddy adds if missing | Start and close for the new runtime, a path plan, the Electron launch environment, Windows paths. |
| Pi (inference) | `createAgentSession` and `dispose`, or an RPC child process. Pi needs Node 22.19 or newer; check that against Electron 41.9.0 (`packages/desktop-electron/package.json:72`), not checked here. |

## 3. Remaining couplings not behind a port

Each group says where the coupling lives, why it matters at switch time, and its status.

### 3A. Native ID formats

| Where | What | Status |
|---|---|---|
| W/state/chat-actions.ts:383–424, 554, 612, 634, 1731 | The web makes `msg_`/`prt_` IDs in OpenCode's layout (12 hex time digits, counter radix 0x1000, base62 tail) and sends the message ID with the prompt. | Not plan work; left to this sheet and a later cleanup order. |
| R/execution.ts:33–38; B/routes/session.ts:137 | Caller message IDs must start with `msg_`. | Same. |
| B/learning/features/diagrams/service/types.ts:26, store.ts:123,423,446; B/learning/features/svg-rendering/service/auto-repair.ts:22,38–39,143 | Mermaid and SVG repair requests use `msg_buddy_*` IDs, persisted as file names and checked by pattern. | Same. User data (4.2). |
| TC/message-visibility.ts:3–4,39,48; W/components/media/renderers/mermaid/mermaid-diagram.tsx:90 | Repair prompts are hidden by ID prefix; the UI detects OpenCode's `must start with "msg"` error text. | Same. |
| B/learning/features/memory/tuning.ts:183; internal-session.ts:13 | Memory's internal sessions are recognized by the prefix `ses_learner_memory_`. | Same. |
| G/message.ts:242–244; B/objects/manifest.ts:54–61; B/routes/object-mermaid.ts:70–71 | Part IDs are made by the adapter (`prt_<messageID>_<index>_<key>`). Artifact origins store them. | Same. A new adapter must make the same part IDs or migrate manifests. |
| G/message.ts:425,492; W/state/transcript-repository.ts:272–279; W/state/chat-reducer.ts:289–301; W/state/session-revert.ts:16,53,57 | `message.order` is the native ID. Revert, tail and autoscroll logic used to compare raw IDs. | Done: W26d compares messages by `time.created`, then `order`, and uses the revert ID only to find the boundary message. The ID fallback for optimistic snapshots without `order` remains. The backend added no chronology field; `time.created` plus `order` is judged enough (B26c). |

Why it matters: a runtime with other ID shapes breaks prompt submission, hides or shows the wrong messages, misorders transcripts and orphans artifact links, unless IDs are preserved or every store is remapped together.

### 3B. Native tool names and output conventions

| Where | What | Status |
|---|---|---|
| B/learning/features/memory/tuning.ts:52–63 | Memory decides "incidental" versus "meaningful" tool work by core tool names (`read`, `grep`, `bash`, `apply_patch`, …). | New; no plan item. A runtime with other tool names changes what memory extracts. |
| B/runtime/buddy-hooks.ts:22–40 | Instruction blocks are found by OpenCode's `Instructions from: <path>` heading. | New; no plan item. |
| B/runtime/buddy-subagents.ts:18,102–103 | Buddy reads the native `subagent` tool input `{agent, sessionID}`. | Part of the subagent gap (section 2). |
| W/components/bench/markdown/agent-edits.ts; W/components/chat/tools/{todo-state,tool-permission}.ts; W/components/chat/tools/render/* | The web used to read native tool names, raw input and metadata, and rejection error types. | Done: W26c reads `summary`, `fileChanges`, `shell`, `questions`, `todos` and `outcome`, which the adapter fills (G/message.ts:103–177). A new adapter must fill them for every tool it maps to a Buddy tool kind. Buddy custom renderers still read their own tools' `metadata`. |
| B/learning/prompt/runtime-context/resource-context/about-section.t.md:17 | Prompt text names runtime tools (`read`, `grep`, `glob`, `shell`). | Fixed for v2 (it said `bash`). A runtime with other tool names needs the prompt text to follow. |
| TC/permission-rules.ts:20–36; B/runtime/buddy-subagents.ts:82 | Buddy's permission rules use OpenCode action names (`external_directory`, `opencode_*`, `bash`→`shell`). Teaching policy revisions hash the native-shaped rules. | Accepted. Renaming changes persisted fingerprints, so it needs a migration. |

### 3C. Config serialization

| Where | What | Status |
|---|---|---|
| B/config/runtime/opencode-host-config.ts:16–22,31–42 | Buddy writes OpenCode's compaction JSON `{auto, keep: {tokens}, buffer}` and compares it for host reload. No port carries global compaction. | New; no plan item. H3 tests the behaviour. |
| B/config/contract/legacy-opencode.ts; B/config/contract/schema.ts | Buddy's authored config keeps an OpenCode-compatible shape. | Accepted (plan 2.4 keeps old JSONC readable). |
| OC/config/discovery.ts:11,41; H:151; B/runtime/runtime-paths.ts:154–158,203–208 | OpenCode still discovers `opencode.json[c]` and `.opencode` in Buddy's global config directory, `.claude` and `.agents` in the user's home, and all of them in notebooks and their ancestor folders (OC/config/discovery.ts:27–41,71–80). References and project commands can only be configured there (T/harness-config.ts:123,130). | New; no plan item. A switch silently drops these unless they are imported. |
| B/learning/agent-factories.ts:37–44; OC/plugin/plan.ts:14–41 | Buddy's plan persona may edit notebook `.opencode/plans/*.md` (a Buddy permission rule kept from v1); native v2 plan mode writes to `~/.opencode/plan`. | New. Plan documents in both places are user data (4.4). |

### 3D. Storage paths and environment

| Where | What | Status |
|---|---|---|
| B/runtime/runtime-paths.ts:70–87; `packages/script/src/storage-env.ts:3–4` | Runtime roots are `<Buddy data>/opencode`, `opencode.db`, and `opencode` under cache and state. | Accepted: composition-root allowlist. |
| B/learning/features/image-generation/service/generated-image.ts:7,74; generated-image-authorization.ts:72 | Generated images live under the runtime data root. | Accepted exception; moving them moves user data. |
| DS/main/index.ts:345,382,932–943; DS/main/storage-paths.ts:123–134; DS/main/cli.ts:125–148 | When the OpenCode database does not exist yet, desktop may show a loading screen during the first start; it runs no importer (UP). Desktop injects `OPENCODE_*` launch flags. | New. Review on macOS and Windows at switch time. |
| B/learning/personas/wiring/persona-availability.ts:16–34 | Development personas turn on when the runtime version contains `-dev`. | New. A new runtime's version scheme changes persona availability. |
| B/learning/features/image-generation/service/codex-images.ts:8,56 | Image requests send `originator: "opencode"`. | New. Check the remote requirement before renaming. |
| B/http/directory.ts:43,144 | The `x-opencode-directory` header is still accepted. | New. Keep as an alias or remove. |
| `packages/buddy/script/build-node.ts:7–11,31,39,67–69,101,117,121` | Build injects OpenCode version and channel, resolves its WASM assets, builds for the `node` condition (which selects OpenCode's no-op v1 importer, section 4.0) and applies the branding rewrite (section 3G). | New: build integration. |
| `packages/buddy/script/export-session-trace.ts:133,189` | Maintainer trace export reads a `session` table. A fresh v2 database has no such table (OC/database/schema.gen.ts:8–233 lists the tables). | New. Not a switch exporter; stale on a fresh database (inference, not run). |

### 3E. Names only

`B/http/opencode-event-stream.ts`, the `OpenCodeFile` alias (B/routes/compatibility.ts:11), OpenCode-named config modules (`B/config/opencode/*`, `B/config/runtime/opencode-*.ts`), the `OpenCodeSkill` type, the `OPEN_CODE_GPT_SYSTEM_PROMPT` name and a literal `${OPENCODE_TOOL_GUIDANCE}` in `B/learning/personas/prompts/code-system.p.md:7`, web theme identifiers, copied UI assets under `opencode/` folders, and three helpers with no callers (B/http/sdk-response.ts:57; B/learning/shared/parse-values.ts:65; B/learning/skill-management/service/paths.ts:8).

Why it matters: not for function. Two need care: the theme storage keys `opencode-theme-*` (W/theme/storage.ts:3–11) hold the user's theme choice and are kept by plan 2.11, and the prompt macro should be checked for its intended behaviour. Status: an unassigned cleanup order.

### 3F. The runtime's own identity, seen outside the code

OpenCode presents itself under its own name to the user, the model and remote services. None of this is behind a port. A switch removes it, and staying on OpenCode means overriding it at the adapter or in the build. Sources: the owner's decisions of 2026-10-22 evening; the HD, BR, BX, CS and EV work items. Every row was checked against the v2 branch as of 2026-10-22 evening.

Buddy now overrides two of these without a vendor edit: the provider headers, through a public hook, and the sign-in page and MCP registration, through a build-time rewrite (both in 3G). The owner kept the rest on purpose or has not decided.

| Who sees it | Where | What | Since | Now (2026-10-22) |
|---|---|---|---|---|
| User | OC/oauth/page.ts:28,103 (vendor source) | The shared sign-in callback page, used by ChatGPT, OpenAI, Poe, GitLab, DigitalOcean, Snowflake and MCP sign-ins, says "OpenCode is now connected to …" with an OpenCode title and wordmark. | v2; v1 had a Buddy page | Rewritten at build and load time (BR): "Buddy is now connected to …", title "· Buddy", the word "Buddy" as the wordmark. Checked in the built output, not yet in the running app (SE, section 5). Consent screens that providers host (OpenAI's Codex client, Poe, Copilot, xAI, DigitalOcean, Snowflake) still name OpenCode; accepted (BX). Separately, Buddy's desktop now comes to the front when a sign-in the user started succeeds (RA; W/lib/onboarding-flow.ts:222; DS/main/ipc.ts:557–564), instead of `main`'s `buddy://` redirect. |
| Every model provider | OC/session/model-request.ts:266–274 | Requests carry `x-opencode-session-id`, `x-opencode-parent-session-id`, `x-opencode-project`, `x-opencode-session` and `x-opencode-client`, and an `opencode/…/buddy` user agent. | v1 sent the user agent everywhere but the `x-opencode-*` headers only to OpenCode's providers; v2 sends the headers to all | Fixed as in v1 (HD): a Buddy hook removes every `x-opencode-*` header unless the provider ID starts with `opencode` (3G). It covers HTTP and the OpenAI WebSocket handshake. The user agent and the ChatGPT identity headers (`originator`, `chatgpt-account-id`, `session-id`) stay. Every request path Buddy uses must go through this filter. |
| OpenAI | OC/plugin/provider/chatgpt.ts:20,508; OC/plugin/provider/openai.ts:15,58,267 | ChatGPT sign-in presents the client to OpenAI under OpenCode's name; the owner kept this for the migration and parked the newer "Sign in with ChatGPT" method until its prerequisites are met. | v1 and v2 | Kept (owner). |
| Model | B/learning/personas/prompts/code-system.p.md:1; code-avatar.p.md:1 | Buddy's own Code persona prompt says "running in OpenCode" and calls Buddy "an avatar of OpenCode". | v1 (`main`'s prompt also said "You are OpenCode") | Kept (owner): the Code persona is dev-only and never ships (B/learning/personas/wiring/persona-availability.ts:16–34). |
| Model | OC/tool/plugin/opencode.ts:75–87; OC/plugin/plan.ts:15–68; OC/plugin/command/initialize.txt | The native `opencode` tool namespace and session tools, the plan reminder pointing at `~/.opencode/plan`, and `/init`'s `opencode.json` guidance. | mostly v2 | Unchanged; no decision. |
| Remote services | OC/mcp/oauth.ts:28,183–184,413,445; provider plugins (openrouter, vercel, cerebras and others); OC/tool/plugin/webfetch.ts:59; web-search plugins | MCP OAuth registration (`client_name`, `client_uri`), its probe's `clientInfo`, the hosted client-metadata (CIMD) document, referral headers, and fetch and search user agents name OpenCode. MCP connections themselves already name Buddy: the host passes its app name (`vendor/opencode/packages/server/src/routes.ts:133–140`; H:146,203), so the default at OC/mcp/client.ts:152 is not used. | v1 and v2 | MCP registration and probe rewritten to "Buddy", `https://hibuddy.in` and a `logo_uri` (BR; 3G). Remaining: MCP servers that use client-ID metadata documents fetch OpenCode's hosted `https://opencode.ai/oauth/opencode/client.json` (OC/mcp/oauth.ts:28,445); BR left it unchanged, and a fix needs a Buddy-hosted document (inference). Referral headers and fetch and search user agents: unchanged, no decision. |
| Shell programs and the model | OC/tool/plugin/shell.ts:210–213; OC/shell.ts:268–275 | Commands from the agent's shell tool get `AGENT=1`, `OPENCODE=1`, `OPENCODE_SESSION_ID`, and `AI_AGENT=opencode` unless `AI_AGENT` is already set. Every shell gets `TERM` and `OPENCODE_TERMINAL=1`. | v2 (v1 set none of them) | Kept (owner; EV). Upstream added the agent markers so programs can tell an agent is running and tie its commands to the session (anomalyco/opencode#51975). Some tools change output on them, such as Bun's test runner on `AGENT=1`. The variables send nothing by themselves. The only public seam, the shell `create.before` hook (OC/shell.ts:274), also runs for the user's own shell commands, and the tool sets `AGENT`, `OPENCODE` and `OPENCODE_SESSION_ID` after it (:275), so the hook cannot change those three. |
| User | provider catalog via G/provider.ts:42,84 | Settings show "OpenCode Zen", "OpenCode Go" and "OpenCode Console account". | Zen and Go v1; Console v2 | Kept (owner): these are the real names of OpenCode's services. |

### 3G. Buddy-owned workarounds tied to OpenCode (added 2026-10-22)

Each keeps a Buddy behaviour on OpenCode without a vendor edit. Each leans on OpenCode details that no port describes. A new runtime drops or replaces all three.

| Where | What it relies on | At switch time |
|---|---|---|
| Build-time rewrite: `packages/buddy/script/opencode-branding.ts` (table :31–98, check :100–115, Bun plugin :117–128). Wired into the Node build (`packages/buddy/script/build-node.ts:31,117`), which desktop ships, and the Bun source launcher (`packages/buddy/src/dev/start-with-safe-env.ts:15–16`; `src/dev/opencode-branding-preload.ts:1–4`). Test: `packages/buddy/test/opencode-branding.test.ts`. | Exact text of two vendored files, OC/oauth/page.ts and OC/mcp/oauth.ts. Each snippet must occur exactly once, or the build and the launcher throw (:105–111). No vendored file is edited. The conformance harness runs unbranded. | Drop the module and both wirings; the new runtime needs its own way to brand its sign-in pages. On OpenCode, an update that changes a snippet fails the build on purpose. The v1 chat import design proposes a second rewrite table in this module, for `v1-migration.bun.ts` (section 4.0; not built). |
| Live shell output: AD/shell-observer.ts:83–117 wraps the host (H:144). G/shell-output.ts:22–47 reads the file; G/stream.ts:36–39,49–55,69–83 polls and re-hydrates; history reads use it too (G/message.ts:528,544). SL. | OpenCode's public `shell.created` event, which carries the capture file path and the shell tool's session ID (`vendor/opencode/packages/schema/src/shell.ts:38–58`; OC/tool/plugin/shell.ts:206); the tool's progress update with `shellID` (:217); capture files under `<runtime data>/shell/` (OC/shell.ts:33–34,86). OpenCode's `shell.output` API cannot see shells started by the tool (SO), so the adapter reads the file: the last 16 KiB, every 500 ms, at most 32 shells (G/shell-output.ts:8–15; AD/shell-observer.ts:10). | A new adapter must fill `ToolState.shell.output` while a command runs and after a client reconnects (T/tools.test.ts:89). The observer holds associations for the current host only; events missed before it subscribed, or across a host restart, are not recovered (SL). |
| Provider headers: E/provider-headers.ts:3–8, registered for the runtime scope only (E/plugin.ts:26–27). Test: `packages/opencode-adapter/test/provider-headers.test.ts`. HD. | OpenCode's public `model.request` session hook, whose headers build the request (OC/session/model-request.ts:288–303), and the header names OpenCode adds (:266–274). | Goes with the adapter. Check what attribution headers the new runtime sends to third-party providers. |

## 4. User data at switch time

### Where the roots are

The planner honours `BUDDY_RUNTIME_ROOT`, Buddy data, cache and state overrides, XDG variables and a test home (B/runtime/runtime-paths.ts:89–176). Without overrides, on every platform, data is `~/.local/share/buddy`, so the database is `~/.local/share/buddy/opencode/opencode.db` (`packages/script/src/storage-env.ts:59–64`; B/runtime/runtime-paths.ts:77–85). A conformance check holds the database to that path (T/storage.test.ts:27). Packaged desktop builds use the same default (DS/main/storage-paths.ts:109–134). Unpackaged or dev builds move every root, including the global config directory, under Electron `userData` (DS/main/storage-paths.ts:46–71). OpenCode's config directory is Buddy's global config directory, `~/.buddy` by default (B/runtime/runtime-paths.ts:146–158; H:151).

Before any export, copy the database while Buddy is closed. Startup repairs the migration journal and OpenCode runs schema migrations on open (H:186–201). Inference: an export tool should read a copy, not the live file.

Export routes below: **port** (Buddy's view through `AgentRuntime`), **native API** (OpenCode's public HTTP API), **inventory** (files or database rows read directly).

### 4.0 Data still in v1 form (UP, 2026-10-22)

Current users run `main`, on OpenCode v1. Their upgrade to this branch is not finished, and a switch inherits what it leaves behind. Each row below was checked against the code.

| Item | State today | Effect on a switch |
|---|---|---|
| v1 chats | **Release blocker.** The desktop backend is a Node build (`conditions: ["node"]`, `packages/buddy/script/build-node.ts:101`). OpenCode maps `#v1-migration` to a no-op for Node (`vendor/opencode/packages/core/package.json:69–73`); the no-op reports "completed" and imports nothing (`src/database/v1-migration.noop.ts`). The v1 tables `session`, `message` and `part` stay in `opencode.db`, but v2 shows no old chats. Under Bun (`bun run dev`) the real importer runs. The fix is designed in [`v1-chat-import-design.md`](v1-chat-import-design.md): a backup, then OpenCode's own importer in the Node build. | Until it lands, an export must read the v1 tables as well as `session_v2`. After it lands, the v1 tables stay in place next to the imported chats, so an export must not count them twice (inference). |
| What the importer changes | It replaces prompt attachments that were file references with a placeholder line, gives parts new IDs, clears per-session rules and resets active revert and compaction state (`vendor/opencode/packages/core/src/database/v1-migration.bun.ts:323,485,621,1062–1064`; migration `20260910120000_clear_v1_session_permission.ts`). | Artifact origins that cite v1 part IDs may already be stale before any switch (inference, UP). |
| Provider credentials | Imported once by OpenCode's own migration, in the shape Buddy's ChatGPT service reads. | They then live in the runtime's credential store (4.4). |
| MCP sign-ins | Not imported from v1. | Users sign in to MCP servers again on upgrade, whatever the runtime. A separate item in the import design. |

No test yet runs a real `main` data set through desktop startup; the import design's proof adds one.

### 4.1 Chats and attachments (impact 1)

| Item | Where and format | Export |
|---|---|---|
| Sessions and messages | `opencode.db`: `session_v2` (`parent_id` as text; metadata, rules and revert as JSON columns, OC/session/sql.ts:22–52) and `session_message` (JSON `data`, OC/session/sql.ts:79). A database upgraded from v1 also holds the v1 tables `session`, `message` and `part` (4.0). | Port: `conversations.list` + `transcript`. It maps native `user`, `assistant`, `synthetic`, `skill`, `shell` and `compaction` records and drops the rest, such as system and idle records (G/message.ts:460–515) and leaves user agent and model empty (G/message.ts:493). Native API: `GET /api/experimental/session/:id/export` (OP/session.ts:259) is richer but skips queue, instruction and event tables. Inventory: full fidelity. |
| Prompt attachments | Base64 inside user message JSON. | Port gives `data:` URLs (G/message.ts:485). Native export keeps original fields. |
| Tool attachments | Image and PDF reads return inline base64 `data:` URIs (OC/tool/plugin/read.ts:175–184); other results may point to separate files. | Keep embedded bytes and copy file-backed ones (inference). |
| Queued input and instructions | `session_pending`, `session_inbox`, `instruction_entry/blob/state` (OC/session/sql.ts:100,125,147–167). | Native API lists durable inbox items and API-managed instructions (OP/session.ts:605–615,646–660); raw pending, blob and state rows need inventory. Keep pending user intent; do not resume live work elsewhere (inference). |
| Event journal | `event`, `event_sequence` (OC/database/schema.gen.ts:54–61). | Native API `GET /api/experimental/session/:sessionID/log` reads durable events after a sequence (OP/session.ts:724–739); exact table preservation needs inventory. Not live work. |
| Memory consolidation archives | `~/.buddy/learner-memory/consolidation-archives/<sessionID>.json`, the port transcript, written before the chat is deleted (B/learning/features/memory/consolidation.ts:347–349; paths.ts:6–16). No version field; no reader. Compaction summary and recent text are now kept (G/message.ts:512). | Files as they are. `main` writes no archive files; it leaves consolidated chats archived in the database (UP). Native-shaped archives exist only from pre-release v2 builds that wrote `session.export`, before the switch to the transcript. |

### 4.2 Notebook artifact links (impact 2)

| Item | Where and format | Export |
|---|---|---|
| Artifacts | `<notebook>/.buddy/objects/v1/<kind>/<id>/`; manifests store a tool origin `{sessionID, messageID, callID}` or a markdown origin `{sessionID, messageID, partID, segmentIndex}` (B/objects/manifest.ts:44–61). | Files. If IDs change, rewrite every origin together. |
| Mermaid and SVG repair records | Mermaid repair requests under the Mermaid kind index and per-object `state/auto-repair.json` (diagrams/service/store.ts:423,446); SVG ledgers at `<notebook>/.buddy/auto-repair/svg/v<n>/msg_buddy_svg_auto_repair_<sha256>.json` (svg-rendering/service/auto-repair.ts:32–39,143). | Files; keep names and prefixes (section 3A). |
| Lesson workspaces | `<notebook>/.buddy/teaching/<sessionID>/{workspace.json, files/, checkpoints/}` (B/learning/features/lesson-workspace/paths/path.ts:112–122). | Files, keyed by session ID. |
| Notes | Markdown library (default `<Buddy home>/Notes`, B/notes/paths.ts:6–11) with `buddy-session-id` frontmatter (B/notes/chat-capture.ts:204; note-file.ts:40). | Files. |
| Learner memory | `~/.buddy/learner-memory`: Markdown, evidence JSON, events, `jobs.sqlite` with stage-one jobs and outputs (stage-one-store.ts:198–228; tuning.ts:119–120), with session and message citations. `index.sqlite` is rebuildable. | Files and SQLite. |
| Notebook registry, projects, worktrees | `desktop-notebooks.json` (B/project/open-project-registry.ts:23); native `project`, `project_directory`, `workspace`, `worktree` tables (OC/database/schema.gen.ts:91–233); worktree files under the runtime data root. | Port: `workspace.projects` for display data. Inventory for the rest. Copy worktree files, including uncommitted work. |

### 4.3 Teaching and subagent lineage (impact 3)

| Item | Where and format | Export |
|---|---|---|
| Teaching snapshot | `session_v2.metadata.buddyTeaching`, version 1: owner and root session IDs, role, policy revision, teaching state, source rules and access (B/learning/agent-execution/state/teaching-session-metadata.ts:25–35). The policy revision is a SHA-256 over native-shaped rules (B/runtime/buddy-subagents.ts:82; teaching-session-metadata.ts:55–57). | Port: `conversations.get` or `transcript` (metadata); `approvals.sessionRules`. Hydration rejects a snapshot whose owner or root does not match (teaching-session-metadata.ts:126,139), so changed IDs must be rewritten together. |
| Subagent family | `session_v2.parent_id`; completion synthetic messages with child ID and state (OC/session/subagent-completion.ts:37–43). | Port: `conversations.children`, `history`. Settle running background jobs before the switch; do not promise continuation (inference). |
| Other Buddy metadata | `buddy.command` display (E/command-display.ts:41), prompt presentation, concise-response flags, archive time, fork title. | Port (metadata). Keep unknown keys. |

### 4.4 Credentials, MCP and config (impact 4)

| Item | Where and format | Export |
|---|---|---|
| Provider credentials | The runtime's credential store; on upgrade from v1, imported once (4.0). | No port exports credentials; plan on users signing in again rather than copying secrets. |
| MCP definitions and tokens | Definitions in `buddy.json[c]` `mcp`; tokens in the runtime's credential store, one entry per server. v1 MCP tokens are not imported (4.0). | Files for definitions; tokens as above. |
| Buddy config | `~/.buddy/buddy.jsonc` or `.json`, notebook `.buddy/buddy.json[c]` (B/config/store/config-paths.ts:31–41). Derived `<state>/opencode/buddy-host-config.json` (B/config/runtime/opencode-host-config.ts:12–14). | Files. Regenerate the derived file. |
| Native config | `opencode.json[c]`, `.opencode/`, `.claude/`, `.agents/` in `~/.buddy` and notebooks (OC/config/discovery.ts:11,41). The only home of references and project commands (section 3C). | Inventory and import. |
| Skills | `~/.buddy/skills/{.system, library, custom}` and withdrawn skills (B/learning/skill-management/service/paths.ts:23–35). | Files. Catalog through `catalog.skills`. |
| Plan documents | `.opencode/plans/*.md` in notebooks (B/learning/agent-factories.ts:42) and `~/.opencode/plan` from native plan mode (OC/plugin/plan.ts:14–16). | Files. |

### 4.5 Snapshots and full tool output (impact 5)

| Item | Where and format | Export |
|---|---|---|
| File snapshots for revert | Git repositories at `<runtime data>/snapshot/<projectID>/<worktree hash>` (OC/snapshot.ts:96); revert state in `session_v2.revert` (OC/session/sql.ts:51). | Native API `session.diff` gives patches, not the repository. Inventory to keep undo. |
| Truncated tool output | `<runtime data>/tool-output/tool_*`, kept 7 days (OC/tool-output.ts:14–16,55). | Inventory while present. |
| Shell output | `<runtime data>/shell/<project>/`, kept 7 days (OC/shell.ts:33–34,86). | Inventory. OpenCode's `shell.output` API cannot see shells started by the shell tool (SO); the adapter reads these files only while a command runs (3G). |
| Generated images | `<runtime data>/generated_images` (generated-image.ts:7,74). | Files. Keep provenance and the path authorization rule (generated-image-authorization.ts:72). |

### 4.6 Grants and drafts (impact 6)

| Item | Where and format | Export |
|---|---|---|
| Saved grants | `permission` table (project, action, resource; unique per triple), OC/permission/sql.ts:7–19. | Port: `approvals.saved(directory)`, in Buddy words. The key is OpenCode's project ID (section 2, Workspace), so a new identity means re-keying (inference). |
| Session rules | `session_v2.permission` JSON (OC/session/sql.ts:52). | Port: `approvals.sessionRules`. |
| Drafts and history | `buddy.prompt.dat` / `buddy.prompt.v1` (W/state/prompt-store.ts:58–59), keyed by directory and session. Drafts may hold reference parts in either spelling; storage is not rewritten on load. | UI store files or localStorage. Remap session IDs. |
| Model and chat state | `buddy.model-selection.dat` / `.v1` (W/state/model-selection-store.ts:15–16); `buddy.chat.dat` / `buddy.chat.v4` (W/state/chat-store.ts:117–118). | Same. Remap provider, model and session IDs. |
| Theme | `opencode-theme-*` localStorage keys (W/theme/storage.ts:3–11). | Keep the keys (plan 2.11). |

### 4.7 Plugin storage (impact 7)

| Item | Where and format | Export |
|---|---|---|
| Plugin key-value | `kv` table, namespaced `plugin:<encoded plugin ID>:` (OC/plugin/host.ts:602–603). | Inventory, or each plugin's own export. No Buddy product code uses it; most is likely cache (inference). |
| Native accounts | `account`, `account_state`, `control_account` (OC/database/schema.gen.ts:8–28). | Inventory if populated. No Buddy reader found. |

## 5. Open items

### Work this sheet tracked: all landed

Nothing from this list is still in flight.

| Item | State | Effect on this sheet |
|---|---|---|
| W29b | landed | The web picks error cards from `MessageError.code`/`anonymousCode`. Its own ladder and the `opencode` provider ID are gone, so a new adapter must fill `code` (TC/message.ts) for every error it reports. |
| W26c, W26d | landed | 3B's web row and the 3A chronology row are done. |
| F2, then SL | landed | F2's patch moves work. F2's live output read OpenCode's `shell.output` API, which cannot see shells started by the shell tool; SL replaced it with the shell observer. A new adapter must fill running `shell.output` (T/tools.test.ts:89; 3G). |
| 0.2 computer-use E2E | run, verified and retested after fixes | Its real failures are fixed. Its decoupling checks now also run without computer use: the conformance product checks (Appendix A) and the UI E2E layer (`packages/desktop-electron/e2e/`). |

### Landed or decided on 2026-10-22

| Item | Effect on this sheet |
|---|---|
| AF1, AF2 | Moved citations in sections 2–4. Plugin and runtime metadata writers share one lock (section 2, Conversations and hooks). |
| HD, BR, RA | 3F rows; new couplings in 3G. |
| EV, BX, CS (read-only) and the owner's branding decisions | 3F rows: `AI_AGENT`, the Code persona and Settings labels kept; ChatGPT method kept, switch parked. |
| UP (read-only) | Section 4.0. |
| Conformance product checks | 20 checks added to the suite (Appendix A). |

### New open items

- **Desktop v1 chat import (release blocker).** Designed in [`v1-chat-import-design.md`](v1-chat-import-design.md) (section 4.0). It would add a second rewrite table to the branding module (3G).
- **MCP sign-ins from v1** are not imported; users sign in again (section 4.0).
- **BR and RA in the running app.** Both are checked by unit tests and the built output only. SE, an automated sign-in E2E against a local OAuth MCP server, is in progress and has not landed. Computer use is deferred.
- **MCP servers that use client-ID metadata documents** still see OpenCode's hosted document (3F).
- **"Sign in with ChatGPT"** is parked until its prerequisites are met (3F).
- **Attribution headers.** Any new request path must apply the same attribution-header filter as chat requests (3F).

### Questions only the owner can answer (deferred)

The owner deferred these on 2026-10-22 because they concern a future switch, not current users. They stay here for that decision.

1. **What must a switch keep?** Historical rendering only; continued chats; file undo; or a lossless backup. Each needs a different export (section 4).
2. **IDs.** Keep OpenCode-shaped IDs end to end, or let Buddy allocate IDs and build one map across drafts, artifacts, teaching lineage, notes, memory and repair ledgers?
3. **Global compaction.** Make it a runtime-neutral input, with the native JSON written only inside the adapter?
4. **References and project commands.** Move them into Buddy config now, so they stop depending on `opencode.json`?
5. **Conformance harness.** Add a runtime-neutral seam now (scripted model, fixture config) so the suite can judge another runtime? The UI E2E layer already scripts the model through Buddy config (section 1, gap 6).
6. **Subagent contract.** Should the native `subagent` tool input become a Buddy contract (a port), or stay a known gap?
7. **Memory archives.** Add a version field and a reader for both old and new shapes? UP narrows this: `main` writes no archive files, so old shapes come only from v2-branch builds (4.1).
8. **Small exceptions.** Keep or remove `x-opencode-directory`, `originator: "opencode"`, `.opencode/plans`, and the `-dev` version rule for personas?
9. **`export-session-trace.ts`.** Update it for `session_v2`, or mark it historical?
10. **OpenCode's identity (3F).** Largely answered by the owner's decisions of 2026-10-22: provider headers fixed (HD), sign-in page and MCP registration branded at build time (BR), the Code persona, `AI_AGENT` and Settings labels kept, the legacy ChatGPT method kept. Still open: the CIMD document, the native `opencode` tool namespace and the plan and `/init` texts, referral headers, and fetch and search user agents.

Decided, not deferred: the adapter imports the vendor SDK's `package.json` by relative path to read OpenCode's version (H:6,21). The owner kept it (AR2): it works and is packaged, and changing it risks the packaged app. It leaves with `host.ts` at a switch.

## Appendix A. Conformance case index

59 tests in 19 files in `packages/buddy/test/conformance/`, 60 runs (X3 runs once for `queue` and once for `steer`); 60 pass on the v2 branch as of 2026-10-22 evening. The 39 port cases below have keys. The 20 product checks added on 2026-10-22 follow in a second table and are cited by file:line.

| Key | File:line | Test |
|---|---|---|
| C1 | conversations.test.ts:12 | created conversations retain metadata, expose their family, and removal deletes the family |
| C2 | conversations.test.ts:26 | history is chronological and cursor pages recover every message without overlap |
| C3 | conversations.test.ts:60 | fork copies history and an explicit boundary excludes that message and later turns |
| C4 | conversations.test.ts:75 | revert records the selected turn boundary and unrevert restores the full conversation |
| X1 | execution.test.ts:11 | async prompts acknowledge admission while busy and later finish with a complete assistant |
| X2 | execution.test.ts:29 | sync prompts wait for completion and return the final assistant message |
| X3 | execution.test.ts:46 | %s prompts admitted while busy are delivered and complete (`queue`, `steer`) |
| X4 | execution.test.ts:65 | abort returns a busy conversation to idle and allows a new prompt |
| X5 | execution.test.ts:81 | commands execute their expanded prompt and preserve the visible slash command |
| X6 | execution.test.ts:89 | no-reply prompts acknowledge the user input without starting a turn |
| V1 | events.test.ts:9 | SSE orders message and part snapshots before deltas and seals the assistant before idle |
| V2 | events.test.ts:28 | a client joining a busy turn receives hydrated message parts and terminal state |
| V3 | events.test.ts:45 | title changes and turn completion are visible to subscribers and survive a fresh read |
| A1 | approvals.test.ts:11 | a denied tool is hidden from the model's available tools |
| A2 | approvals.test.ts:21 | external access raises an approval and rejection feedback reaches the tool and assistant |
| A3 | approvals.test.ts:40 | always approvals are saved and a new conversation reuses them without asking again |
| F1 | forms.test.ts:10 | pending questions are listed after reconnect and answers reach the assistant |
| F2 | forms.test.ts:32 | cancelling a question after reconnect clears it and returns the conversation to idle |
| F3 | forms.test.ts:52 | invalid single-choice answers leave the request available for a corrected answer |
| K1 | catalog.test.ts:13 | listed personas are selectable and offer Buddy feature tools to the model |
| K2 | catalog.test.ts:39 | a configured agent can be listed and selected for a prompt |
| K3 | catalog.test.ts:48 | installed skills and executable commands are discoverable through Buddy catalogs |
| K4 | catalog.test.ts:58 | a notebook tool policy changes advertised tools without affecting another notebook |
| K5 | catalog.test.ts:69 | reloaded configuration changes the next prompt in an existing conversation |
| H1 | context.test.ts:13 | per-prompt system context reaches the model and stays scoped to its conversation |
| H2 | context.test.ts:23 | teaching context reaches the model and session teaching state survives compaction |
| H3 | context.test.ts:33 | the global auto-compaction setting changes compaction on a running conversation |
| S1 | subagents.test.ts:10 | a foreground child has its role before its first step and completes in the parent's tool part |
| S2 | subagents.test.ts:36 | a background child finishes independently and the parent receives its result |
| S3 | subagents.test.ts:57 | stopping a background child returns it to idle and tells the parent it was cancelled |
| P1 | providers.test.ts:12 | the model catalog exposes capabilities, selectable variants, and token limits |
| P2 | providers.test.ts:25 | saving and removing an API key changes provider connectivity without exposing the key |
| P3 | providers.test.ts:38 | OAuth attempts have distinct handles and cancellation prevents completion |
| M1 | mcp.test.ts:12 | saved server definitions are readable and reported as disabled until connected |
| M2 | mcp.test.ts:22 | a local server connects and disconnects without an external service |
| M3 | mcp.test.ts:31 | invalid server definitions are rejected without adding a server |
| Q1 | references.test.ts:12 | the reference catalog describes available notebook documentation |
| Q2 | references.test.ts:20 | current and legacy composer references expand to the same model input |
| Q3 | references.test.ts:37 | an unavailable composer reference returns a client error before admitting the prompt |

### Product checks added on 2026-10-22

They test Buddy behaviour through the HTTP API across several ports.

| File:line | Test | Bears on |
|---|---|---|
| live-history.test.ts:21 | every message and part a client builds from the live stream matches history | Events, Conversations |
| live-history.test.ts:52 | a client that loads history during a busy turn and then follows the stream ends with history | Events |
| live-history.test.ts:69 | a subagent's parent and child match their history | Subagents |
| tools.test.ts:38 | write reports the new file with its content and changes it on disk | normalized tool fields |
| tools.test.ts:48 | edit reports an update with its diff and line counts | normalized tool fields |
| tools.test.ts:60 | a patch reports added and moved files by kind and applies them on disk | normalized tool fields |
| tools.test.ts:73 | a single-file patch names its file | normalized tool fields |
| tools.test.ts:83 | a shell command reports its command and output | normalized tool fields |
| tools.test.ts:89 | a running shell command streams its output before it finishes and after reconnect | Events; live shell output (3G) |
| tools.test.ts:126 | file searches report their subject and match count | normalized tool fields |
| storage.test.ts:27 | conversations are stored in the database at Buddy's established path and nowhere else | data roots (section 4) |
| storage.test.ts:40 | conversations, tool results and subagent rows are unchanged after the runtime restarts | host lifecycle |
| storage.test.ts:67 | text still streaming when the runtime closes survives a restart | host lifecycle |
| storage.test.ts:89 | a reply cut off by a runtime restart is kept and the conversation keeps working | host lifecycle |
| notebooks.test.ts:59 | a notebook's default model is used without changing another notebook's default | notebook plan |
| notebooks.test.ts:74 | invalid notebook config reports an actionable error, isolates failure, and recovers when restored | notebook plan |
| config-patch.test.ts:5 | patching the model before the first session lets its first prompt finish | notebook plan |
| bench.test.ts:43 | Bench screenshots captured during a turn are removed after the turn finishes | Events (`signals`) |
| notes.test.ts:16 | a captured note follows a chat renamed through the API and keeps its content | Events (`signals`) |
| large-prompt.test.ts:9 | a 200 KB prompt appears once in history and the live client and completes on the same stream | Execution, Events |

The harness these cases run on is OpenCode-specific (section 1, gap 6). The scripted model is a native `aisdk` language hook (T/harness.ts:88–131; T/harness-config.ts:31–56), compaction and OAuth are native hooks (T/harness-config.ts:57–61), and commands and references come from `opencode.json` fixtures (T/harness.ts:154; T/harness-config.ts:123,130).
