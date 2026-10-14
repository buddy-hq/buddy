# Buddy subagents and teaching state on OpenCode v2

Research/design, 2026-10-08; target: vendored OpenCode v2.0.24. No runtime changes made.
All Buddy source/test citations below refer to **`a99d5c41a3`**, read with `git show a99d5c41a3:<path>`; v2 citations refer to the vendored release. Concurrent implementation changes are outside this audit.
**(inferred)** marks conclusions from source rather than an explicit contract/test. Proposed behavior is labeled “Design” or “Default”; proposals are not claims about shipped behavior.

The governing decisions are `docs/architecture/v2-upstream/v2-migration/STATUS.md:14-43` and `docs/architecture/v2-upstream/v2-migration/LOG.md:43-46`.
In particular, LOG line 46 **supersedes** the context-tool-deletion policy proposed at lines 44-45: session `permissions` carry per-chat and delegated policy; child prompt hooks replace inherited rules before execution.
This report reuses and checks the v2 citations in `docs/architecture/v2-upstream/v2-migration/v2-permissions-subagents-events.md:170-267`; its B.6 context-filtering suggestion predates that revised decision.
OpenCode continues to own spawning, execution, permissions, jobs, cancellation, and restart. Buddy owns roles, teaching state, policy compilation, transcript presentation, and Bench navigation.

## 1. What v1 actually does

### Entry points and role catalog

V1 implements forwarding at three layers, so replacing only the HTTP prompt path would lose behavior:

- Direct delegate prompts: `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:91-111` installs a `SessionPrompt` interceptor for `isPersonaDelegateId(agent)`.
- Task-created children: the same file `:114-169` transforms `task.execute`, wraps the child-ID metadata callback, then wraps `ctx.extra.promptOps.prompt` before the child prompt.
- Buddy message/command transforms also call the resolver: `packages/buddy/src/learning/prompt/message-prompt-pipeline.ts:124-155`; `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts:139-174`.
- The adapter owns these interception facilities, not a vendored source patch: `packages/opencode-adapter/src/session-prompt.ts:18-37,59-62`; `packages/opencode-adapter/src/registry.ts:27-48`. The missing seam is documented in `packages/buddy/src/opencode-runtime/UPSTREAM-HOOKS.md:5-25`.

Seven Buddy IDs plus native `general`/`explore` are recognized as persona delegates (`packages/buddy/src/learning/shared/teaching-vocabulary.ts:21-36`). Recognition is broader than actual availability or forwarding.
All three existing personas explicitly enable **question-set-author, flashcard-author, general** (`packages/buddy/src/learning/personas/buddy.ts:19-26`, `teaching-buddy.ts:19-26`, `code.ts:20-27`, in that same directory).
The forwarding resolver requires an entry in the selected persona's **definition** `runtime.subagents`; otherwise it returns nothing (`packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:358-364,559-562`). Thus “every registered subagent inherits Buddy state” is false.
Feature-derived delegate catalogs are a fallback when no explicit runtime list exists (`packages/buddy/src/learning/personas/wiring/persona-profiles.ts:70-93`). The memory consolidator is explicitly internal, `delegatable:false` (`packages/buddy/src/learning/features/memory/subagents/memory-consolidator.ts:6-12`).

### User-visible behaviors and invariants, with actual test coverage

Each row distinguishes a pinned behavior from an untested branch; a fixture setup alone is not evidence of an assertion.

| ID | Behavior / invariant in v1 | Implementation | Test that pins it, or coverage gap |
|---|---|---|---|
| V1 | A directly prompted question author receives default-persona common tools plus its own save tool, without flashcard-only or inactive teaching/memory tools. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:339-364,588-616`; `packages/buddy/src/learning/agent-execution/transforms/command-transform.ts:139-174`. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:219-274` asserts prepare/ingest/diagram/reflection/solve/question-save allowed, flashcard-save/debug/goal/memory-search disabled, persona and outbound trace retained. |
| V2 | Already having Buddy runtime permissions does not suppress direct role forwarding. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:564-574`; existing state takes precedence at `:339-349`. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:190-217` asserts ingest and flashcard-save for an already seeded session. |
| V3 | Child delegates inherit the caller's current effective tools, including session denies and latest user-message tool overrides, before adding role extras. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:280-295,317-337,595-616`. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:455-599` explicitly asserts parent websearch denial and role isolation. `:276-320` is weaker: it seeds websearch deny but never asserts it. |
| V4 | Author-owned extras can bypass the parent's normal authoring-tool exclusion, but are gated by project toggles, enabled features, platform constraints, and active teaching workspace. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:170-193,203-252,255-277`; explicit role deny keys subtract extras. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:738-868` asserts flashcard ingest/save and no question-save. `packages/buddy/test/learning/runtime-tool-registration.test.ts:546-644` pins primary-vs-author ownership; forwarding-specific toggle/workspace/force-allow branches lack direct assertions. |
| V5 | SDK/intercepted prompts and both ordinary/named task execution receive equivalent policy before child prompting. | `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:94-111,130-165`; runtime applies state/rules before `run` at `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:101-114`. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:322-386,455-599,601-736`. These assert persisted v1 `user.info.tools` or captured `promptOps` input; their mechanism should disappear. |
| V6 | A new forwarded child retains Buddy persona, workspace activation and focus goals; surface is recomputed from persona/workspace, concise preference comes from config. Existing child teaching state wins and is not overwritten. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:339-349,521-548,639-649`; `packages/buddy/src/learning/shared/targeting.ts:120-129`; runtime `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:35-37`. | Persona seeding is asserted at `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:266-273,383-385,596-598`. No direct forwarding tests pin goal copying, workspace/surface, concise config, or existing-state preservation. |
| V7 | Seeding copies only the small teaching-state subset; parent delivery digests, outbound history, and runtime snapshot are not copied. State is scoped by canonical directory and child ID, with an evictable 512-entry process-local cache. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:527-547`; `packages/buddy/src/learning/shared/teaching-session-state.ts:17-37`; `packages/buddy/src/learning/agent-execution/state/session-state.ts:5-55`. | No direct subagent cache/eviction/restart test. Restart persistence is not a v1 invariant; the Map cannot supply it **(inferred)**. |
| V8 | Managed tool permissions are replaced; unrelated child rules survive; task/skill resource patterns come from the parent instead of being flattened. Later runtime sync preserves a delegated child profile when no explicit runtime snapshot is supplied. | `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:431-519`; `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts:45-59,81-105`. | `packages/buddy/test/learning/runtime-session-permissions.test.ts:6-31` pins delegated preservation; `:33-63` pins root rebuild. Pattern/nonmanaged-rule preservation is not directly asserted in forwarding tests. |
| V9 | Internal standalone consolidation keeps its explicit tools and path-scoped permissions and does not acquire persona learning tools. | Interceptor role check plus resolver eligibility: `packages/buddy/src/opencode-runtime/subagent-forwarding.ts:94-98`; `packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:358-364,564-574`. | `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:388-453`; internal/nondelegatable status at `packages/buddy/test/learning/experimental-feature-gating.test.ts:143-163`. The standalone early-return branch is not necessarily reached by this test because the consolidator is absent from the persona list. |
| V10 | Newly seeded in-memory state is rolled back if the wrapped prompt fails; prior state survives. Permission replacement is not rolled back by this wrapper. | `packages/buddy/src/opencode-runtime/subagent-tool-forwarding-runtime.ts:114-125`; `packages/buddy/src/learning/agent-execution/state/transform-state.ts:44-55`. | No failure/rollback assertion in `packages/buddy/test/learning/subagent-tool-forwarding.test.ts:189-869`. Its `cancelCalls>0` at `:590` proves a task cleanup callback ran, not user-cancellation behavior. |
| V11 | Role prompts, permissions and authoring tools become directory-scoped OpenCode agents; config overrides can customize them without leaking between notebooks. | `packages/buddy/src/learning/runtime-subagents.ts:12-69,94-97`; `packages/buddy/src/config/opencode/agents.ts:17-42,105-127`; persona spawn patterns at `packages/buddy/src/learning/agent-factories.ts:46-55,144-168`. | `packages/buddy/test/config/opencode-overlay-isolation.test.ts:67-140`; author registrations at `packages/buddy/test/learning/runtime-tool-registration.test.ts:616-644`; dynamic-tool default deny at `:531-544`. |
| V12 | Parent cards keep the task label through startup/live activity, hide generic child result dumps, and open the recorded child ID. | `packages/web/src/components/chat/tools/render/task/task-card-header.tsx:17-99`; `task-tool-card.tsx:10-22` in that directory. Child ID is **`state.metadata.sessionId`** at header `:35`. | `packages/web/test/subagent-card.test.tsx:34-57,59-81,83-118` pins all three. |
| V13 | Flashcard/question cards load saved objects produced by that child and offer Review/Open; generic output parsing recognizes `<task_result>`. | `packages/web/src/components/chat/tools/render/task/flashcard-author-task-card.tsx:99-123,137-189`; `question-set-author-task-card.tsx:76-100,110-160`; `task-utils.ts:3-15`, all in the same directory. | No dedicated author-task-card attribution test found. Generic output suppression is pinned by `packages/web/test/subagent-card.test.tsx:59-81`; unrelated flashcard-review tests do not pin this behavior. |
| V14 | Opening a subagent selects its root owner if necessary and opens a parallel session Bench tab, preserving the owner's main transcript. | `packages/web/src/lib/subagent-bench-target.ts:19-58`; `packages/web/src/lib/use-open-subagent-bench.ts:8-23`; `packages/web/src/components/directory-chat/directory-workspace-root.tsx:827-859`; `packages/web/src/components/bench/surfaces/session-bench-surface.tsx:33-59,94-108`. | `packages/web/test/subagent-bench-target.test.ts:12-35,37-76` pins root/grandchild traversal, cycle handling, owner-before-open, and selection failure. The complete Bench render is not pinned there. |

Two legacy implementation details should not become compatibility requirements:

- V1 flattens allowed ordinary tools to `allow` (`packages/buddy/src/learning/agent-execution/transforms/subagent-tool-forwarding.ts:451-461`), potentially weakening path-level `ask`/deny rules **(inferred)**. V2 must preserve ordered resource rules and ask effects.
- `goal-writer` declares `kind:"build"` (`packages/buddy/src/learning/features/curriculum-planning/subagents/goal-writer.ts:4-17`). Registration calls `createBuildAgent` without `mode`, whose fallback is primary (`packages/buddy/src/learning/runtime-subagents.ts:54-68`; `packages/buddy/src/learning/agent-factories.ts:131-141,172-182`). It therefore becomes primary despite being in the subagent manifest **(inferred)**; v2 rejects primary agents in `subagent` calls.

## 2. V2 runtime design

### Register roles through the agent transform

Design: add `registerBuddyAgents(ctx, directoryConfig)` using `await ctx.agent.transform(editor => ...)`, with `editor.update(roleID, agent => ...)` for creation and updates.
There is no `editor.add` for agents: `vendor/opencode/packages/plugin/src/promise/agent.ts:6-16`; `vendor/opencode/packages/core/src/agent.ts:74-84` shows `update` creating missing IDs.
Buddy imports this API/schema only through `@buddy/opencode-adapter/plugin`, respecting `docs/architecture/v2-upstream/v2-migration/STATUS.md:30-40`.

Set each Buddy role's stable `id`, display `name`, `description`, **`mode:"subagent"`**, `system` from its authored `prompt`, translated ordered `permissions`, optional configured `model`, and request settings/steps from supported config.
`Agent.Info` has `system`, not `prompt`, and plural `permissions` (`vendor/opencode/packages/schema/src/agent.ts:23-35`). Persona agents remain primary. Configure the default persona through `editor.default`.
Keep the model unset unless configured: new-child precedence is input override → role model → parent model; same-role continuation retains its selected model unless overridden (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:168-192`).
Use canonical agent IDs in spawn rules and inputs; preserve Buddy's configured display-name resolution in the Buddy entry layer (`packages/buddy/src/config/opencode/agents.ts:185-197`), rather than assuming v2 resolves labels.

| Role | V2 role definition / exposure | V1 authoring source |
|---|---|---|
| `assessment-agent` | Assessment system; question and learner-memory capability rules; no child spawning. Preserve current persona availability. | `packages/buddy/src/learning/features/assessment/subagents/assessment.ts:4-15` |
| `practice-agent` | Practice system; question and learner-memory rules; no child spawning. Preserve current persona availability. | `packages/buddy/src/learning/features/practice/subagents/practice.ts:4-15` |
| `goal-writer` | Subagent mode, goal tools and explicit filesystem restrictions; discard the accidental primary classification. | `packages/buddy/src/learning/features/curriculum-planning/subagents/goal-writer.ts:4-40` |
| `curriculum-orchestrator` | Routing system; nested role patterns only when explicitly enabled with an adequate upstream depth setting. | `packages/buddy/src/learning/features/curriculum/subagents/orchestrator.ts:4-19`; `orchestrator.md:23-24` in that directory |
| `question-set-author` | Question-author system; own `save_question_set` extra, common persona tools subject to delegated policy. | `packages/buddy/src/learning/features/question-sets/subagents/question-set-author.ts:5-17` |
| `flashcard-author` | Flashcard system; own `ingest_full_text` and `save_flashcard_deck` extras; delegate scope/resource paths through prompt text. | `packages/buddy/src/learning/features/flashcards/subagents/flashcard-author.ts:6-19`; `packages/buddy/src/config/opencode/overlay-builder.ts:35-47` |
| `learner-memory-consolidator` | Internal subagent-mode agent, hidden from advertised delegates and denied by persona spawn policy; standalone service sessions retain explicit envelopes. | `packages/buddy/src/learning/features/memory/subagents/memory-consolidator.ts:6-29`; `packages/buddy/test/learning/experimental-feature-gating.test.ts:143-163` |
| Native `general` / `explore` | Retain v2 roles and system/model defaults; apply Buddy delegation only when explicitly enabled. Do not overwrite Explore's restrictions with parent-wide allows. | `vendor/opencode/packages/core/src/plugin/agent.ts:88-124`; Buddy recognition at `packages/buddy/src/learning/shared/teaching-vocabulary.ts:32-36` |

Design: registration is directory-scoped and reloadable. Replace Buddy-owned fields deterministically rather than repeatedly appending permissions on reload; config layering uses the existing Buddy merge semantics.
Enabling a feature does not automatically expose every manifest role: keep the explicit persona delegate lists and internal consolidator distinction. This preserves V11/V9 and avoids silently expanding the product's delegation surface.

### Spawn and continue with the native tool

Design: use the shipped **`subagent`** tool; do not register a Buddy `task` substitute or implement a Buddy job runner.
Input is `{agent, description, prompt, model?, sessionID?, background?}`; output metadata is `{sessionID, status:"completed"|"running"}` (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:29-54,258-265`).
The tool asserts the parent's `subagent` permission against the target role ID, rejects primary/unknown agents, and checks that a continued child belongs to the caller (`:134-166`). New children have fresh conversation context (`:55-61,203-213`).
Keep role system instructions in `Agent.system`; put the task, relevant conversation excerpts, resource identifiers and prepared full-text paths in `input.prompt`. Teaching-state inheritance does not inherit transcript messages.
Update `/flashcard` and curriculum prompts from `task` to `subagent`; preserve full-text ingestion instructions from `packages/buddy/src/config/opencode/overlay-builder.ts:43-47`.

- **Blocking default:** omit `background`; upstream waits and returns the final completed non-error assistant text (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:234-255`; `vendor/opencode/packages/core/src/session/subagent-job.ts:44-52`). Preserve the existing synchronous authoring path.
- **Background:** explicitly set `background:true` for independent work. New-child prompt admission has `resume:false`, then upstream starts/backgrounds its Job and returns `status:"running"` (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:203-232`). Follow upstream's no-poll/no-duplicate-work instructions at `:19-26`.
- **Continue:** pass the existing child `sessionID`; upstream prompts outside `Job.start`, so running same-role children receive steering even when job registration joins an existing run (`:203-218`; `vendor/opencode/packages/core/src/job.ts:261-264`). Default for Buddy-owned children: continue the same role; start a fresh child for a different specialist. Native v2 can switch a continued child's role (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:169-182`); that product option is called out in §5.

### Choose the child prompt hook as the authoritative seeding point

Design: `registerBuddySubagentHooks(ctx)` registers **`ctx.session.hook("prompt", seedBuddySubagentPrompt)`**. It uses `await ctx.session.get({sessionID:event.sessionID})` and `child.parentID` to identify delegation, then reads the inherited Buddy metadata capsule.
The prompt event contains no agent or parent field (`vendor/opencode/packages/plugin/src/promise/session.ts:14-20`); get the child's current `agent` from the session. `event.metadata` is **message** metadata, not durable session metadata (`vendor/opencode/packages/core/src/session/prompt.ts:40-51,77-86`).
The inherited capsule is a persistence/transport mechanism; the prompt hook remains the one initialization authority. A `tool.execute.before` preflight verifies the parent has a usable capsule and validates continuations; it does not seed an unknown child ID or rewrite spawn prompt text to carry hidden state.

Design: add a versioned **`session.metadata.buddyTeaching`** capsule, merged with unrelated session metadata. It holds:

- `version`, `ownerSessionID`, `rootSessionID`, and the policy/source revision; only `ownerSessionID === child.id` denotes that child's completed initialization.
- Minimal teaching state: persona, workspace state, focus-goal IDs, resolved surface and concise/base-concise preferences. For the initial child, preserve V6's surface recomputation and config-derived concise behavior.
- A self-contained delegation source snapshot: effective parent rules and the Buddy feature/tool/role grant inputs needed to compile extras; no copied transcript, delivery digests, outbound trace, or mutable `sessionRuntime` object.
- For an initialized child, the role ID and policy revision used to derive its delegated permissions. Session `permissions` remain the authoritative enforceable rules; metadata does not replace the permission engine.

Design: the root prompt/config-policy path publishes teaching state plus the delegation source in **one metadata value** before launching work. Parent policy writers share the same Buddy update helper and per-session serialization, with the permissions work package owning compilation.
This makes the inherited capsule an internally consistent source snapshot even if a parent's metadata and session-rule events are observed separately. Read the child's copied capsule, not the parent's latest in-memory state, for initial seeding; use `parentID` to validate lineage and recover missing legacy metadata.
An initialized child's teaching state remains its own. On an explicit continuation, recompute policy from the parent's current published source and the selected role, preserving existing child teaching fields. Merely changing the parent later does not rewrite already-running children.
These snapshot/continuation semantics preserve V3/V6/V8 while removing dependence on v1 latest-user `tools` **(inferred)**; product alternatives appear in §5.

Design: under a per-child mutation lock, the prompt hook performs this sequence:

1. Load child/parent identity and the valid inherited or already-owned capsule; skip non-Buddy and explicit internal standalone sessions. An explicitly prompted public delegate without `parentID` uses its existing Buddy state or configured default persona, preserving V1/V2.
2. Compute a fresh `TeachingSessionState` projection and `buildBuddyDelegatedSessionPermissions(...)` from the source snapshot, target role, and current configured constraints. Copy arrays; do not share cache objects with the parent.
3. **Await** `ctx.session.update({sessionID:child.id, permissions:delegatedRules})`; this replaces, rather than appends to, the inherited parent rules.
4. Persist the child-owned capsule with `ctx.session.update({sessionID:child.id, metadata:mergedMetadata})`, then populate the in-memory teaching cache. Publish the ready ownership/revision only after permission replacement succeeds.
5. Return; OpenCode finishes prompt preparation, admits the prompt and wakes execution (or lets the background Job wake it). No model request starts as a consequence of this new prompt before the hook returns.

Ordering evidence: `vendor/opencode/packages/core/src/session/session.ts:145-175` calls `SessionPrompt.prepare` before admission/wake; preparation awaits the hook at `vendor/opencode/packages/core/src/session/prompt.ts:38-51`.
`ctx.session.update` dispatches metadata and permissions separately (`vendor/opencode/packages/core/src/plugin/host.ts:553-560`); it is not an atomic combined update. The explicit sequence above avoids a misleading ready marker **(inferred)**.
Design: metadata/cache initialization is idempotent by owner/role/revision. On admission failure, discard tentative cache state; durable, successfully prepared identity/policy may remain for retry. Do not undo it after a child has run, failed, or been cancelled. This replaces V10's wrapper-wide rollback with admission-aware semantics.

### Races and hook limits

| Hazard | Evidence | Design response |
|---|---|---|
| Creation event arrives after first prompt starts. | `vendor/opencode/packages/core/src/tool/plugin/subagent.ts:185-218`; asynchronous subscription seam in `docs/architecture/v2-upstream/v2-migration/v2-permissions-subagents-events.md:222-237`. | Never seed in `session.created` subscribers. Await the child prompt hook. Events maintain UI inventory only. |
| Tool-after is too late, and background “completed” means the tool returned, not the child ended. | `vendor/opencode/packages/plugin/src/promise/tool.ts:47-63`; `vendor/opencode/packages/core/src/tool/plugin/subagent.ts:229-265`. | No post-tool state/permission initialization. Read result metadata for display only. |
| Copied parent allows override restrictive child-agent rules. | `vendor/opencode/packages/core/src/session.ts:285-288`; effective order `vendor/opencode/packages/core/src/permission.ts:87-91,158-162`. | Wholesale delegated replacement before admission; final role restrictions prevent parent-wide allows restoring forbidden tools. |
| A resumed child or idempotent prompt retry bypasses prompt preparation. | `vendor/opencode/packages/core/src/session/execution/restart.ts:168-188`; `vendor/opencode/packages/core/src/session/session.ts:151-159`. | Persist initial preparation before a background marker can exist; hydrate the cache from the child capsule in request hooks. Retry returns the already prepared state. |
| Context hook changes permissions after this request's tool snapshot was selected. | `vendor/opencode/packages/core/src/session/context.ts:121-139`; `vendor/opencode/packages/core/src/session/model-request.ts:223-256,404-410`. | Context hooks hydrate teaching state and validate preparedness; they must not PATCH policy and assume the current snapshot changed. Unprepared Buddy children fail preparation before provider execution and need the normal prompt initialization path. |
| Parent is steered while children are starting. | Metadata/rules copy at `vendor/opencode/packages/core/src/session.ts:287-288`; separate update calls at `vendor/opencode/packages/core/src/plugin/host.ts:553-560`. | Capture state and source rules together in the inherited capsule. Do not combine copied permissions with a newer parent cache. Serialize Buddy metadata/policy writers. |
| Continuation changes a role while an earlier role's model/tool request is in flight. | Upstream switches agent/model before prompting at `vendor/opencode/packages/core/src/tool/plugin/subagent.ts:169-182`; existing Job is reused at `vendor/opencode/packages/core/src/job.ts:261-264`. | Default preflight rejects a different-role continuation for a Buddy child; use a new child instead. An active-session snapshot check alone would not serialize parallel role-changing calls **(inferred)**. Keep same-role steering/model continuation; supporting role switches needs a separately designed admission contract. |
| Host recovery starts before the imported Promise plugin is registered. | Recovery is forked in `vendor/opencode/packages/sdk/src/internal/host.ts:48-52`; only afterward does `vendor/opencode/packages/sdk/src/promise.ts:35-59` register `plugins`. | Install the session runtime plugin through the boot-time SDK `instances` selector. Do not assume `OpenCode.create({plugins})` alone gates recovery. |

Design: register `hydrateBuddyTeachingState` first in Buddy's `context`, `compaction`, and `generate` hooks, before Buddy prompt-context composition. Hook callbacks execute sequentially (`vendor/opencode/packages/core/src/plugin/hooks.ts:88-94`); no public hook-priority option exists (`vendor/opencode/packages/plugin/src/promise/registration.ts:5-19`).
Hydration reconstructs only the capsule-backed teaching fields and preserves the delegated profile when no explicit child runtime was supplied. Do not call the ordinary root permission compiler just because the cache was evicted.
If the capsule is absent on an old directly prompted session, initialize through the next Buddy prompt. For a recovered background child, missing/invalid preparation is an execution error, never permission broadening; request-hook rejection is not a typed spawn veto (`vendor/opencode/packages/core/src/plugin/hooks.ts:23-29`).

### Delegated tool policy, depth, and permissions

Design: add a pure `buildBuddyDelegatedSessionPermissions({source, role, config, toolCatalog})`, using the v2 `{action, resource, effect}` rule shape and order-sensitive equality. Do not port the sorting comparison from `packages/buddy/src/learning/agent-execution/permissions/runtime-session-permissions.ts:14-42`.
Ordinary tools preserve the parent's effective allow/ask/resource constraints; author extras are added only when their feature/project/platform/workspace constraints pass; persona delegate `denyTools` and role hard restrictions apply last. Other child-specific resource rules survive explicit recompilation where compatible.
Role extras may override Buddy's ordinary **primary-authoring exclusion**, as V4 requires. They must not erase configured tool-off settings or path restrictions, nor copy ungranted dynamic tools merely because they exist in the directory registry.
Translate `task` spawn actions to `subagent`, `bash` to `shell`, and edit-family tooling through its declared permission action; v2 `patch`/`write`/`edit` use `options.permission:"edit"` (`vendor/opencode/packages/core/src/tool/plugin/patch.ts:81`, `write.ts:59`, `edit.ts:123`). Skill resource patterns must use v2 skill IDs (`vendor/opencode/packages/core/src/tool/plugin/skill.ts:48-55`), coordinated with the permissions/config work packages.
Preserve resource patterns for spawning and skills. A fully excluded action needs a final `{action,resource:"*",effect:"deny"}` so the tool snapshot hides it; `whollyDisabled` considers the last matching action rule (`vendor/opencode/packages/core/src/tool.ts:225-235,292-294`).
Native leaves assert permissions themselves; Buddy tools with ask access use W-A's permission helper and await its result. Tool registration is not a universal execution permission check (`docs/architecture/v2-upstream/v2-migration/LOG.md:23-27,46`). Child requests stay owned by the child ID and are shown in the owner chat via family traversal.
This fulfills V1-V5/V8/V9 without a per-prompt boolean tool map or context-hook tool deletion. Model-specific schemas/catalog entries belong to the v2 registry; use `ctx.tool.list()` to read effective tool/action metadata (`vendor/opencode/packages/plugin/src/promise/tool.ts:66-71`).

Default: keep **`experimental.subagent_depth:1`**, with final child `subagent:* deny` for non-orchestrator roles. Depth is counted from parent ancestry, not from agent type (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:117-133`; upstream tests `vendor/opencode/packages/core/test/tool-subagent.test.ts:310-391`).
The authored curriculum orchestrator expresses nested intent, but is absent from today's explicit persona lists. Register it correctly without enabling a new nested user workflow. An enabled orchestrator would need depth 2 and narrowly allowed descendant roles; raising depth alone must not restore ordinary-child spawn rights.

### Cancellation, completion, and restart recovery

Design: stop a particular worker through the SDK-backed Buddy route calling **`session.interrupt({sessionID:childID})`**; do not cancel a Job directly. Non-shutdown child interruption cancels its Job (`vendor/opencode/packages/core/src/session/execution.ts:128-134`).
Blocking parent interruption cancels the blocked child (`vendor/opencode/packages/core/src/tool/plugin/subagent.ts:234-240`). Detached background children are not automatically cancelled by stopping the parent **(inferred)**: they have returned from that blocked-wait scope. Show explicit per-child Stop; do not add cascading stop by default.
Upstream blocking results surface failure/cancellation with the child ID (`:245-251`); background terminal states arrive as synthetic completions, including error and cancelled (`vendor/opencode/packages/core/src/session/subagent-completion.ts:29-45`).
“Continue in background” calls `session.background` on the **blocking parent**; it backgrounds all currently blocking eligible jobs, not one chosen child (`vendor/opencode/packages/core/src/session.ts:442-458`; `vendor/opencode/packages/protocol/src/groups/session.ts:765-777`). Label this action accordingly.

Design: use the persistent host database already selected in `docs/architecture/v2-upstream/v2-migration/STATUS.md:41`. Supply the complete Buddy session runtime plugin through **`OpenCode.create({instances:{key,configure},...})`**, whose selector is installed before recovery; use a stable Buddy runtime key, retaining sharing per canonical Location.
`configure` returns the runtime plugin without depending on the returned host or a later registration call. Instance acquisition awaits activation and refuses failed/colliding plugins (`vendor/opencode/packages/sdk/src/internal/instances.ts:55-95`; `vendor/opencode/packages/sdk/README.md:61-74`); the runner also awaits activation (`vendor/opencode/packages/core/src/session/runner/llm.ts:67`).
This is a necessary host integration addition to the earlier host-wide-plugin plan **(inferred from the startup order)**. Locationless catalog views should use Buddy's catalog projection or a separate catalog plugin ID; do not register the same runtime plugin ID both host-wide and in `instances` (SDK README `:65`). Do not add a Buddy recovery scheduler or patch vendor startup.
Job state is process-local, but backgrounded recoverable work writes `job.background/<notificationID>` into KV; ordinary foreground Job registration is not durable (`vendor/opencode/packages/core/src/job.ts:178-207,357-368,441-463`). The SDK defaults to `:memory:` and starts recovery asynchronously (`vendor/opencode/packages/sdk/src/internal/host.ts:39,48-52`).
Recovery validates parent/child existence and lineage, delivers stored terminal outcomes, or resumes the unfinished child and observes its Job (`vendor/opencode/packages/core/src/session/execution/restart.ts:138-190`). Resume budgets are bounded; notification markers are deleted only after synthetic admission (`:77-99`; `vendor/opencode/packages/core/src/session/subagent-completion.ts:37-45`).
The synthetic has a stable notification ID for replay deduplication; upstream pins live-delivery/restart admission once in `vendor/opencode/packages/core/test/tool-subagent.test.ts:200-270`. Buddy must not manufacture its own completion messages.
Persisted child capsule + persisted child permissions are sufficient to hydrate teaching state when recovery resumes without `session.prompt` **(inferred)**. Clear only cached projections on eviction/deletion; use explicit version migration for capsule changes.
Background shell recovery differs: unfinished processes become cancelled after restart (`vendor/opencode/packages/core/src/session/execution/restart.ts:101-135`). Do not promise shell resurrection in the subagent running-work UI.
Foreground orphan reconciliation and the deferred Electron Node v1 migration gap remain upstream/desktop work, not reasons to fork the Job service (`docs/architecture/v2-upstream/v2-migration/v2-permissions-subagents-events.md:214-218`; `docs/architecture/v2-upstream/v2-migration/LOG.md:51,54`).

## 3. Web and transcript design

### Normalize at the adapter boundary, then render the new contract

Design: extend `@buddy/transcript-contract` with a typed subagent presentation projection: `childSessionID`, `agentID`, `description`, `background`, worker outcome, and completion-message identity. Keep the raw tool's completion state distinct from worker completion.
The gateway consumes v2 parts/messages/events; web imports only the Buddy contract/SDK. Preserve raw content for the parent model; display compact notices and object previews instead of dumping generated XML into the chat.

| V1 renderer assumption | V2 source | Buddy change |
|---|---|---|
| Tool name/renderer `task` | Tool `subagent` | Register `subagent` in `packages/web/src/components/chat/tools/built-in-tool-renderers.ts:59`; update tool-info dispatch at `packages/web/src/components/chat/tools/tool-info.ts:168,344` and the presentation catalog. Rename the internal renderer family if useful. |
| `input.subagent_type` | `input.agent` | Role dispatch in `packages/web/src/components/chat/tools/render/task.tsx:8-25` reads the typed role projection. New input also supports `model`, `sessionID`, `background`. |
| `metadata.sessionId` | `metadata.sessionID` | Normalize one child ID in the gateway; update header/author cards to use it. Both running progress and terminal tool records can identify the child. |
| Tool `completed` means worker done | Completed tool + metadata `status:"running"` means background work | Resolve card status using completion notices and actual child execution; keep label/activity and Show/Stop available while the parent is idle. |
| `<task_result>` string | Tool content `<subagent ...>` or background instructions; synthetic completion text | Feed structured completion text to author fallbacks; avoid making each React renderer parse XML. Retain a legacy-only `<task_result>` normalizer for old history. |
| Subagent role parsed from title suffix | Session `.agent`; title is `input.description` | Use session/typed role identity; keep the old suffix parser only for historical display. V2 tool creation is at `vendor/opencode/packages/core/src/tool/plugin/subagent.ts:185-192`. |

Legacy history needs deliberate compatibility: v2 migration keeps `name:part.tool`, `input:part.state.input`, and old metadata (`vendor/opencode/packages/core/src/database/v1-migration.bun.ts:951-1001`); `RENAMED_TOOLS` at `:899,919-933` only informs the model through a notice.
Design: gateway normalization maps persisted `task` + `subagent_type` + `sessionId` into the same subagent projection. Keep raw historical records untouched; never reinterpret an old completed task as background merely because it has a child ID.
Error tool states can retain running progress metadata; preserve that child link (`vendor/opencode/packages/schema/src/session-message.ts:125-158`; research report `docs/architecture/v2-upstream/v2-migration/v2-permissions-subagents-events.md:285-319`).

### Running work and completion

Design: add a pure `deriveRunningSubagents(...)` over the Buddy transcript/session inventory and expose it through `useRunningSubagents(directory, ownerSessionID)`.
Use the v2 app's approach as a reference, not a Solid component import (`vendor/opencode/packages/app/src/session/requests/background.ts:15-94,106-138`):

1. Collect active blocking `subagent` calls and completed spawn calls whose metadata has `status:"running"`.
2. Match synthetic messages where `metadata.source === "subagent"`, `childID` matches, and `state` is completed/error/cancelled. New completions carry `{source,childID,agent,state}` (`vendor/opencode/packages/core/src/session/subagent-completion.ts:37-43`).
3. Reconcile with active children (`parentID === owner`) and de-duplicate by child ID. Use execution events plus the `session.active` snapshot, not a nonexistent Job event/API or deprecated `session.status` publisher (research report `:212,260,286`).
4. Show a compact running-work menu in the owner chat, with description, role, Open in Bench and Stop. Upstream navigation/Stop reference: `vendor/opencode/packages/app/src/session/header/session-running-menu.tsx:114-140`.
5. On terminal synthetic admission, remove that run and show a compact completed/failed/cancelled row linked to the child. Upstream reference: `vendor/opencode/packages/session-ui/src/timeline/session-timeline-row.tsx:436-460,530-548`.

Design: correlate completions **per run**, not with a permanent set of completed child IDs. A later `sessionID` continuation can run the same child again; the upstream app's all-history completion Set at `background.ts:16-24,74` suppresses subsequent generations **(inferred)**.
Use assistant-message ID plus tool-call ID for the spawn record, child ID for ownership, and synthetic message ID/canonical transcript order for a terminal boundary. Tool-part ran/created times and child execution-start/terminal events distinguish later continuations; joined calls for one active child represent one worker.
Completion can arrive before parent tool-success, or an old completion can arrive after a later run starts **(inferred from independent notification observation at `vendor/opencode/packages/core/src/session/subagent-job.ts:23-33`)**. Synthetic metadata has no originating tool-call/generation ID: never claim exact generation matching from `childID` alone. Keep a currently active child visible despite an earlier notice; ambiguous paged history stays resolving until resync. No invented generation ID is passed into OpenCode.
On `server.connected`, refetch active state, session family, displayed transcripts and pending child permissions; the global event stream has no replay (`docs/architecture/v2-upstream/v2-migration/v2-permissions-subagents-events.md:273-279,340-343`).
If only a history page is loaded, fetch the missing completion/history range before trusting an old running marker; an idle child alone may have an undelivered completion. Display a resolving state during resync rather than an indefinite spinner. No model polling tools are involved.

Design: preserve V12's generic result suppression and stable description. For V13, author cards load persisted objects after **worker** completion, keyed by `createdBy.sessionID === childSessionID`; background spawn return must not trigger “finished deck” display.
Invalidate/refetch the object query on child completion, including while the parent is idle. Keep attribution by the original child ID so Bench Review/Open and existing object APIs continue to work; add tests for unrelated objects and multiple child runs.
The v2 card itself distinguishes background/running from tool status (`vendor/opencode/packages/session-ui/src/tools/tool-renderer.tsx:1853-1890`); Buddy should preserve its own card/product layout and extend its status resolver.

### Keep Bench navigation working

Design: route tool-card clicks, running-menu Open and completion links to the existing `handleOpenSubagentSession` callback with the normalized child ID.
That callback already uses `selectWorkspaceSession` → `openOwnedSubagentBench`, not unconditional child-as-main-chat selection (`packages/web/src/components/directory-chat/directory-workspace-root.tsx:827-859`).
Keep target `{type:"session",sessionID}` and root-owner resolution. `useOpenSubagentBench` clears unread/marks viewed only after committed navigation (`packages/web/src/lib/use-open-subagent-bench.ts:13-23`).
`SessionBenchSurface` continues to prefetch/subscribe to the child's transcript by directory/ID (`packages/web/src/components/bench/surfaces/session-bench-surface.tsx:35-59`). The gateway supplies new transcript/status shapes; no new Bench surface kind is necessary.
Fetch a missing child and ancestors before invoking ownership resolution: otherwise the existing unknown-session fallback could replace the owner chat **(inferred from `packages/web/src/lib/subagent-bench-target.ts:23-24,48-58` and workspace-root `:838-839`)**.

## 4. Implementation in three work packages

These are proposed file owners, not instructions to edit concurrently owned files during this research. Coordinate the small W-A/W-C/W-D integration points before implementation.

### Package A — Agent definitions and delegated policy

Owner: Buddy learning/config policy maintainer; depends on W-A's public plugin exports and W-D's PermissionV2 compiler.

- Own new `packages/buddy/src/opencode-runtime/plugins/buddy-agents.ts`: `registerBuddyAgents(ctx, config)` and `compileBuddyAgent(definition, overrides)`; exact seam `ctx.agent.transform` with `editor.update/default`.
- Own `learning/runtime-subagents.ts`, `learning/agent-factories.ts`, `config/opencode/agents.ts`, role definitions and affected authored prompt text: translate prompt→system, permission→permissions, enforce subagent modes, and preserve config overrides/internal visibility.
- Own new `learning/agent-execution/permissions/delegated-session-permissions.ts`: `buildBuddyDelegatedSessionPermissions`, action mapping via tool metadata, extras gating, preserved patterns, role restrictions, and order-sensitive equality.
- Share W-D's session update helper; extend `runtime-session-permissions.ts` with the existing child-profile preservation contract. Do not overwrite a delegated child with root defaults during cache hydration.
- Keep `experimental.subagent_depth` in native host configuration; no Buddy depth counter or imported Job service. Request specific config exposure from the config work package if later enabled.
- Tests: rewrite the relevant `runtime-tool-registration`, `opencode-overlay-isolation`, `runtime-session-permissions` and internal-memory-gating scenarios against v2 agents/rules; add catalog tests for all seven roles, primary exclusion, configured model/system, and reload isolation.
- Add pure policy cases for inherited websearch denial, question-vs-flashcard extras, disabled feature/project/platform/workspace, explicit false extras, dynamic grants, edit-path ask/deny preservation, skill/spawn patterns, final role denies, and different rule order producing different effects.

### Package B — Teaching-state lifecycle and native subagent integration

Owner: Buddy runtime maintainer; depends on A and W-A host/plugin lifecycle, including the boot-time `instances` addition. No edits under `vendor/opencode`.

- Own new `learning/agent-execution/state/teaching-session-metadata.ts`: capsule schema/version migration, `publishBuddyDelegationSource`, `readBuddyTeachingSnapshot`, `persistBuddyTeachingSnapshot`, and `hydrateBuddyTeachingState`.
- Own new `opencode-runtime/plugins/buddy-subagents.ts`: `registerBuddySubagentHooks(ctx)`; exact hooks `session.hook("prompt", seedBuddySubagentPrompt)`, `session.hook("context"|"compaction"|"generate", hydrate...)`, and `tool.hook("execute.before", validateBuddySubagentSpawn)` filtered to `subagent`.
- `seedBuddySubagentPrompt` calls `session.get/update` in the ordered sequence in §2; preflight verifies the delegation source and rejects different-role Buddy-child continuations with the adapter-exported tool error. Leave non-Buddy child behavior with upstream; no activity-snapshot race is used as an admission lock.
- Integrate registration into `opencode-runtime/plugins/buddy-runtime-plugin.ts`; integrate root capsule publication into prompt/config policy acceptance. W-A owns `runtime.ts` and adapter `host.ts`: pass the session plugin through boot-time `instances`, keep configuration independent of the returned host, and separate locationless catalog projection/IDs. Coordinate those shared edits with W-A/W-C.
- Delete `opencode-runtime/subagent-forwarding.ts`, `subagent-tool-forwarding-runtime.ts`, and `learning/agent-execution/transforms/subagent-tool-forwarding.ts`. Remove their calls from message/command transforms and adapter interception APIs once other consumers are accounted for; update `UPSTREAM-HOOKS.md` to record the public replacement.
- Delete the old `packages/buddy/test/learning/subagent-tool-forwarding.test.ts` after replacement coverage lands. Re-express its eight tests: existing-state direct author; direct default-persona author; child current-policy inheritance; SDK direct admission; explicit internal standalone envelope; normal tool spawn; named execution path; flashcard ingest/save.
- Merge the ordinary/named-tool scenarios into one public native-tool integration assertion. Delete fake `promptOps`, `bypassAgentCheck`, manually fabricated v1 assistant parts, persisted `user.info.tools`, `cancelCalls>0`, and monkey-patch registration expectations.
- New `test/learning/delegated-session-permissions.test.ts` and `test/opencode-runtime/buddy-subagents.test.ts` inspect the **first actual child model request**, child state/rules and saved objects through an isolated embedded host with a deterministic provider fixture; never import vendor services into Buddy tests.
- Exercise blocking/background/direct/continued paths, unknown/unrelated child failures, independent children racing, delayed creation-event subscriber, inherited parent allows against restrictive roles, no state overwrite, prompt failure/retry, and cache eviction before the next request.
- Exercise same-role steering/model override, different-role continuation rejection (including parallel calls), fresh-child role selection, default depth rejection, and an explicit depth-2 orchestrator fixture with narrow descendant permissions.
- Add real cancellation tests: parent blocking stop, explicit child background stop, detached work surviving parent stop, and parent-wide move-to-background. Assert terminal notices/status and preserved child/objects; do not test private cleanup counters.
- Recovery tests restart the task-owned test host on the same temporary database with empty Buddy caches: unfinished background child, completed notification replay once, invalid/missing family, prepared-state hydration, missing capsule error, and internal standalone isolation. Include delayed host-wide registration to prove the instance plugin is active on the recovered child's first request. Use a process fixture for crash windows if graceful close cannot produce the required state.

### Package C — Transcript projection, background UI, and Bench

Owner: transcript/web maintainer; depends on W-C gateway and B's stable metadata, with separate adapter and web file ownership.

- Own `packages/transcript-contract/src/` subagent/completion projection and adapter `src/gateway/` subagent normalization; functions `toBuddySubagentPresentation` and `toBuddySubagentCompletion` consume canonical v2 metadata and legacy history only at this boundary.
- Own new `packages/web/src/lib/running-subagents.ts` (`deriveRunningSubagents`) and its store/query selector (`useRunningSubagents`); derive from transcripts + child execution, not a Buddy job registry.
- Own `components/chat/tools/render/task/*`, `render/task.tsx`, `built-in-tool-renderers.ts`, `tool-info.ts`, and the transcript-contract core presentation descriptor for `subagent` (the descriptor was moved out of the adapter per `LOG.md:47`).
- Add running-work menu/completion row; use existing Buddy abort/navigation routes, with a route to upstream `session.background` if W-C does not already expose it. Extend worker outcomes without changing the underlying tool-part status to fabricate completion.
- Own small navigation changes in `directory-workspace-root.tsx`, `use-open-subagent-bench.ts`, and `session-bench-surface.tsx` only as needed to load missing ancestry and wire normalized links. Preserve the existing session target and owner-first behavior.
- Keep and update `packages/web/test/subagent-card.test.tsx`; retain `subagent-bench-target.test.ts` and family tests. Delete only v1 input/metadata fixtures and `<task_result>` runtime parsing assertions; keep legacy compatibility coverage at the gateway boundary.
- Add `running-subagents.test.ts` for background tool-return/child-running distinction, success/error/cancelled notices, completion-before-tool-success, reused child IDs, a late prior completion while the next run is active, joined continuations, partial history/reconnect, lost progress events, and deduplication with active child inventory.
- Add author-card tests for delayed generated objects, child attribution, unrelated decks/question sets, completion invalidation, and XML-free fallback. Add Bench tests for running/completed/error links, missing ancestors, root selection and unread handling.
- Gateway fixtures must cover persisted v1 `task`/`subagent_type`/`sessionId`, canonical v2 `subagent`/`agent`/`sessionID`, progress metadata surviving failure, and synthetic source/child/outcome mapping.

Implementation verification: focused package-script tests with temporary Buddy/XDG/database/notebook roots, then root `bun lint` followed by `bun typecheck`, never concurrent. No browser/computer-use verification without explicit approval; no `bun fmt` until implementation is complete and the user is satisfied (`AGENTS.md:23-46`).
This read-only report was checked against sources and existing tests; no code tests, host boot, browser session, formatter, or migration against real state was run.

## 5. Product-owner questions

- **Background default for authoring:** should independent flashcard/question authoring automatically background? **Default:** blocking as today; explicit background when independent, with automatic upstream completion waking the parent.
- **Nested curriculum workflow:** should personas expose `curriculum-orchestrator` and permit its delegates? **Default:** preserve current delegate lists/depth 1; enabling that workflow is a separate product change with depth 2 and narrow rules.
- **Parent changes during delegated work:** should persona/focus/workspace/tool changes propagate immediately to existing children? **Default:** teaching snapshot at launch, existing child state preserved, policy refreshed on explicit continuation; no live fan-out of parent edits.
- **Stop scope:** should stopping the owner chat also stop detached background children? **Default:** native behavior, explicit per-child Stop; any “Stop all work” is a separate, clearly labeled family operation.
- **Role-changing continuation:** should one child transcript switch between specialists? **Default:** fresh child for a different role; same-role `sessionID` continuation and explicit model changes stay available.
