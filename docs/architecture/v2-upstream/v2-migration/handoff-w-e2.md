# W-E1 → W-E2: native subagents

W-E1 implements the runtime lifecycle. OpenCode owns spawning, jobs, cancellation and notification admission. Buddy owns agent definitions, delegated session policy and the teaching capsule. No Buddy job registry, task substitute, prompt interception or vendor patch remains.

## Parent tool parts

Use the native tool name `subagent`. Inputs are `agent`, `description`, `prompt`, optional `background`, `sessionID` and `model`. `agent` is the runnable role ID; `description` is the stable task label. A continuation's input `sessionID` identifies the existing child, whereas a fresh launch has no input child ID.

OpenCode writes `state.metadata.sessionID` and `state.metadata.status`, including progress before child admission. Status is `running` or `completed`. Preserve progress metadata in an error part so the child remains openable after a failure. Buddy adds no worker generation ID or alternate child ID to these parts.

A completed tool with metadata `status: "running"` is a background launch, including a blocking call promoted through `session.background` on its owner. It does not mean that the worker completed. The original `input.background` may be absent on a promoted call. A blocking call's successful terminal tool result has metadata `status: "completed"`.

Tool identity is `(assistantMessageID, toolCallID)`. A child ID can be reused for later same-role runs and multiple calls can join one active run. Use transcript order, execution starts/terminals and current active children; do not permanently subtract a child ID after its first completion.

## Completion and events

The persisted terminal message is `type: "synthetic"` with metadata:

- `source: "subagent"`
- `childID`: native child session ID
- `agent`: upstream's display name, not a guaranteed canonical role ID
- `state`: `completed`, `error` or `cancelled`

Its description carries the delegated task label. Resolve the canonical role through the launch input or the child's `agent`. Upstream supplies the stable notification message ID and performs restart deduplication. Never synthesize a second Buddy completion.

**Runtime-verified correction to the earlier event research:** native live and recovered completion admission produces `session.inbox.enqueued` with `data.item.type === "synthetic"` and metadata in `data.item.payload.metadata`. `session.inbox.delivered` signals promotion into the transcript. The declaration of `session.synthetic` alone is insufficient for notification handling in this release. Reconcile the parent's messages and inbox on these events. W-E1's actual host tests exercise this path. Session log history is also not available by default unless event persistence is enabled; the tests use subscribe plus authoritative message/inbox reads to close reconnect races.

Background success/failure/cancellation wakes the parent through upstream admission. `session.execution.*` and `session.active()` remain authoritative for child activity. Resync session family, active sessions, transcripts/inbox and pending permissions on `server.connected`. A notice can precede tool success; earlier notices must not suppress a currently active continuation. Partial history needs reconciliation rather than an indefinite spinner or an invented run ID.

## Child session metadata

Buddy writes one versioned value at `session.metadata.buddyTeaching`, merging unrelated metadata:

```ts
{
  version: 1,
  ownerSessionID: string,
  rootSessionID: string,
  revision: string,
  roleID?: string,
  policyRevision?: string,
  teaching: {
    persona, currentSurface, teachingWorkspaceState,
    focusGoalIds, conciseResponses, baseConciseResponses
  },
  source: {
    rules: Array<{ permission, pattern, action }>,
    access: { tools, subagents, skills },
    enabledFeatureIDs,
    extraToolsByRole,
    denyToolsByRole
  }
}
```

The root's capsule is copied by native session creation. Only `ownerSessionID === child.id`, matching `roleID === child.agent` and a `policyRevision` denote completed child preparation. Buddy replaces child permissions before publishing that marker. `revision` fingerprints the published source; for a child it identifies its compiled policy source. `policyRevision` fingerprints the parent revision, role and resulting ordered rules. Child `source.rules` describes its own delegated policy so explicitly permitted nested work remains narrow.

These fields support runtime reconstruction, not UI status. Native session permissions enforce policy. Cache hydration verifies ownership, role and the actual root family and never recompiles root defaults. The capsule excludes transcripts, delivery digests, outbound history and mutable runtime objects. Unknown versions and malformed preparation fail before another child provider request. No pre-v1 capsule exists to migrate; old sessions without a capsule are prepared on an ordinary Buddy prompt.

Teaching state is captured at launch. Existing child teaching fields survive continuation. Parent edits do not fan out to running children; an explicit continuation refreshes policy from the parent's published source. New tentative state enters the cache from the first request hydration hook, after admission; successfully prepared durable state survives a later admission failure for retry.

## Objects, navigation and stop

Saved author objects retain child attribution. Native host tests save real decks/question sets and assert manifest `origin.sessionID === childID`; their feature payloads expose `createdBy.sessionID`. Refetch objects on worker completion, not background launch return. Keep attribution tied to the child across continuation and cancellation.

Open normalized child links through the existing owner-first Bench session flow. Load missing ancestors before choosing a root. Stop one worker through the existing Buddy route to `session.interrupt({ sessionID: childID })`. Detached work survives owner stop. Moving a blocking owner to background affects its eligible blocking jobs, not one selected child.

## Legacy normalization only at the gateway

Normalize persisted v1 `task`, `input.subagent_type`, `metadata.sessionId`, task-title suffixes and `<task_result>` content into the same presentation as canonical v2 `subagent`, `input.agent`, `metadata.sessionID` and structured completion metadata. Preserve historical raw records. A completed v1 task with a child ID does not imply background work. Keep `sessionId` only as a historical gateway compatibility alias; new runtime metadata uses `sessionID`.

The runtime test and complete inventory/verification are in `reports/w-e1-report.md`.
