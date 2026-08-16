# Mermaid Auto-Repair Session Loop Incident - 2026-08-15

Date: 2026-08-15

Status: contained in source; production release pending verification

Severity: high — unbounded autonomous generation, repeated work after Stop, and
potentially unbounded model usage

## Summary

A production Buddy session entered an unbounded agent loop after an inline
Mermaid diagram failed to render. The learner stopped the session multiple
times, but the same visible diagram later triggered new automatic repair work
and made the session appear to restart by itself.

The incident required three defects to align:

1. Buddy submitted Mermaid repair jobs as synthetic user messages whose IDs
   were random strings beginning with `msg_buddy_mermaid_auto_repair_`.
2. The production OpenCode runtime inferred chronology and loop completion by
   lexicographically comparing message IDs. The synthetic repair ID sorted
   after normally generated assistant IDs, so completed assistant turns did
   not satisfy the loop exit condition.
3. Buddy's revisioned Mermaid object lookup compared the original Markdown
   source against the current repaired revision. After a successful repair,
   that comparison failed on a later component mount, so Buddy created a new
   backing object for the same visible Markdown segment and started another
   automatic repair.

The Mermaid parser was not looping. The first automatic repair succeeded and
the repaired revision rendered successfully. The runaway behavior occurred in
session orchestration and persisted-object identity after that success.

## User-Visible Impact

- The session continued generating after the Mermaid repair completed.
- Pressing Stop aborted the active generation but did not prevent the same
  visible diagram from submitting new repair work later.
- The UI displayed `Stopped` for an aborted run while a subsequent transcript
  remount could create a fresh automatic repair request.
- The learner could not reliably contain the incident from the task UI and had
  to quit Buddy.
- The transcript accumulated unrelated assistant continuation, tool calls, and
  generated content after the diagram had already been repaired.
- The session consumed approximately:
  - 174,626 input tokens;
  - 18,174 output tokens;
  - 1,767,936 cache-read tokens.
- The behavior created an unbounded cost and resource-consumption risk.

No evidence showed data deletion, credential exposure, provider retry storms,
or a network/gateway fault.

## Incident Identifiers

- Production session ID: `ses_ffd78b9c3ffedOuiZveZnD60Fu`
- Session title: `Quick check-in`
- Notebook: `CBT`
- Session directory: `/Users/prashantbhudwal/Documents/Buddy/CBT`
- Session created: 2026-08-15 04:36:54 IST
- Installed Buddy version: `0.0.62`
- Installed app: `/Applications/Buddy.app`
- Production database:
  `/Users/prashantbhudwal/.local/share/buddy/opencode/opencode.db`
- Production log: `/Users/prashantbhudwal/Library/Logs/Buddy/main.log`

The installed app bundle was timestamped approximately 2026-08-12 16:00 IST.
It contained the old message-ordering and loop-exit implementation.

## Evidence Sources

The diagnosis used:

- the live production OpenCode SQLite database;
- a chronological export of the affected session;
- the production Electron main-process log;
- the installed `app.asar` bundle extracted read-only;
- the current repository and Git history;
- the pre-June 19 artifact implementation;
- the post-June 19 object/revision implementation;
- the upstream OpenCode repository history.

Temporary analysis exports were written under `/tmp` and did not modify the
repository or production database. The production app was gracefully quit; no
database repair or destructive cleanup was performed.

## Confirmed Session Evidence

The captured session contained:

- 45 messages;
- 188 parts;
- 575 durable session events;
- three synthetic Mermaid auto-repair user messages;
- 21 assistant messages parented to Mermaid repair work.

The three repair-message IDs were:

```text
msg_buddy_mermaid_auto_repair_e515055d_e6cf_4466_9e44_89209376c52d
msg_buddy_mermaid_auto_repair_6ba19987_d2ac_41ce_9981_24462b50a52f
msg_buddy_mermaid_auto_repair_bf719e94_3877_4a5b_980f_6a3a60711e85
```

All 21 repair-associated assistant messages were parented to the first repair
message. Their outcomes were:

- 11 normal `stop` finishes;
- seven `tool-calls` finishes;
- three aborted messages without a normal finish.

The database recorded `MessageAbortedError` for each user Stop. This confirms
that Stop reached and cancelled the active generation; the later work was a new
submission rather than the original request surviving cancellation.

## Timeline

Times below are local to the incident machine.

| Time | Event |
| --- | --- |
| 04:36:54 | The `Quick check-in` production session was created. |
| 04:41:52 | The failed inline Mermaid render triggered the first automatic repair POST. |
| ~04:41:56 | The repair assistant called `render_mermaid` once with corrected source. The repaired revision rendered successfully. |
| 04:41:56 onward | The production runtime failed to recognize the completed repair turn and continued creating assistant messages. |
| 04:42:47 | The learner pressed Stop. The active assistant message was aborted. |
| 04:48:03 | The same visible Markdown diagram was materialized again. Buddy created a new backing object and submitted a second automatic repair. |
| 04:48:36 | The learner pressed Stop again. The active assistant message was aborted. |
| 04:49:20 | The same visible diagram was materialized again. Buddy created another backing object and submitted a third automatic repair. |
| ~04:49:44 | The third active generation was aborted. |
| 04:49:51 | Buddy was gracefully quit. The app called `/api/global/dispose`; the backend utility process exited with code 0. |
| Later on 2026-08-15 | Root causes were confirmed in the production database, logs, installed bundle, current source, and Git history. |
| Later on 2026-08-15 | Automatic Mermaid repair was disabled in commit `5a6fd32b24` and pushed to `origin/main`. |

## Initial Trigger

The assistant emitted Mermaid source containing a browser parse error. The
relevant label included nested quotation marks:

```text
A[Belief: "I'm inept/helpless"]
```

The browser renderer correctly rejected the source. Automatic repair then
submitted an internal prompt asking the active Buddy session to correct the
diagram and call `render_mermaid` exactly once.

The repair assistant removed the problematic quoting, preserved the diagram's
intent, called `render_mermaid` once, and produced a renderable revision. The
repair mechanism completed its diagram-specific responsibility successfully.

## End-to-End Failure Path

```text
One broken Markdown Mermaid segment
  -> frontend creates backing object O1, revision R1
  -> browser records a render failure
  -> frontend starts automatic repair request U1
  -> U1 is inserted into the interactive session as a synthetic user message
  -> assistant creates repaired revision R2 on O1
  -> R2 renders successfully
  -> runtime compares message IDs instead of causal relationships
  -> runtime does not recognize the completed assistant as answering U1
  -> runtime generates another assistant turn
  -> Stop aborts the current turn
  -> the transcript diagram component later remounts
  -> frontend submits the original immutable Markdown source again
  -> backend compares it with O1's current repaired revision R2
  -> source hashes differ, so O1 is rejected
  -> backend creates O2 containing the same original broken source
  -> O2 is eligible for a new automatic repair U2
  -> the session restarts
```

This explains both apparently contradictory observations:

- there was only one visible diagram; and
- production persisted multiple Mermaid objects and repair requests.

The additional objects were hidden backing records created over time for the
same transcript segment. They were not additional visible diagram cards.

## Root Cause 1: Message IDs Were Used as Chronology

Normal OpenCode message IDs are generated by `MessageID.ascending()`. They have
the following shape:

```text
msg_<encoded timestamp><random suffix>
```

For IDs produced only by that generator, lexicographic ordering happens to
match creation ordering. The production runtime relied on that property when
selecting the latest user and assistant messages.

The installed runtime effectively used:

```text
latest user      = lexicographically greatest user message ID
latest assistant = lexicographically greatest assistant message ID
```

It also exited the agent loop only when:

```text
lastUser.id < lastAssistant.id
```

That is an unsafe proxy for the actual relationship between messages.

## Root Cause 2: Buddy Violated the Message-ID Invariant

Mermaid repair created a random request ID with this prefix:

```text
msg_buddy_mermaid_auto_repair_
```

Buddy then reused that repair-request ID as the session user-message ID in
`packages/buddy/src/session/orchestration/interaction-actions.ts`.

Normal assistant IDs in the affected production bundle began with values such
as `msg_002...`. After the common `msg_` prefix, the runtime compared `b` with
`0`:

```text
msg_buddy... < msg_002... == false
```

Therefore, even when an assistant finished normally with `finish=stop`, the
loop did not consider it newer than the repair user message and did not exit.

The message schema only required the ID to begin with `msg`. It did not enforce
that externally supplied IDs were generated by the monotonic ID generator.
The repair ID therefore passed validation while violating the ordering
assumption.

The first repair UUID suffix began with `e`, while the subsequent repair UUID
suffixes began with `6` and `b`. The first repair ID consequently remained the
lexicographically greatest repair user message. This matches the database:
all 21 assistant messages were parented to the first repair request.

## Root Cause 3: Repaired Object Identity Depended on Mutable State

Before the June 19 object migration, Mermaid repair used immutable artifacts:

```text
artifact A: original broken source
artifact B: corrected source, supersedes artifact A
```

Artifact A retained the original source hash and recorded that repair produced
artifact B. When the Markdown segment remounted, the original source still
matched artifact A, whose persisted repair state prevented a second automatic
repair.

Commit `9418f5070b` moved Mermaid content to revisioned objects:

```text
object O, revision R1: original broken source
object O, revision R2: corrected source and current revision
```

The revision model is valid, but lookup retained source-hash semantics designed
for immutable artifacts. `findMarkdownMermaidObject` matched the stable
Markdown origin and then read only `manifest.currentRevisionID`. It rejected
the existing object when the current revision's source hash did not match the
incoming original Markdown source.

After repair:

```text
incoming source hash = hash(original broken Markdown)
current source hash  = hash(repaired revision)
```

Those hashes must differ. The lookup therefore made a successfully repaired
object undiscoverable from its own original transcript origin.

The backend then created a new object with:

- the same session ID;
- the same message ID;
- the same part ID;
- the same segment index;
- the same original broken source;
- a fresh `eligible` auto-repair state.

The two confirmed later backing objects were:

```text
01M0192YDEAJ1CVEE2J12CQCX4
01M01959DQAXB152A3Z6SE6PS1
```

## Why Stop Did Not Hold

Stop worked for the operation it was designed to perform: cancel the currently
running session generation. Logs and persisted message errors confirm that all
three aborts reached the backend.

Stop did not provide these additional guarantees:

- cancel future automatic work associated with the same rendered origin;
- mark the diagram origin as explicitly cancelled;
- suppress repair after a component remount;
- prevent an inline rendering effect from submitting a new session prompt.

The transcript component later ran its materialization effect again, created a
new backing object, and submitted a new automatic repair. The new prompt was
outside the lifetime of the already-aborted run.

The UI's `Stopped` state was accurate for the aborted generation but incomplete
for the overall system: it did not communicate or prevent later automatic
work.

## Frontend Lifecycle Contribution

`MarkdownMermaidSegment` creates or reads the inline object from a React effect.
Its per-repair guard is held in component memory. Remounting the component
reinitializes that guard.

The creation effect also depends on the resulting `objectID`. Setting the
object causes another inline-create request within the same mount. The backend
successfully deduplicated the two same-mount requests in this incident, so this
was not the cause of the cross-remount duplicate objects. It is nevertheless a
lifecycle defect and increases reliance on backend idempotency.

## Missing Circuit Breakers

No independent safety limit terminated this failure after the normal loop-exit
condition failed. Missing protections included:

- no maximum number of model turns for an automatic Mermaid repair;
- no maximum automatic-repair token or cost budget;
- no durable one-repair-per-Markdown-origin invariant;
- no server-side idempotency key spanning revisions and historical objects;
- no session gate preventing automatic repair while the session was busy;
- no cancellation tombstone after the user pressed Stop;
- no rule terminating the repair controller immediately after a replacement
  revision was stored;
- no visible indication that transcript rendering had submitted new automatic
  session work.

The interactive agent loop was allowed to continue indefinitely when its
message-ordering exit check failed.

## Test Gaps

Existing coverage verified:

- repeated creation of the same inline object before repair;
- concurrent creation requests for the same Markdown segment;
- a single automatic repair attempt per object ID;
- repair state and revision behavior within one object.

It did not verify:

1. create broken inline object;
2. repair that object in place;
3. remount the same original Markdown source;
4. return the same repaired object and current revision;
5. create no new repair request.

There was also no regression test for:

- a custom non-monotonic user-message ID;
- loop termination based on assistant `parentID`;
- user Stop followed by remount of the same auto-repair origin;
- reopening a persisted task containing a previously repaired diagram;
- maximum automatic repair turns, elapsed time, or usage.

## Historical Introduction and Exposure Window

### Upstream runtime history

- 2025-11-17: upstream commit `a1214fff2e` introduced the prompt-loop exit
  comparison based on message IDs.
- 2026-04-21: Buddy imported the unsafe loop behavior in vendor sync
  `d43f16c9b4`.
- 2026-05-14: upstream commit `94564f3588` selected latest messages by maximum
  lexicographic ID after compaction reordering.
- 2026-05-18: Buddy imported that behavior in `01b0e4928f`.
- 2026-08-07: upstream commit `db581e47a3` fixed the legacy loop to order by
  `time.created` and terminate when `lastAssistant.parentID === lastUser.id`.
- 2026-08-12 21:08 IST: Buddy imported the correction through OpenCode
  v1.18.16 in `9a21a66194`.

### Buddy Mermaid history

- 2026-05-05: `d5bf21eaaa` introduced random Mermaid repair-request IDs.
- 2026-05-05: `81276b3a61` added the automatic repair session route and queued
  the repair-request ID as a real session message ID. The infinite Mermaid
  loop became reachable at this point.
- 2026-06-19: `9418f5070b` migrated managed content to revisioned objects and
  introduced the repaired-object remount lookup failure. The complete
  stop-then-restart incident pattern became reachable at this point.

### Production release timing

The inspected Buddy `0.0.62` production bundle was built at approximately
16:00 IST on 2026-08-12. Buddy imported the upstream runtime correction at
21:08 IST, approximately five hours later.

The installed production bundle was inspected directly and contained the old
ID comparison. The conclusion does not rely only on commit timestamps.

The August 12 upstream fetch did not introduce the incident. It contains the
runtime fix, but the installed production application had been built before
that fetch was integrated.

## Attribution

This was a combined upstream and Buddy integration failure, but Buddy owns the
production incident.

Upstream contributed:

- a long-standing assumption that message ID lexical order represented time;
- a loop-exit condition based on ID ordering instead of message causality;
- an unbounded loop when that assumption failed.

Buddy contributed:

- custom message IDs that violated the upstream ordering invariant;
- reuse of a repair-job ID as a session message ID;
- automatic mutation of an interactive learner session from a rendering
  effect;
- repaired-object lookup based on the current mutable source hash;
- repair deduplication scoped to an object rather than stable Markdown origin;
- Stop semantics that cancelled the current run but did not suppress future
  automatic work;
- insufficient circuit breakers, observability, and regression coverage.

The newest upstream fetch fixes the runtime half. It does not fix Buddy's
object identity or remount behavior.

## What Was Not the Root Cause

- The learner did not create multiple copies of the diagram.
- The Mermaid renderer correctly reported invalid syntax.
- The first Mermaid repair did not fail; it rendered successfully.
- The model provider did not repeatedly retry a failed request.
- No gateway or network retry loop was observed.
- Stop was not ignored by the active request; aborts were persisted.
- Session compaction did not cause the loop.
- The August 12 upstream fetch did not introduce the loop.

## Adjacent Similar Risk: SVG and Chemistry Auto-Repair

The investigation found another renderer-driven repair path with the same
message-identity mistake.

Chemistry fences report selected render failures to the SVG auto-repair route.
That route creates a deterministic request ID with this shape:

```text
msg_buddy_svg_auto_repair_<sha256>
```

It then queues the repair request into the interactive session using:

```text
messageID = repairRequestID
```

Therefore, an SVG/chemistry repair running against the old production session
runtime could encounter the same message-ID ordering failure as Mermaid. This
incident did not contain an SVG/chemistry repair, and no SVG/chemistry loop was
observed. It is an adjacent code-path risk discovered during the incident
review.

SVG/chemistry does not appear to share Mermaid's repaired-object remount bug.
Its request ID is deterministically derived from stable origin data and source
hash, and the backend persists the request. Reporting the same chemistry fence
again returns the existing request instead of creating a new session prompt.
It is therefore better protected against repeated remount submission.

The current upstream runtime correction also prevents the specific infinite
loop once it is shipped: latest messages are selected by creation time and a
completed assistant is matched to its user through `parentID`. SVG/chemistry
does not require an emergency disablement for this exact failure if the
installed release is verified to contain that correction.

The design remains incorrect even after the runtime fix. A repair-job ID and a
session-message ID are different identities and must not be interchangeable.
The SVG/chemistry path must be included in the durable auto-repair redesign and
regression coverage.

The standards-runtime feature also uses the term `auto-repair`, but it repairs
interrupted local installation state and does not enqueue an LLM session
message. It is not part of this incident class.

## Immediate Containment

The production app was gracefully quit at 04:49:51 IST. Process inspection
confirmed that no Buddy backend or Electron process remained.

Automatic Mermaid repair was then disabled at the server boundary in:

```text
5a6fd32b24 fix(mermaid): Disable automatic repair
```

The commit was pushed to `origin/main` on 2026-08-15.

The containment behavior is:

- validate the repair target and failed render normally;
- return HTTP `503` before creating a Mermaid repair-request record;
- do not update the object's repair-attempt state;
- do not enqueue a synthetic session prompt;
- leave the manual diagram-fix path available.

The frontend may still call the automatic-repair endpoint for an eligible
persisted object. The backend rejects that call before any agent work is
created. This server-side boundary protects both new and previously persisted
eligible objects once the release is installed.

## Containment Verification

The focused route suite verified:

- a valid automatic-repair request returns HTTP `503`;
- no `lastLlmOutbound` session prompt is created;
- the Mermaid object's auto-repair state remains `eligible` with zero attempts;
- cross-session validation remains intact;
- malformed-ID validation remains intact;
- historical repair-status behavior remains intact.

Commands completed successfully:

```bash
bun test --preload ./test/preload.ts test/mermaid/repair-routes.test.ts
bun lint
bun typecheck
```

The focused suite passed five tests. Repository lint completed with only
pre-existing warnings, and the root typecheck passed.

## Current Risk

Containment is present on `origin/main`, but it is not effective on an installed
production app until a release containing `5a6fd32b24` is built, published, and
installed.

The affected production task should not be reopened in a build predating the
containment commit. Restoring that task can remount the same diagram and submit
another repair.

After containment ships:

- automatic Mermaid repair cannot enqueue agent work;
- the current upstream runtime fix prevents this specific ID-ordering loop;
- the underlying repaired-object identity bug remains and must be corrected
  before automatic repair is re-enabled.

## Durable Remediation

### Systemic direction: rethink renderer-driven auto-repair

This incident is not only a Mermaid implementation bug. Mermaid and
SVG/chemistry both allow a renderer failure to enqueue a hidden synthetic user
message into the learner's interactive session. The app should replace that
pattern with one shared, bounded repair-job contract.

Every renderer-driven automatic repair must provide:

- a stable source-origin identity;
- a repair-job ID that is never reused as a session-message ID;
- durable idempotency across remounts, restarts, revisions, and processes;
- explicit running, succeeded, exhausted, and cancelled states;
- maximum model-turn, tool-call, elapsed-time, token, and cost budgets;
- immediate settlement after a validated replacement is stored;
- durable suppression after the learner presses Stop;
- visible UI state when automatic work starts or stops;
- no continuation into ordinary learner conversation;
- an isolated internal execution context where possible.

Mermaid automatic repair must remain disabled while this contract is designed
and implemented. SVG/chemistry may remain enabled only after the installed
runtime correction is verified, but it must migrate to the shared contract
before the repair system is considered complete.

### P0: ship and verify containment

- Build and publish a release containing `5a6fd32b24`.
- Install the production artifact on macOS and Windows.
- Inspect the installed bundle, not only repository HEAD.
- Confirm the automatic-repair endpoint returns `503`.
- Confirm a broken inline Mermaid diagram creates no new session message.
- Keep automatic repair disabled until all P1 invariants and tests pass.

### P1: make Markdown Mermaid identity stable

Use this as the canonical identity:

```text
sessionID + messageID + partID + segmentIndex
```

Required changes:

- key creation serialization by stable Markdown origin rather than source hash;
- persist the original source hash separately from the current revision hash;
- find the object by stable origin first;
- when incoming source matches the original source, return the object's current
  repaired revision;
- never create a new object merely because repair changed the current source;
- do not persist or automatically repair a Mermaid segment while its assistant
  message is still streaming;
- handle actual message edits through an explicit generation/version mechanism
  rather than inferring identity from the current object revision.

### P1: separate repair-job and session-message identities

- Generate every session message ID with `MessageID.ascending()`.
- Store `repairRequestID` as repair metadata, never as `messageID`.
- Apply this separation to both Mermaid and SVG/chemistry repair routes.
- Validate caller-provided message IDs against the actual generator contract or
  remove caller control where it is unnecessary.
- Do not infer chronology from opaque identifiers.

### P1: isolate and bound automatic repair

The preferred architecture is a dedicated internal repair job rather than a
synthetic user message in the learner's interactive session.

The repair controller must enforce:

- one active request per stable Markdown origin;
- one successful replacement revision per request;
- immediate settlement after the replacement revision is stored;
- a strict maximum number of model turns and tool calls;
- elapsed-time, token, and cost limits;
- rejection while the origin is already running, succeeded, or cancelled;
- no continuation into ordinary learner conversation.

### P1: make Stop durable for automatic work

When the learner presses Stop:

- abort the active generation;
- cancel any running automatic repair records for the session;
- persist cancellation for the affected Markdown origin;
- suppress remount-triggered automatic work;
- require an explicit learner action to retry.

### P1: correct the frontend effect

- Remove the result `objectID` from the creation effect's triggering identity.
- Ensure one finalized source produces at most one materialization request per
  mount.
- Keep backend idempotency authoritative even after the duplicate frontend call
  is removed.
- Do not allow a pure rendering/remount path to enqueue unbounded session work.

### P2: add observability

- Display when automatic repair starts, succeeds, fails, or is cancelled.
- Distinguish `Stopped` from `automatic work scheduled` in session state.
- Log stable Markdown origin, object ID, revision ID, request ID, session
  message ID, and repair settlement together.
- Emit a high-severity diagnostic when an automatic job exceeds one expected
  repair lifecycle.
- Track automatic-repair turns and usage separately from learner turns.

## Required Regression Tests Before Re-Enabling

1. Broken inline source creates one object.
2. Repair in place creates a new revision on that object.
3. Remounting with the original Markdown returns the same object and repaired
   current revision.
4. Remounting creates no new repair request.
5. Concurrent mounts create exactly one object for the stable origin.
6. Reopening the application on a repaired diagram creates no new work.
7. Stop followed by remount creates no new work.
8. A custom or non-monotonic ID cannot affect latest-message selection.
9. A completed assistant turn exits based on `parentID`, independent of ID
   spelling.
10. Automatic repair cannot exceed its model-turn, tool-call, time, token, or
    cost limits.
11. A successful `render_mermaid` call settles the repair controller
    immediately.
12. Repeated requests across historical duplicate object IDs deduplicate by
    stable Markdown origin.
13. Re-reporting the same failed SVG/chemistry fence returns the existing
    repair job and creates no additional session prompt.
14. SVG/chemistry repair uses a generated session-message ID distinct from its
    deterministic repair-request ID.
15. Both Mermaid and SVG/chemistry repair terminate correctly regardless of
    repair-request ID spelling.

## Release Verification Checklist

- [ ] Release contains commit `5a6fd32b24`.
- [ ] Installed app bundle contains the `MERMAID_AUTO_REPAIR_ENABLED = false`
      guard.
- [ ] Installed runtime contains the upstream `time.created` latest-message
      ordering.
- [ ] Installed runtime exits a completed turn using assistant `parentID`.
- [ ] Valid automatic Mermaid repair POST returns `503`.
- [ ] No synthetic Mermaid user message is persisted after a failed render.
- [ ] SVG/chemistry repair uses distinct repair-request and session-message
      IDs.
- [ ] Re-reporting an SVG/chemistry render failure creates no duplicate prompt.
- [ ] Pressing Stop leaves the session idle.
- [ ] Restoring the affected task does not start generation.
- [ ] macOS verification passes.
- [ ] Windows verification passes.

## Safety Invariants

The durable corrections must preserve these invariants:

1. Rendering or remounting persisted transcript content cannot create
   unbounded agent work.
2. Stable origin determines artifact identity; mutable repaired content does
   not.
3. Job IDs, object IDs, revision IDs, and session message IDs are distinct
   types with distinct generators.
4. Session chronology comes from persisted creation time, not string ordering.
5. Turn completion comes from causal parentage, not string ordering.
6. Stop prevents automatic work from immediately recreating the operation the
   learner cancelled.
7. Every automatic agent workflow has independent turn, time, token, and cost
   circuit breakers.
8. A production release is verified from its installed bundle, not inferred
   from repository state.
9. All renderer-driven repair systems use one bounded lifecycle contract rather
   than feature-specific hidden session behavior.

## Relevant Code and Commits

Current code locations:

- `packages/web/src/components/markdown/markdown-mermaid-segment.tsx`
- `packages/web/src/components/media/renderers/mermaid/index.tsx`
- `packages/buddy/src/learning/features/diagrams/service/store.ts`
- `packages/buddy/src/learning/features/diagrams/service/types.ts`
- `packages/buddy/src/learning/features/svg-rendering/service/auto-repair.ts`
- `packages/buddy/src/learning/features/svg-rendering/tools/render-svg.ts`
- `packages/buddy/src/session/orchestration/interaction-actions.ts`
- `packages/buddy/test/mermaid/inline-objects.test.ts`
- `packages/buddy/test/mermaid/repair-routes.test.ts`
- `packages/buddy/test/svg-rendering/auto-repair-route.test.ts`
- `packages/web/src/components/media/renderers/chemistry/auto-repair.ts`
- `packages/web/src/components/markdown/markdown-chemistry-segment.tsx`
- `vendor/opencode/packages/opencode/src/session/message-v2.ts`
- `vendor/opencode/packages/opencode/src/session/prompt.ts`

Key commits:

- `a1214fff2e` — upstream agent-loop refactor introducing ID-based exit logic
- `d43f16c9b4` — Buddy vendor sync importing the unsafe exit logic
- `d5bf21eaaa` — Buddy persisted-artifact repair-request IDs
- `81276b3a61` — Buddy Mermaid automatic repair session route
- `94564f3588` — upstream latest-message selection by maximum ID
- `01b0e4928f` — Buddy vendor sync importing maximum-ID selection
- `9418f5070b` — Buddy managed-content migration to revisioned objects
- `db581e47a3` — upstream legacy-loop ordering and parentage correction
- `9a21a66194` — Buddy OpenCode v1.18.16 vendor sync containing the correction
- `5a6fd32b24` — emergency containment disabling automatic Mermaid repair
- `e7890953b3` — Buddy SVG rendering and auto-repair backend
- `31ef1682fa` — Buddy chemistry rendering and SVG repair reporting frontend

## Final Conclusion

One visible broken Mermaid diagram was enough to trigger this incident. Repair
succeeded, but mutable object identity made the same transcript segment appear
new after remount. Each new backing object could submit another synthetic
repair user message. The production runtime then treated that synthetic ID as
chronologically newer than every normal assistant response and failed to exit
its unbounded loop.

The incident was not caused by the latest upstream fetch. An older upstream
ordering assumption was exposed by Buddy's custom repair IDs, and Buddy's June
19 object migration added the repeated remount trigger. The upstream runtime
half is fixed in current source; Buddy's identity, cancellation, and safety
barriers remain open work.

Automatic Mermaid repair must remain disabled until the stable-origin,
message-identity, cancellation, circuit-breaker, and regression-test work is
complete and verified in an installed production build.
