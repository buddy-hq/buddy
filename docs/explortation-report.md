# Exploration Report

This document captures what I learned from a deep sweep of Buddy's in-progress learner/runtime rewrite on the current branch.

## Executive Take

- This is a major learner-system rewrite, not a small refactor.
- The rewrite moves Buddy from a heuristic/blob-style learner state system to a file-first artifact system with structured LLM decisions.
- The main teaching model is still the real live router for the conversation.
- The new sidecar learner decision engine is mostly about durable learner-memory mutation, not live reply routing.
- The architecture is smarter in capability, but the current trigger policy looks too eager: it invokes a sidecar LLM on every accepted learner message.
- No vendored OpenCode files were changed during this pass.

## High-Level Architectural Shift

The old learner system looked more like:

- centralized learner state
- derived projections
- heuristic or regex-style interpretation
- route surface shaped around state/progress/review/curriculum-view

The new learner system looks like:

- file-backed learner artifacts under `.buddy/learner/`
- typed snapshot compilation from those artifacts
- structured LLM decision engine for message interpretation, feedback generation, and planning
- route surface shaped around snapshot / plan / artifacts / workspace patching

In short: Buddy is being moved toward an event/artifact log plus compiled views, with explicit LLM decisions rather than hidden heuristics.

## What Changed

### New learner storage model

New artifact layer under:

- `packages/buddy/src/learning/learner/artifacts/bridge.ts`
- `packages/buddy/src/learning/learner/artifacts/store.ts`
- `packages/buddy/src/learning/learner/artifacts/types.ts`
- `packages/buddy/src/learning/learner/artifacts/markdown.ts`
- `packages/buddy/src/learning/learner/artifacts/path.ts`

Artifacts now exist for:

- workspace context
- profile
- goal
- message
- practice
- assessment
- evidence
- feedback
- misconception
- decision-interpret-message
- decision-feedback
- decision-plan

Workspace artifacts live in the project under:

- `.buddy/learner/workspace/context.md`
- `.buddy/learner/goals/*.md`
- `.buddy/learner/messages/*.md`
- `.buddy/learner/practice/*.md`
- `.buddy/learner/assessments/*.md`
- `.buddy/learner/evidence/*.md`
- `.buddy/learner/feedback/*.md`
- `.buddy/learner/misconceptions/*.md`
- `.buddy/learner/decisions/interpret-message/*.md`
- `.buddy/learner/decisions/feedback/*.md`
- `.buddy/learner/decisions/plan/*.md`

User-wide learner profile lives at:

- `~/.buddy/profile/learner/profile.md`

### New snapshot compiler

New compiler:

- `packages/buddy/src/learning/learner/compiler/snapshot.ts`

This compiles a factual learner snapshot from artifacts. It includes:

- workspace context
- profile
- active goals
- open feedback
- active misconceptions
- recent evidence
- latest plan artifact
- constraints summary
- activity bundles from runtime profile
- sections
- synthesized markdown

### New prompt-context compiler

New prompt digest builder:

- `packages/buddy/src/learning/learner/compiler/prompt-context.ts`

This turns snapshot data into a compact `LearnerPromptDigest` used in the teaching prompt.

### New decision engine

New structured decision layer under:

- `packages/buddy/src/learning/learner/decision/engine.ts`
- `packages/buddy/src/learning/learner/decision/service.ts`
- `packages/buddy/src/learning/learner/decision/prompt.ts`
- `packages/buddy/src/learning/learner/decision/types.ts`

Decision operations:

- `interpretMessage`
- `planSession`
- `generatePracticeFeedback`
- `generateAssessmentFeedback`

### Service/orchestration split

`packages/buddy/src/learning/learner/service.ts` is now a thin facade over orchestration modules:

- `packages/buddy/src/learning/learner/orchestration/observe-message.ts`
- `packages/buddy/src/learning/learner/orchestration/record-practice.ts`
- `packages/buddy/src/learning/learner/orchestration/record-assessment.ts`
- `packages/buddy/src/learning/learner/orchestration/plan.ts`
- `packages/buddy/src/learning/learner/orchestration/workspace.ts`

### API surface rewrite

Old learner endpoints are being removed/replaced.

New routes in:

- `packages/buddy/src/routes/learner.ts`

New surface:

- `GET /api/learner/snapshot`
- `POST /api/learner/plan`
- `GET /api/learner/artifacts`
- `PATCH /api/learner/workspace`

Removed/retired surface includes:

- learner state
- learner goals route
- progress route
- review route
- curriculum-view route
- rebuild route
- dedicated `goals.ts`

### Frontend consumption changed too

The web app now loads curriculum/sidebar data by combining:

- `/api/learner/snapshot`
- `/api/learner/plan`
- `/api/learner/artifacts`

instead of using the older learner progress/review/curriculum-view routes.

## What The New End-to-End System Actually Does

## Live teaching loop

The real conversational teaching flow still goes through the normal session message route.

Main relevant files:

- `packages/web/src/state/chat-actions.ts`
- `packages/buddy/src/routes/session/interaction-routes.ts`
- `packages/buddy/src/routes/session/message-transform.ts`
- `packages/buddy/src/routes/session/proxy-transform.ts`
- `packages/buddy/src/routes/support/proxy.ts`

Flow:

1. Web sends `POST /api/session/:sessionID/message`.
2. Buddy intercepts the request in `createSessionMessageTransform`.
3. Buddy reads persona, intent, focus goals, workspace state.
4. Buddy builds learner prompt context from the learner artifact snapshot.
5. Buddy builds runtime prompt sections.
6. Buddy diffs stable/turn sections against cached prior sections.
7. Buddy rewrites the outbound OpenCode request with system prompt + synthetic turn context.
8. Buddy proxies to vendored OpenCode.
9. OpenCode main session model handles the actual visible reply.

Important consequence:

- The main teacher model already sees the real ongoing conversation history in the OpenCode session.
- Buddy also injects a learner digest and runtime context into that same turn.
- So the main teacher model is already the live smart router.

## Post-accept learner-memory loop

After the message is accepted, Buddy runs learner observation:

- `packages/buddy/src/routes/session/message-transform.ts`
- `packages/buddy/src/learning/learner/orchestration/observe-message.ts`

That does:

1. Persist learner message artifact.
2. Compile a factual learner snapshot.
3. Call `interpretMessage` using the sidecar decision engine.
4. Persist a decision artifact.
5. Apply explicit mutations only if the decision says to.

Possible mutations:

- create evidence
- create misconception
- resolve misconceptions by explicit IDs

Important consequence:

- This sidecar LLM does not influence the current turn's reply.
- It only affects durable learner state for future turns / UI / tools.

## Practice and assessment loops

Practice and assessment are different from raw messages.

Relevant files:

- `packages/buddy/src/learning/learner/orchestration/record-practice.ts`
- `packages/buddy/src/learning/learner/orchestration/record-assessment.ts`

These flows are tool-driven, not automatic on every message.

Practice flow:

1. persist practice artifact
2. persist evidence artifact
3. compile snapshot
4. call feedback decision engine
5. persist decision artifact
6. optionally create feedback / close feedback / resolve misconceptions

Assessment flow is parallel.

This part makes sense conceptually because explicit practice and assessment events are naturally high-signal and worth structured interpretation.

## Planning loop

Planning is handled in:

- `packages/buddy/src/learning/learner/orchestration/plan.ts`

This path:

1. compiles a scoped snapshot
2. hashes the exact plan input context
3. checks for an existing matching `decision-plan` artifact
4. reuses it if possible
5. otherwise calls the planning decision engine and persists the result

This is on-demand, not automatically per message.

This is used by:

- `/api/learner/plan`
- learner snapshot tool
- curriculum read tool
- web sidebar curriculum loading

## What Context Each Model Sees

## Main teacher model

The main teaching model sees:

- normal OpenCode session history
- Buddy system prompt sections
- Buddy runtime profile
- workspace state
- explicit overrides
- learner prompt digest
- optional teaching workspace/editor context
- turn cautions

Relevant files:

- `packages/buddy/src/routes/session/message-transform.ts`
- `packages/buddy/src/learning/shared/compose-system-prompt.ts`
- `packages/buddy/src/learning/learner/compiler/prompt-context.ts`

This is the richest context in the whole system.

## Sidecar interpret-message model

The sidecar interpret-message model does not see full session history.

It sees:

- workspace label
- session id
- focus goal ids
- active goals
- open feedback
- active misconceptions
- recent evidence
- current learner message text

Relevant files:

- `packages/buddy/src/learning/learner/decision/prompt.ts`
- `packages/buddy/src/learning/learner/compiler/snapshot.ts`

Important: this is a compiled learner snapshot, not chat history.

## What "compiled snapshot context" means

It means Buddy is not sending the whole conversation history to the sidecar model.
Instead, it compiles a factual summary from artifact files.

Snapshot contents come from:

- workspace context artifact
- profile artifact
- active goal artifacts
- open feedback artifacts
- active misconception artifacts
- recent evidence artifacts
- latest plan artifact
- runtime activity bundles

This gets synthesized into markdown like:

- active goals
- next step
- open feedback
- misconceptions
- constraints

So the sidecar sees a condensed pedagogical state plus the latest learner message.

## Is The New Architecture Smarter Or Dumber?

### Smarter than the old one

The old message observer was basically regex-based keyword detection.
It inferred things like confusion/practice/check/completion from pattern matching.

The new one is much more semantically capable:

- can interpret meaning, not just keywords
- can abstain
- can output structured evidence/misconception decisions
- can carry confidence
- can reason from goals, feedback, misconceptions, and prior evidence
- can generate plans and feedback decisions from context

So in raw capability, the new architecture is clearly smarter.

### But current trigger policy is probably too dumb/eager

The problem is not the artifact architecture itself.
The problem is that the current rewrite appears to run the sidecar interpreter on every accepted learner message.

That makes it:

- more expensive than necessary
- duplicative with the main teaching model's reasoning
- weaker than the main teaching model because it lacks chat history
- harder to justify as a per-turn operation

So the architecture is smarter, but the current operating policy is probably not the right one.

## Where LLM Calls Happen Now

There are two conceptually different LLM paths.

### 1. Main OpenCode teaching call

This is the normal session model call through the existing OpenCode runtime.
Buddy shapes prompt/context before it reaches OpenCode.

### 2. Learner decision sidecar calls

These happen in:

- `packages/buddy/src/learning/learner/decision/engine.ts`

The engine creates a fresh temporary OpenCode session, runs a structured JSON-schema prompt, then deletes that temporary session.

That sidecar is used for:

- message interpretation
- plan decision
- practice feedback decision
- assessment feedback decision

## Are LLM calls happening every turn for the smart router?

The important nuance is:

- the main teacher LLM obviously runs every conversational turn
- the sidecar learner-memory interpreter currently appears to run on every accepted learner message
- planning does not run every turn; it is on-demand and cached
- practice/assessment feedback sidecars only run when those explicit tool-driven record flows are used

So if by "smart router" we mean the actual teacher choosing how to respond, that is still the main model.
If we mean the new learner-memory interpretation sidecar, then yes, it appears to be invoked after every accepted learner message right now.

## What model is used by the sidecar?

Relevant file:

- `packages/buddy/src/learning/learner/decision/engine.ts`

Model resolution strategy:

1. If a session id is available, try to infer model context from the current session.
2. Otherwise use the project-configured model.
3. Prefer a provider-specific small model via `Provider.getSmallModel(providerID)`.
4. Fall back to the explicitly configured/direct model if no small model exists.

So the decision engine is generally trying to use a smaller/cheaper model from the same provider, not the full main teaching model by default.

## Where small model variants come from

The source of truth is not Buddy code. It comes from vendored OpenCode provider logic.

Relevant files:

- `packages/opencode-adapter/src/provider.ts`
- `vendor/opencode/packages/opencode/src/provider/provider.ts`

`packages/opencode-adapter/src/provider.ts` is just a re-export.

The actual small-model resolution lives in vendored OpenCode's `getSmallModel`.

Order of preference:

1. explicit `small_model` config override
2. provider-specific priority lookup for models containing strings like:
   - `claude-haiku-4-5`
   - `claude-haiku-4.5`
   - `3-5-haiku`
   - `3.5-haiku`
   - `gemini-3-flash`
   - `gemini-2.5-flash`
   - `gpt-5-nano`
3. fallback to `opencode/gpt-5-nano` if available

So the sidecar is designed to be cheap-ish.

## Existing Caching and Gating Already In The System

## Prompt injection caching exists

Buddy already has a pretty sophisticated prompt diff/cache system:

- `packages/buddy/src/learning/runtime/prompt-injection.ts`
- `packages/buddy/src/learning/runtime/prompt-injection-policy.ts`

It caches stable header and turn-context sections, and only reinjects changed/forced sections.

That means Buddy has already solved a version of the "don't resend all context every turn" problem for the main teacher prompt.

## Plan caching exists

Plan generation is cached by exact input hash in:

- `packages/buddy/src/learning/learner/orchestration/plan.ts`

This is a good pattern.

## But message interpretation caching does not appear to exist

Interpret-message computes an input hash and stores it in a decision artifact, but does not appear to check for a prior matching decision before calling the model.

So it records the hash, but does not really use it for reuse.

## Current Design Mismatches / Risks / Things Worth Knowing

## 1. The main teacher already has better context than the sidecar

This is the biggest conceptual mismatch.

The main teacher prompt explicitly says:

- decide live from learner message, history, and learner state
- do not wait for backend routing

So the sidecar is not the router.
It is a memory-extraction pass that runs after the fact.

That means Buddy is currently paying for a second model to interpret learner meaning, even though the first model had more context.

## 2. Planning is on-demand, but live prompt context may use stale plan state

`LearnerService.buildPromptContext(...)` compiles snapshot and reads `snapshot.latestPlan`.
It does not call `ensurePlanDecision(...)`.

That means:

- the live teacher prompt may use an old plan artifact
- the sidebar/API/tooling may show a fresher plan because those paths call `ensurePlanDecision`

Worse, snapshot picks the latest plan artifact by recency, which may not be tightly scoped to the current intent/focus goals.

This is a likely source of subtle drift.

## 3. There is duplicated snapshot/artifact work per accepted learner turn

A normal message path now roughly does:

- pre-turn snapshot/digest build for prompt injection
- post-accept snapshot build for message interpretation

So the system reads artifact state multiple times around a single learner message.

## 4. File-first artifact store is elegant, but cost grows with artifact count

The artifact store reads markdown files directly by kind.
That is simple and auditable, but over time:

- more artifacts means more directory scans
- more file parses per snapshot
- more per-turn latency if used frequently

This is probably acceptable for current scale, but it is a real tradeoff.

## 5. Current web/backend contract mismatch around `activityBundleId`

The web still appears to send `activityBundleId` in some prompt flows.
But backend `assertNoLegacyRuntimeOverrides` rejects `activityBundleId` as a legacy runtime override.

Relevant files:

- `packages/web/src/state/chat-actions.ts`
- `packages/web/src/routes/$directory.chat.tsx`
- `packages/buddy/src/routes/session/targeting.ts`

This looks like an in-progress breakage or incomplete migration.

## 6. Some query fields look stale/dead

`PromptContextQuery` still includes things like `workspaceId` and `tokenBudget`, but the current prompt-context builder does not appear to use them materially.

This suggests some interface drift from the old system.

## 7. Practice/assessment sidecars are much easier to justify than raw-message sidecars

Practice and assessment events are already structured, high-signal, and explicitly pedagogical.
Running feedback decisions there makes sense.

Raw learner chat is noisier, so automatically interpreting every message is harder to justify.

## 8. Runtime inspector/debug story is actually better now

Buddy stores prompt injection audit and runtime inspector state in the teaching session state.
This is useful for diagnosing what context the main teacher got on a turn.

Relevant files:

- `packages/buddy/src/routes/session/message-transform.ts`
- `packages/buddy/src/routes/session/state.ts`
- `packages/buddy/src/routes/session/state-routes.ts`

## 9. No vendor code was changed

Important for future merges/subtree refreshes:

- no files under `vendor/` were modified in this pass

Everything changed in Buddy-owned packages instead.

## Recommendations: All Reasonable Options

Below are the realistic architecture options for where Buddy should go next.

## Option 1: Keep the sidecar, but gate and cache it

### Idea

Preserve the current artifact + sidecar architecture, but stop calling the sidecar interpreter on every accepted learner message.

### How it would work

- Always persist the raw learner `message` artifact.
- Add a cheap gate before `interpretMessage`.
- Only call the sidecar on pedagogically meaningful turns.
- Add reuse based on something like:
  - content digest
  - focus goals
  - scoped learner-state fingerprint / snapshot fingerprint

### Good triggers

- explicit confusion
- explanation of reasoning
- strong completion claim
- explicit stuck/help signal
- request for next step tied to learning progress
- correction/self-correction
- explicit progress reflection

### Good skip cases

- thanks
- ok
- continue
- go on
- social chatter
- tiny acknowledgements
- logistics/admin-only messages

### Pros

- smallest code change
- preserves current architecture
- immediate cost reduction
- easy to ship incrementally

### Cons

- still duplicates reasoning already done by the teacher
- still weaker than the main model because no chat history
- gating heuristics can miss subtle but important signals

### Cost/latency

- much lower than current system
- still more expensive than necessary in some cases

### When to choose it

Choose this if you want the fastest stabilization path with minimal architectural churn.

## Option 2: Fold learner-state updates into the main teacher turn

### Idea

The main teacher already has the full chat history plus learner context. Let that same model emit durable learner-state updates.

### How it would work

- add a dedicated learner-state mutation tool or structured side-channel
- teacher calls it only when a turn should create/update learner artifacts
- practice/assessment tools remain as explicit privileged signals

### Pros

- highest semantic correctness potential
- avoids duplicate reasoning
- no second model call needed for normal turns
- uses the model that already saw the conversation

### Cons

- more invasive change
- couples response quality and memory quality
- structured persistence becomes part of the main reply path
- may increase main-turn complexity and prompt burden

### Cost/latency

- lower extra-model cost
- could slightly raise main-turn latency/token use

### When to choose it

Choose this if full conversational understanding matters more than architectural separation, and you are ready to trust the main teacher with durable learner writes.

## Option 3: Hybrid classifier/extractor

### Idea

Add a tiny cheap classification step for free-chat learner messages. Only invoke the full structured extractor for likely high-signal turns.

### Example labels

- ignore
- evidence-candidate
- misconception-candidate
- clarification-needed
- replan-request
- uncertain

### How it would work

- raw learner message artifact always written
- tiny classifier runs on every accepted learner message
- extractor only runs on candidate/uncertain/high-signal turns
- material learner-state changes can invalidate plan cache or trigger plan refresh opportunities

### Pros

- best cost/quality tradeoff
- preserves clean artifact architecture
- lowers learner-store noise
- keeps the main teacher as live router
- makes free-chat memory more conservative

### Cons

- two-stage logic is more complex than option 1
- classifier recall must be tuned carefully

### Cost/latency

- very low average cost if most casual turns are skipped
- good production shape

### When to choose it

This is the best option for Buddy specifically.

## Option 4: Batch/background summarization

### Idea

Do not interpret raw learner messages inline. Persist them immediately and synthesize durable evidence/misconception state later in a debounced/background pass.

### How it would work

- accepted learner messages only create raw message artifacts in the foreground
- a later process summarizes a chunk of messages or recent session activity
- artifact mutations happen in background or on demand

### Pros

- lowest foreground latency
- better multi-turn reasoning for durable state
- avoids overreacting to tiny single-message signals

### Cons

- eventual consistency
- learner state lags behind the conversation
- more orchestration complexity

### Cost/latency

- cheapest chat path
- medium background cost

### When to choose it

Choose this if responsiveness matters most and immediate learner-memory freshness is not critical.

## Option 5: Explicit-tool-only updates

### Idea

Do not infer durable learner state from casual chat at all. Only mutate learner state through explicit tools and explicit pedagogical actions.

### How it would work

- no automatic interpret-message sidecar
- only explicit practice/assessment/reflection/etc. records create durable state

### Pros

- highest precision / trustworthiness
- simplest mental model
- cheapest and fastest

### Cons

- low recall for organic misconceptions emerging in free chat
- depends on the teacher reliably using tools

### Cost/latency

- minimal

### When to choose it

Choose this if artifact trustworthiness matters much more than coverage.

## My Recommendation For Buddy

Recommended steady-state design:

- Option 3: hybrid classifier/extractor

Recommended immediate short-term patch:

- Option 1: gate and cache the current sidecar

Why this fits Buddy best:

- the main teacher is already the real live router
- the main teacher already has history + learner digest
- the learner store should be conservative durable memory, not a second full routing brain
- explicit practice/assessment tools already serve as strong structured evidence sources
- planning already has a sensible on-demand cached shape

So the best shape is:

1. main teacher stays responsible for live teaching decisions
2. every accepted learner message becomes a raw message artifact
3. a cheap gate/classifier decides whether the message is worth durable interpretation
4. only high-signal turns call the small-model structured extractor
5. explicit practice/assessment remain privileged sources of truth
6. plan remains on-demand and query-scoped

## Planning Recommendation Specifically

I would not run a separate planner after every learner turn.

Instead:

- keep planning on-demand
- keep cache-by-input-hash
- refresh/recompute when there is a material learner-state change or explicit "what next" request

Material change examples:

- new evidence artifact
- new misconception artifact
- misconception resolved
- goal set replaced
- workspace/profile constraints changed

I would also tighten the current integration so the live teacher prompt does not casually rely on a potentially stale or unscoped latest plan artifact.

## Additional Notes The User Might Care About

### The rewrite is more auditable

Because the learner system is file-first, it is much easier to inspect what Buddy thinks happened pedagogically.
That is a real win.

### The rewrite is also more explicit about authority

The snapshot compiler is factual and artifact-derived only.
It does not pretend to be an authoritative blob store or silently mutate projections.

### The rewrite intentionally avoids hidden heuristic fallbacks

The architecture doc explicitly says there is no silent regex/heuristic fallback for pedagogical state mutation anymore.
That is philosophically consistent, even if the current trigger policy needs work.

### The teaching prompt system itself is pretty strong

The runtime prompt composition and prompt-injection diffing look like some of the stronger parts of the design.
Buddy is already doing a thoughtful job of keeping the main teacher context fresh without blindly resending everything.

### The current in-progress branch likely still has migration seams showing

Examples:

- `activityBundleId` mismatch between web and backend
- prompt-query fields that look stale
- uneven plan freshness between prompt path and UI/tool paths

So some rough edges may simply be because this is mid-migration.

## Bottom Line

What the other agent is building is directionally good:

- smarter than the old heuristic learner system
- cleaner architecture
- more explicit state
- better auditability
- better separation between factual storage, compiled context, and LLM decisions

But I do not think the final version should keep this exact policy:

- sidecar semantic learner interpretation on every accepted learner message

Buddy already has a smarter place to do live reasoning: the main teacher turn.
The learner-memory layer should probably become cheaper, more conservative, and more selective.

## Very Short Personal Recommendation

If I were steering the next iteration, I would do this:

1. keep artifacts
2. keep snapshot compiler
3. keep explicit practice/assessment feedback decisions
4. keep on-demand cached planning
5. stop running full interpret-message extraction on every accepted learner message
6. replace that with gated/cached or hybrid classification-plus-extraction

That preserves the good parts of the rewrite while fixing what currently feels over-eager.


--- oldmessage
Yes - after a deeper sweep, I think the key insight is this:
The main teacher is already the smart router.  
The new sidecar model is not really routing the conversation; it is trying to maintain durable learner memory.
You can see that in packages/buddy/src/learning/shared/compose-system-prompt.ts:45, where the teacher is told: “Do not wait for backend routing. Decide live from the learner’s message, the history, and the current learner state.”
So there are really 3 separate loops now:
How It Fits
- The live teaching loop runs through the normal session path in packages/buddy/src/routes/session/message-transform.ts:25; Buddy injects learner/runtime context, then OpenCode handles the real reply in the existing session.
- The main model sees the richest context: normal chat history plus Buddy’s injected prompt sections. Those prompt sections are diffed, so Buddy is not resending the full runtime prompt every turn; see packages/buddy/src/learning/runtime/prompt-injection.ts:167 and packages/buddy/src/learning/runtime/prompt-injection-policy.ts:27.
- The learner-memory loop runs only after the message is accepted, via packages/buddy/src/routes/session/message-transform.ts:225 and packages/buddy/src/learning/learner/orchestration/observe-message.ts:17.
- That sidecar interpreter does not see session history. It gets a fresh temporary session and only sees a compiled snapshot plus the current learner message in packages/buddy/src/learning/learner/decision/engine.ts:149 and packages/buddy/src/learning/learner/decision/prompt.ts:59.
- Planning is a third loop: on-demand, cached, mostly for UI/tools via packages/buddy/src/learning/learner/orchestration/plan.ts:23 and packages/web/src/state/chat-actions.ts:842.
What Feels Wrong In The Current Pass
- The sidecar interpretation currently runs on every accepted learner message in packages/buddy/src/learning/learner/orchestration/observe-message.ts:62.
- That means Buddy does one artifact/snapshot pass before the turn to build the teaching prompt, then another snapshot pass after accept to interpret the same message for memory.
- The sidecar cannot improve the current reply, because it runs after accept; it only affects future state.
- The sidecar is weaker than the main teacher for semantic understanding, because it lacks the real conversation history.
- The plan path is a bit uneven: the teacher prompt uses whatever latestPlan already exists via packages/buddy/src/learning/learner/service.ts:141, but does not call ensurePlanDecision. Worse, latestPlan in packages/buddy/src/learning/learner/compiler/snapshot.ts:140 is just “most recent plan artifact,” not obviously scoped to the current intent/focus goals.
So if your concern is “why is a second LLM getting learner context every message,” I agree with the concern. The live teaching model obviously needs context every turn. The separate memory-extraction model probably should not.
Options
1. Keep the sidecar, but gate and cache it
This is the lowest-risk fix. Keep the current artifact model and decision engine, but stop calling interpretMessage for every accepted message. Always persist the raw message artifact, but only run the sidecar when the turn looks pedagogically meaningful: explicit confusion, explicit completion claim, explanation of reasoning, practice result, correction, “I think X because Y,” “I’m stuck on…”, or a strong goal/focus shift. Also cache by contentDigest + scoped learner-state fingerprint + focusGoalIds, and skip if the exact same interpretation was already made. This fits naturally in packages/buddy/src/learning/learner/orchestration/observe-message.ts. Pros: smallest change, preserves the new architecture, immediate cost win. Cons: still snapshot-only, still duplicates some reasoning, and gating rules can miss subtle cases. I’d choose this if you want the fastest stabilization path.
2. Make the main teacher own learner-state updates
Here the teacher that already has the full chat history also emits the learner-memory update. In Buddy terms, that would mean adding a dedicated learner-state mutation tool or structured side-channel and letting the main teacher call it when a turn truly changes durable state. This is architecturally cleaner in one sense, because the model that actually understands the conversation is also the one writing memory. It also avoids the second LLM call. The downside is coupling: now reply generation and memory quality are tied together, and you are asking the main teaching turn to do more structured work. This is the highest-correctness option if you trust the main model and want the fewest duplicate inferences, but it is also the most invasive change to Buddy’s teaching flow.
3. Hybrid classifier/extractor (my recommendation)
This is the best fit for Buddy. Keep the current explicit artifact system. Keep practice and assessment updates exactly as first-class explicit records. But for normal free-chat learner messages, add a tiny front door that classifies the turn into something like ignore | candidate | material-change | replan | uncertain. Only candidate or uncertain turns call the structured extractor. This respects the fact that the main teacher already routes live using history, while the durable learner layer should be conservative and cheap. In practice: raw message artifact always, tiny gate/classifier on every accepted message, structured extractor only on likely pedagogical turns, plan refresh only on material change. Pros: strong cost/latency reduction, low artifact noise, preserves current architecture. Cons: more moving parts than option 1, and you need to tune recall carefully. For Buddy specifically, this is the best tradeoff.
4. Batch/background summarization
In this model, accepted learner messages only create raw message artifacts synchronously. Evidence, misconception, and state synthesis happen later: after N turns, on idle, on sidebar open, or in a background sweep. This reduces foreground latency a lot and lets the summarizer reason over multiple turns instead of overreacting to one short message. It also fits the file-artifact design well. The drawback is eventual consistency: the learner store lags behind the conversation, so the UI and future turns may temporarily see stale memory. I’d choose this if chat responsiveness matters more than immediate memory freshness.
5. Explicit-tool-only updates
This is the strictest model: no automatic post-message interpretation at all. Durable learner state changes only when Buddy explicitly records practice, assessment, maybe reflection, maybe a misconception note. This gives the cleanest and most trustworthy artifacts, and it is cheapest. But it misses a lot of organic learning signal from ordinary conversation. I’d choose this only if you care much more about precision than recall.
My Read On Planning
- Planning should stay on-demand and cached. That part in packages/buddy/src/learning/learner/orchestration/plan.ts:45 is actually pretty sensible.
- I would not run a separate planner every turn. The teacher already routes live.
- I would refresh plan only on material learner-state changes: new evidence, new/cleared misconception, goal-set replacement, workspace/profile constraint change, or explicit “what should I do next?”
- I would also fix the current prompt integration so the live prompt does not blindly use the latest arbitrary plan artifact from packages/buddy/src/learning/learner/compiler/snapshot.ts:140. Either scope it properly, or treat plan as UI-only unless it matches the current query.
What I’d Recommend For Buddy
- Near-term patch: option 1.
- Steady-state design: option 3.
- I would not keep “sidecar extraction on every learner message” as the final design.
Concrete target behavior
1. Main teacher remains the live router.
2. Every accepted learner message becomes a raw message artifact.
3. A cheap gate/classifier decides whether the turn is memory-worthy.
4. Only high-signal turns invoke the small structured extractor.
5. Practice and assessment tools remain privileged sources of truth.
6. Planning stays on-demand and query-scoped, not per-turn.
That gives Buddy:
- rich live tutoring from the main model,
- low-noise durable learner memory,
- much lower cost,
- less duplicated reasoning,
- fewer stale-plan weirdnesses.
If you want, next I can turn this into a concrete “recommended refactor plan” mapped file-by-file against the current diff.
