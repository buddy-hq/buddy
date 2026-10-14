# Wave 2 part B independent review

Reviewed W-C2, W-F2, and the three specified orchestrator integration edits against baseline `a99d5c41a3`, the migration decisions/handoffs, the wave-1 review, and the vendored v2 client/protocol/schema/plugin contracts. Concurrent W-E1, W-T, and config/provider/auth fixes were excluded. SDK regeneration itself is deferred integration work; the consumer changes it requires are assessed below.

Validation: **34 focused Buddy tests, 22 focused adapter tests, and 1 web test passed** using package scripts/the repository's sandbox wrapper. Scoped oxlint passed. Additional sandboxed probes exercised session collection/creation against the real singleton host, repeated prompt admission against a real scripted host, a registered native skill, the actual streaming gateway with a running-tool snapshot, and MCP startup against a local HTTP fixture. No root lint/typecheck/test, SDK generation, browser verification, real accounts/user-state access, or source edits were performed. The only repository file written is this report.

The full `SessionRoutes` import was blocked during a probe by concurrent W-E forwarding edits. Collection/creation probes instead mounted the unchanged exported handlers in Hono with equivalent validation for the tested body fields. That unfinished import seam is excluded from findings.

Findings: **2 P1, 4 P2, 0 P3**.

### 1. [P1] Session creation can return or create sessions outside the authorized notebook

**Locations:** `packages/buddy/src/session/orchestration/core-actions.ts:52`, `packages/opencode-adapter/src/gateway/session.ts:71`, and `packages/transcript-contract/src/session.ts:45`.

**Failure scenario:** Only notebook A is allowed by the directory resolver. A caller supplies A's directory header and a known session ID from notebook B in `POST /session`. With `{id:B}`, the response returns B's existing session, including its title, directory, and metadata. With `{parentID:B}`, it creates a child in B and inherits B's metadata and permissions. Neither supplied identity receives the ownership check used by individual-session routes. Passing A as the native creation location does not constrain these operations.

**Evidence:** V2 creation first returns any recorded `input.id`, then chooses `parent.location` ahead of `input.location` and inherits parent metadata/permissions (`vendor/opencode/packages/core/src/session.ts:263`, `:268`, `:287`). In a real sandboxed host with `BUDDY_ALLOWED_DIRECTORY_ROOTS=A`, direct lookup of B through A returned 404. The creation handler returned HTTP 200 with B's existing record for `{id:B}` and HTTP 200 with a new child whose directory was B for `{parentID:B}`. Both responses contained B's fixture metadata. These probes used ordinary distinct non-Git directories; a project-ID collision is unnecessary.

**Suggested fix:** Authorize an existing supplied `id` and every supplied `parentID` against the requested notebook before native creation. Check the returned session's ownership as well, including the native existing-identity path. Reject an unauthorized parent before writing; filtering only the response would leave the unauthorized child created. Add regressions for both identity fields with only A allowed.

**Confidence:** CONFIRMED by exercising the exported creation/lookup handlers against a real v2 host and reading native creation semantics.

### 2. [P1] Header-scoped session listing exposes other notebooks that share the native global project ID

**Locations:** `packages/buddy/src/session/orchestration/core-actions.ts:64` and `packages/opencode-adapter/src/gateway/session.ts:54`.

**Failure scenario:** A and B are separate freshly initialized Git repositories without a root commit, remote, or cached project ID. V2 assigns both project ID `global`. A caller requests `GET /session` with an authorized directory header for A and omits the optional `directory` query parameter. The handler switches to native project-wide listing, which drops the directory filter. It returns B's sessions and their metadata even when B is outside the allowed roots and direct lookup correctly denies B. The same request with an explicit A directory query avoids this branch, so the usual web caller does not exercise the defect.

**Evidence:** A real sandboxed singleton host reported project IDs `["global","global"]`. With only A allowed, header-only collection listing returned HTTP 200 containing B's private fixture title, owning directory, and metadata; direct lookup of that same B session through A returned 404. `listSessions()` forwards `directory: undefined` whenever `project` is supplied and projects every returned record without the canonical ownership predicate. The new individual-session predicate at `packages/buddy/src/http/session.ts:44` correctly compares canonical project roots, but collection listing never calls it.

**Suggested fix:** Apply canonical notebook/project ownership checks to collection results, or use an appropriately contained directory query. Preserve legitimate same-project listing without treating a native project ID as authorization. Test distinct empty Git roots with a header-only request and paginate/filter before applying the requested result limit.

**Confidence:** CONFIRMED by running collection and lookup handlers against two real sandboxed Git roots.

### 3. [P2] Retrying a completed prompt with its message ID waits for a delivery event that will never recur

**Locations:** `packages/opencode-adapter/src/gateway/write.ts:92`, `packages/opencode-adapter/src/gateway/write.ts:103`, and `packages/opencode-adapter/src/gateway/execution.ts:83`.

**Failure scenario:** A synchronous prompt with caller-supplied `messageID`/native `id` completes, but the caller retries the request after losing its response. Native admission reconciles the existing delivered prompt instead of delivering it again. Buddy starts a new live observer and waits for `session.inbox.delivered` for that ID. The observer never marks it delivered, so it ignores every execution terminal event and the synchronous HTTP request remains pending until cancellation or disconnect. The same issue occurs when the original prompt has already been delivered but is still executing when the retry subscribes.

**Evidence:** Native prompt admission returns `admission.reconcile()` results without preparing another item (`vendor/opencode/packages/core/src/session/session.ts:149`). On a real scripted host, the first `promptSession(...,{id:"msg_repeat",text:"One prompt"})` succeeded. Repeating the identical request with a 500 ms abort signal returned 409 with wait reason `aborted`; native history still contained exactly one user message. The route has no equivalent built-in timeout. Existing execution tests cover fresh delivery, cancellation, and later turns, but never an already-delivered retry.

**Suggested fix:** Reconcile existing inbox/history/execution state around admission as well as subscribing to live events. Return the existing correlated completion for a finished retry and attach to the correct execution for an active retry, or reject unsupported duplicate synchronous requests promptly with an explicit conflict. Do not wait exclusively for a new delivery of an idempotently accepted ID.

**Confidence:** CONFIRMED by repeating actual gateway writes against a real native host.

### 4. [P2] Hydration suppresses all future progress updates for a running tool

**Locations:** `packages/opencode-adapter/src/gateway/event.ts:48` and `packages/opencode-adapter/src/gateway/event.ts:276`.

**Failure scenario:** Recovery fetches an assistant snapshot while its tool is running, for example when queued tool events have advanced upstream ahead of the gateway or the message cache is missing. Hydration adds every tool index to `covered`, regardless of whether its state is terminal. Every subsequent `session.tool.progress` for that running tool is dropped. The index is cleared only on success/failure, so the web never receives later progress metadata during the remaining call. Running titles, progress, and live child-session metadata can remain absent until the tool finishes. Hydration of a streaming tool can likewise suppress its transition to running.

**Evidence:** A controlled probe through the actual `subscribeBuddyEvents()` hydrated a running `read` tool with empty metadata, then supplied a later progress event with `{title:"Reading chapter 2",progress:0.5}`. The gateway emitted only the initial running part with empty metadata and no update containing the progress. Native progress is a separate ephemeral publication (`vendor/opencode/packages/core/src/session/runner/publish-llm-event.ts:562`); native message lookup reads persisted message state (`vendor/opencode/packages/core/src/session/session.ts:57`), so an earlier persisted running snapshot cannot already cover future progress. The added stream regression hydrates a completed tool and therefore misses this case (`packages/opencode-adapter/test/gateway-stream.test.ts:23`).

**Suggested fix:** Track coverage by tool lifecycle state. Preserve terminal snapshots against obsolete input/called events, while allowing a hydrated running tool to accept subsequent progress and a hydrated streaming tool to advance to running. Add a recovery regression that keeps the tool active and verifies progress before its terminal event.

**Confidence:** CONFIRMED by exercising the actual streaming gateway and checking native message/progress publication semantics.

### 5. [P2] Advertised skill slash commands are sent to a registry that cannot execute them

**Locations:** `packages/buddy/src/routes/compatibility.ts:592`, `packages/web/src/state/chat-actions.ts:1930`, and `packages/opencode-adapter/src/gateway/write.ts:125`.

**Failure scenario:** A notebook contains a skill whose ID is not also a registered command. `/command` advertises that ID with `source:"skill"`; the web offers it as a slash command and sends it through `session.command`. Buddy forwards the skill ID unchanged to native command execution. V2 searches only its command registry and raises `CommandNotFoundError`, so the advertised action fails with HTTP 500 instead of activating the skill and generating a reply. The source field never changes dispatch.

**Evidence:** A sandboxed native plugin registered `review-skill`. After activation, `skill.list` contained it and `command.list` did not. Calling the actual `commandSession` with that advertised name returned `{ok:false,error:{status:500,cause:{name:"CommandNotFoundError",command:"review-skill"}}}`. Native execution explicitly delegates to `Command.Service.execute()` with no skill fallback (`vendor/opencode/packages/core/src/session/command.ts:21`). The compatibility route test covers only a configured template command (`packages/buddy/test/compatibility-routes.test.ts:31`).

**Suggested fix:** Register executable native command callbacks for advertised skill IDs, admitting prompts with the corresponding `skills` attachment and arguments, or add explicit skill dispatch that preserves command display and completion correlation. Keep catalog entries and the write endpoint's executable namespace consistent. Cover selecting a skill-only slash entry end to end.

**Confidence:** CONFIRMED by listing and invoking a real registered skill through the gateway, and tracing web dispatch.

### 6. [P2] The web cannot display or settle MCP's newly exposed pending status

**Locations:** `packages/buddy/src/routes/mcp.ts:24`, `packages/web/src/components/mcp-dialog/mcp-config-schema.ts:72`, `packages/web/src/state/mcp-directory-query.ts:26`, and `packages/opencode-adapter/src/gateway/event.ts:89`.

**Failure scenario:** MCP Settings loads while a configured server's initial handshake is running. The migrated route legitimately returns `{status:"pending"}`. `getMcpStatusLabel()` has no pending entry, producing an empty status badge. The mounted status query has no polling, and the gateway drops native `mcp.status.changed` events, so the badge/state does not settle when startup finishes unless a separate refetch trigger occurs. Regenerating the SDK also expands `McpStatusInfo["status"]` to include `pending`, making the existing `satisfies Record<...,string>` and indexed lookup incomplete.

**Evidence:** A real native host with a local HTTP MCP fixture whose initialize response was held returned HTTP 200 `{slow:{status:"pending"}}` through the actual MCP routes. Releasing the handshake produced native `connected`. V2 intentionally forks initial connections (`vendor/opencode/packages/core/src/mcp/index.ts:550`) and publishes `mcp.status.changed` when status changes (`vendor/opencode/packages/schema/src/mcp-event.ts:24`). The gateway rejects non-session events before its session switch; MCP events are therefore not forwarded. Neither `mcpStatusQueryOptions()` nor the query-client defaults supply a refetch interval. Settings reads the unchanged query result and renders the missing label at `packages/web/src/components/settings/settings-mcps.tsx:342`.

**Suggested fix:** Add the pending label/state to the web consumer and refresh while any configured server is pending, or forward status-change events and invalidate the directory's MCP query. Verify the generated SDK union against all status consumers and test pending-to-connected/failed startup without a focus change or user mutation.

**Confidence:** CONFIRMED by a real route/native-host startup probe and tracing the status schema, gateway, and web query/render paths. SDK compilation was not run or generated during this review.

Verified correct seams:

- Fresh prompt writes subscribe before admission; execution observers ignore earlier turns/other sessions and handle batched steers, compaction-control delivery, cancellation, failure, interruption, and stream disconnect. Real-host command tests correlate identical concurrent commands with distinct admitted prompt IDs. Abort/tool execution coverage passed.
- `metadata.buddy.prompt` is consumed before the runtime context transform. Focused real-host tests cover compiled system context, ignored text, synthetic visibility/chip offsets, and envelope recovery after compaction. `metadata.buddy.command` preserves compact display in live/history while an ordinary template command sends its expanded text to the model.
- Wave-1 findings 2, 3, 5, and 6 have their requested fixes: covered terminal snapshots do not duplicate queued deltas or regress tool states; public sequence gaps remain valid; arbitrary native permission-denial feedback retains `errorType` through the web parser; malformed native message cursors return 400. Finding 4 above concerns additional running-tool behavior in the hydration fix. Fork titles and rename cleanup passed real-host coverage.
- Wave-1 finding 7 is fixed: a valid update of a nonexistent native project returns 404. Project `canonical`/`time.active` map to the existing Buddy worktree/initialized fields; reference responses retain the location/project envelope. Forced reference reload now runs after either notebook-sync branch.
- Native question forms retain single/multiple choice, label-to-value mapping, owner-qualified replies/rejection, and cross-notebook rejection. The form mapper is wired into the stream, filters global MCP elicitation, and preserves asked/replied/rejected event types. Pending forms survive `/global/dispose` refresh in real-host coverage.
- The local OAuth fixture completed native loopback/state-based authorization and credential deletion through the routes. Credential values are not returned by those endpoints; cancellation of removed attempts and unsupported pasted-code/client-registration responses passed. Browser invocation uses argument arrays on macOS and an environment-carried URL on Windows.
- Compatibility raw reads and notebook file reads reject traversal/external symlinks with canonical containment. Raw GET/HEAD and notebook symlink regressions passed on macOS; Windows execution was not exercised. Reviewed tests/probes use configured temporary homes, runtime/XDG roots, notebooks, and local fixtures.
