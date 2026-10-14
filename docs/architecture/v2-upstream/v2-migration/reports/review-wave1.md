# Wave 1 independent review

Reviewed the current wave-1 implementation against baseline `a99d5c41a3`, the handoffs, migration decisions, and the vendored v2 client/protocol/schema. Concurrent wave-2 changes were excluded; findings below concern wave-1 seams that remained defective at review time. In particular, native form/question migration is assigned to W-F2 in LOG.md and is not counted as a wave-1 finding. The current event gateway does not yet forward native form events, so that requested seam remains unverified pending W-F2 integration.

Validation: 37 focused Buddy tests and 15 focused adapter tests passed using the repository's sandbox wrapper. Additional sandboxed probes exercised the actual permission routes against a real v2 host, archive metadata, native error discriminators, the actual streaming gateway with controlled queued events/snapshots, and the web tool-state parser. No root lint/typecheck/test, browser verification, source edits, or real user-state access was performed.

Findings: **1 P1, 5 P2, 1 P3**.

### 1. [P1] Project-ID equality permits permission replies across notebook authorization boundaries

**Locations:** `packages/buddy/src/routes/permission.ts:60` and `packages/buddy/src/routes/permission.ts:109`.

**Failure scenario:** Two distinct notebooks A and B are newly initialized Git repositories with no remote, root commit, or cached project ID. V2 assigns both `projectID: "global"` (`vendor/opencode/packages/core/src/project.ts:349`). A request supplies an authorized directory header for A but a known session ID belonging to B. Both permission listing and the session-qualified reply branch accept it because they compare only project IDs. The directory resolver never authorizes B. The caller can read B's pending resources and approve a tool in B through A's route.

**Evidence:** A real host with two sandboxed empty Git repositories and a resolver allowing only A returned `projectA="global"`, `projectB="global"`, HTTP 200 with B's pending request for `GET /permission?sessionID=B`, and HTTP 200 for `POST /permission/<B-request>/reply?sessionID=B`; B's pending list then became empty. Ordinary non-Git directories received distinct IDs and correctly returned 404, which is why the existing single-notebook tests miss this case.

**Suggested fix:** Authorize the session's canonical owning location against the notebook boundary, independently of upstream project identity. Apply the same authorization when collecting descendant requests. Preserve the decision to use native project IDs; those IDs cannot serve as directory authorization.

**Confidence:** CONFIRMED by running actual routes against the real v2 host and reading native project discovery.

### 2. [P2] Hydration can append queued deltas to text already present in the hydrated snapshot

**Locations:** `packages/opencode-adapter/src/gateway/stream.ts:45`, `packages/opencode-adapter/src/gateway/stream.ts:53`, and `packages/opencode-adapter/src/gateway/event.ts:225`.

**Failure scenario:** Cache recovery fetches an assistant message while the SSE consumer has queued events. Upstream has already persisted the completed fragment `"Hello world"`, but the consumer has not processed its preceding `"Hello "` and `"world"` deltas. `translator.seed()` installs the completed text. `replayDelta()` suppresses only the event that triggered hydration; later queued deltas append unconditionally, yielding `"Hello worldHello world"` in the live projection. The queued terminal event eventually corrects it, but the UI renders duplicated content in the meantime. Recovery caused by a missing part, cache eviction, or finding 3 can reach this path.

**Evidence:** Running the actual `subscribeBuddyEvents()` with a queued started event followed by those two deltas and an authoritative `"Hello world"` snapshot produced `message.part.updated` with the snapshot followed by two `message.part.delta` events. Applying them yielded `"Hello worldHello world"`. The existing recovery test at `packages/opencode-adapter/test/gateway-stream.test.ts:23` supplies only one delta, so it never exercises the subsequent queued events.

**Suggested fix:** Track which fragment/terminal state the hydrated snapshot already covers and suppress obsolete queued fragment events until the stream catches up, or use an authoritative snapshot watermark/replay boundary. Checking only the triggering delta is insufficient. Cover multiple queued deltas and their terminal event in recovery tests.

**Confidence:** CONFIRMED by running the streaming gateway with controlled upstream snapshots and reading its mutation path.

### 3. [P2] Public-event sequence gaps are incorrectly treated as lost SSE events

**Location:** `packages/opencode-adapter/src/gateway/event.ts:105`.

**Failure scenario:** During title generation or compaction, v2 persists a private `session.usage.recorded` event between public durable events. The native bus increments the same aggregate sequence for every durable event, but its public feed deliberately omits private events. The next healthy public event therefore has a sequence greater than `previous + 1`. Buddy deletes the cached session messages and emits `session.resync`, causing unnecessary history reloads and entering the hydration race in finding 2 even though no public event was lost.

**Evidence:** `vendor/opencode/packages/core/src/bus.ts:371` assigns `latest + 1`; `vendor/opencode/packages/schema/src/session-event.ts:705` includes `UsageRecorded` and `MessageContentUpdated` in the durable inventory but excludes them from the public inventory. `vendor/opencode/packages/server/src/event-feed.ts:49` drops events outside that public inventory. Title usage is published at `vendor/opencode/packages/core/src/session/title.ts:59`. A gateway probe with public sequences 1 and 3 emitted `session.resync` as predicted.

**Suggested fix:** Do not require public sequence numbers to be contiguous. Keep monotonic duplicate rejection and reconnect recovery, and detect actual loss using the transport's disconnect/overflow behavior or a public-feed cursor with an explicit continuity guarantee. Include a legitimate private-event gap in tests.

**Confidence:** CONFIRMED by reading the native event inventories/publication path and running the gateway sequence probe.

### 4. [P2] Memory startup treats newly archived chats as eligible for extraction

**Location:** `packages/buddy/src/learning/features/memory/startup.ts:58`.

**Failure scenario:** A user archives a chat through Buddy, then opens another chat after the minimum idle interval with automatic learner-memory extraction enabled. The archive gateway writes `metadata["buddy.archivedAt"]` (`packages/opencode-adapter/src/gateway/session.ts:82`), while `listDirectorySessions()` returns native session records. Their `time.archived` remains undefined. The startup filter tests only that native timestamp, includes the archived chat, and attempts extraction from a chat the previous implementation excluded.

**Evidence:** On a real sandboxed host, `updateSession(..., {time:{archived:12345}})` produced native metadata `"buddy.archivedAt":12345` with no native `time.archived`. The baseline startup filter consumed the v1 archive timestamp; the new raw-session consumer no longer sees Buddy's projected archive state.

**Suggested fix:** Share the gateway's archive predicate/projection with memory startup, recognizing both legacy native `time.archived` and the Buddy metadata timestamp before selecting eligible sessions.

**Confidence:** CONFIRMED by running the archive write/read on a real v2 host and tracing startup selection against baseline.

### 5. [P2] The web tool parser drops the typed permission-denial signal

**Locations:** `packages/web/src/components/chat/tools/tool-permission.ts:6`, `packages/web/src/components/chat/tools/parse-tool-state.ts:55`, and `packages/web/src/components/chat/tools/types.ts:12`.

**Failure scenario:** A built-in tool fails with native `{type:"permission.rejected", message:"Try a different command"}` after denial with feedback. The current gateway preserves `state.errorType`, but `parseToolState()` copies only `error`; its returned `ToolState` type also lacks `errorType`. Consequently `isPermissionDenied()` returns false and shell/generic renderers display a failure instead of the denied treatment. The legacy English-prefix fallback does not match arbitrary feedback or native blocked-error messages. The new detector also accesses a property absent from its declared input type.

**Evidence:** Passing a projected shell part with `errorType:"permission.rejected"` and the above message through the actual parser returned a state without `errorType`; `isPermissionDenied(parsed)` returned false. Native mapping of `Permission.BlockedError` and `Permission.CorrectedError` is explicit at `vendor/opencode/packages/core/src/session/to-session-error.ts:61`. Concurrent work has already fixed the gateway and presentation resolver; this finding concerns the remaining web boundary.

**Suggested fix:** Add the optional discriminator to web `ToolState`, preserve it in `parseToolState()`, and test a native rejection message that does not contain the v1 prefix through parser and denial detection.

**Confidence:** CONFIRMED by running the actual web parser/detector and reading the native error mapping/renderers.

### 6. [P2] Invalid message cursors become server errors instead of client errors

**Location:** `packages/opencode-adapter/src/gateway/errors.ts:14`.

**Failure scenario:** A request lists messages for a valid authorized session with a malformed `before` cursor. Buddy accepts a string and forwards it to native message listing. V2 raises `InvalidCursorError`, but `sessionErrorStatus()` does not recognize that tag and returns 500. The route therefore reports a server failure for invalid web input, contrary to the native protocol's HTTP 400 contract.

**Evidence:** A real sandboxed host threw `{_tag:"InvalidCursorError", name:"InvalidCursorError"}` for an invalid cursor; passing the error to `sessionErrorStatus()` returned 500. The protocol explicitly declares status 400 at `vendor/opencode/packages/protocol/src/errors.ts:203`; forwarding occurs at `packages/buddy/src/session/orchestration/core-actions.ts:173`.

**Suggested fix:** Map the native `InvalidCursorError` discriminator to 400 and add a route/gateway test using a malformed cursor on an existing session.

**Confidence:** CONFIRMED by running native message listing and the actual error mapper.

### 7. [P3] Missing-project updates no longer return the intended 404

**Location:** `packages/buddy/src/project/orchestration/project-operations.ts:81`.

**Failure scenario:** Updating a deleted or stale project ID raises native `ProjectNotFoundError`. The migrated predicate recognizes `NotFoundError` and `Project.NotFoundError`, but not v2's actual `ProjectNotFoundError`. Its message-prefix fallback does not rescue the generated client error shape. `updateProjectFromPayload()` consequently reports HTTP 400 with `"Invalid project update"` rather than its intended not-found response.

**Evidence:** A real host update of a nonexistent project returned an error with `_tag` and `name` both `"ProjectNotFoundError"` and no exposed message satisfying the legacy prefix. The native protocol declares this error as 404 at `vendor/opencode/packages/protocol/src/errors.ts:121`; the operation chooses 404 versus 400 through this predicate.

**Suggested fix:** Use the adapter-exported native project-not-found predicate, or decode the v2 discriminator into a Buddy-owned error classifier, and cover a valid update body with a nonexistent project ID.

**Confidence:** CONFIRMED by observing the native host error and reading the operation's classification branch.

Verified correct seams:

- Production permission replies obtain the wrapped `getOpenCodeClient()` and call its permission reply method, preserving Buddy-tool reject-with-feedback. Buddy ask subscribes before creation and waits for connection; focused real-turn tests cover feedback, sibling rejection, and abort cleanup.
- Permission requests retain action, resources, save patterns, metadata, and provenance through the gateway. The dock consumes the native action/resource/save contract and forwards child-owner session IDs. Permission asked/replied events pass through the streaming gateway.
- `/event` combines host events with `subscribeGlobalEvent` from Buddy's event bus. Focused stream tests cover cancellation/unsubscription and queued delivery limits.
- History and live rendering use the Buddy presentation catalog and the same synthetic part-ID construction; focused gateway tests compare final live parts against history with mixed text/reasoning ordinals.
- Delegated permission construction and gateway action translation agree on `task`→`subagent`, `bash`→`shell`, edit aliases, and MCP resource aliases; focused tests preserve scoped restrictions and configured denies.
- Reviewed notebook-file and generated-image paths use canonical containment/provenance checks; the focused notebook tests reject external symlinks and cover Windows path handling. Reviewed host tests use configured temporary roots, and singleton lifecycle coverage checks shared startup and shutdown/replacement ordering.
