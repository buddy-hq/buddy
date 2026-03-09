# Buddy as a Learning Companion

Date: 2026-03-08

## Scope

This is an implementation-based product review of Buddy as a learning engine and companion.

It is not a code review.
It is not an architecture review.
It is not based on repo docs as authority.

It is grounded in the current behavior implied by:

- learner-state storage and orchestration in `packages/buddy/src/learning`
- session/runtime prompt shaping in `packages/buddy/src/routes/session`
- learner-facing web flows in `packages/web/src`
- Buddy teaching prompts and persona overlays where they materially affect learner experience

When I cite files below, I am using them as evidence for the implemented product behavior.

## Executive Summary

Buddy has several real ingredients of a serious learning product:

- goals are treated as observable performances, not vague topic labels
- practice, assessment, feedback, and misconception are separate concepts
- coding sessions have a real teaching workspace with checkpoints and diagnostics
- the runtime can steer by persona, intent, workspace state, and learner context

But as a learning companion, the product is still more of a notebook-centric teaching shell than a coherent learning engine.

The core problem is not that Buddy lacks learning concepts.
The core problem is that its learning concepts do not yet line up across storage, runtime, and UI.

The result is a system that:

- talks like a cross-session, cross-topic companion
- stores most meaningful learning state per workspace
- shows a "learning plan" that is mostly a thin snapshot plus a next-step suggestion
- exposes explicit learning controls that are partially unimplemented or currently broken
- relies heavily on model-written summaries instead of high-fidelity learner evidence

If the goal is to make Buddy feel like a true learning companion, the next phase should not add more prompts or more agent personas first.
It should tighten the pedagogical loop:

`goal -> task -> learner work -> verification -> evidence -> feedback -> next action`

Right now Buddy has pieces of that loop, but not a consistently operational version of it.

## What Buddy Is Right Now

In current implementation terms, Buddy is best described as:

- a folder-first local app that opens a notebook/project before it knows the learner ([packages/web/src/routes/chat.tsx:89](packages/web/src/routes/chat.tsx#L89), [packages/web/src/routes/chat.tsx:99](packages/web/src/routes/chat.tsx#L99))
- a chat system that injects a teaching runtime prompt per turn based on persona, intent, workspace state, and learner digest ([packages/buddy/src/routes/session/message-transform.ts:71](packages/buddy/src/routes/session/message-transform.ts#L71), [packages/buddy/src/routes/session/message-transform.ts:101](packages/buddy/src/routes/session/message-transform.ts#L101))
- a workspace-local learner artifact store for goals, practice, assessments, evidence, feedback, misconceptions, and decisions ([packages/buddy/src/learning/learner/artifacts/path.ts:18](packages/buddy/src/learning/learner/artifacts/path.ts#L18), [packages/buddy/src/learning/learner/artifacts/path.ts:27](packages/buddy/src/learning/learner/artifacts/path.ts#L27))
- a global learner profile with only coarse background/preferences fields ([packages/buddy/src/learning/learner/artifacts/path.ts:39](packages/buddy/src/learning/learner/artifacts/path.ts#L39), [packages/buddy/src/learning/learner/artifacts/types.ts:64](packages/buddy/src/learning/learner/artifacts/types.ts#L64))
- a "learning plan" UI that mostly renders current snapshot sections, open feedback, and available activity bundles, while deeper progress/alignment/actions remain empty placeholders ([packages/web/src/state/chat-actions.ts:863](packages/web/src/state/chat-actions.ts#L863), [packages/web/src/state/chat-actions.ts:868](packages/web/src/state/chat-actions.ts#L868), [packages/web/src/state/chat-actions.ts:882](packages/web/src/state/chat-actions.ts#L882))

That is a usable base for a learning product.
It is not yet a coherent companion model.

## Standard Buddy Should Meet

If Buddy is going to call itself a learning companion, the learner should be able to answer these questions at any time without guessing:

- What am I trying to learn right now?
- What evidence does Buddy have that I understand it or do not understand it?
- What should I do next?
- Why is that the next step instead of something else?
- What will count as success?
- What will Buddy remember from this session later?

Right now Buddy can answer parts of those questions in fragments across prompts, artifacts, and sidebar surfaces.
It cannot answer them consistently in one product story.

That gap is the central design problem.

## Critical Findings

### 1. Buddy claims learner-level continuity, but most real learning memory is workspace-local

This is the single biggest product inconsistency.

The current implementation stores:

- goals under `<workspace>/.buddy/learner/goals/...`
- practice under `<workspace>/.buddy/learner/practice/...`
- assessments under `<workspace>/.buddy/learner/assessments/...`
- evidence, feedback, misconceptions, and decisions under the same workspace root
- only the profile under `~/.buddy/profile/learner/profile.md`

Evidence:

- workspace learner root: [packages/buddy/src/learning/learner/artifacts/path.ts:18](packages/buddy/src/learning/learner/artifacts/path.ts#L18)
- workspace artifact directories: [packages/buddy/src/learning/learner/artifacts/path.ts:27](packages/buddy/src/learning/learner/artifacts/path.ts#L27)
- global profile only: [packages/buddy/src/learning/learner/artifacts/path.ts:39](packages/buddy/src/learning/learner/artifacts/path.ts#L39)
- snapshot compiler reads goals/evidence/feedback from `input.directory`, not a global learner graph: [packages/buddy/src/learning/learner/compiler/snapshot.ts:154](packages/buddy/src/learning/learner/compiler/snapshot.ts#L154), [packages/buddy/src/learning/learner/compiler/snapshot.ts:156](packages/buddy/src/learning/learner/compiler/snapshot.ts#L156), [packages/buddy/src/learning/learner/compiler/snapshot.ts:164](packages/buddy/src/learning/learner/compiler/snapshot.ts#L164)
- goal creation stamps each goal with the current workspace ID and workspace refs: [packages/buddy/src/learning/learner/orchestration/workspace.ts:33](packages/buddy/src/learning/learner/orchestration/workspace.ts#L33), [packages/buddy/src/learning/learner/orchestration/workspace.ts:36](packages/buddy/src/learning/learner/orchestration/workspace.ts#L36), [packages/buddy/src/learning/learner/orchestration/workspace.ts:52](packages/buddy/src/learning/learner/orchestration/workspace.ts#L52)

At the same time, multiple prompts and tool descriptions still speak as if Buddy has a cross-notebook learner store:

- goal-writer prompt: "writes to the cross-notebook learner store" ([packages/buddy/src/learning/goals/writer/goal-writer.p.md:33](packages/buddy/src/learning/goals/writer/goal-writer.p.md#L33))
- learner snapshot tool: "from the cross-notebook learner store" ([packages/buddy/src/learning/learner/tools/query.ts:6](packages/buddy/src/learning/learner/tools/query.ts#L6))

Why this matters pedagogically:

- mastery cannot truly accumulate across notebooks
- the learner can look "cold" again when they switch projects
- goals are easier to duplicate than refine
- Buddy cannot genuinely act like "I know what you have already learned" except at the level of a coarse profile

What to change:

- make canonical learner knowledge global by default: goals, evidence, misconceptions, feedback loops, and assessment history
- treat workspace-local state as context, not as the owner of the learner's knowledge
- keep workspace refs and local constraints, but make them links into a global learner graph
- if this is intentionally notebook-local, stop describing it as cross-notebook learner memory

### 2. The "learning plan" is not yet a real curriculum engine

Buddy presents a plan surface, but the current product only delivers a thin plan abstraction.

The snapshot and digest contain:

- active goals
- open feedback
- active misconceptions
- recent evidence
- a single next-step plan decision

But the parts a learner expects from a true learning plan are mostly absent:

- no real alignment model
- no mastery progression model
- no review queue
- no due items
- no action generation
- no topic graph
- no next-topic sequencing beyond one model-selected activity

Evidence:

- prompt-context `alignmentSummary` is only four counts: goals, evidence, open feedback, misconceptions ([packages/buddy/src/learning/learner/compiler/prompt-context.ts:32](packages/buddy/src/learning/learner/compiler/prompt-context.ts#L32))
- the web curriculum view hardcodes empty `alignmentSummary.records`, `incompleteGoalIds`, `recommendations`, and `actions` ([packages/web/src/state/chat-actions.ts:868](packages/web/src/state/chat-actions.ts#L868), [packages/web/src/state/chat-actions.ts:882](packages/web/src/state/chat-actions.ts#L882))
- the sidebar is built to show Actions, but only when `curriculumView.actions.length > 0`; today that list is always empty ([packages/web/src/components/layout/chat-right-sidebar.tsx:294](packages/web/src/components/layout/chat-right-sidebar.tsx#L294))
- the plan engine itself returns one `suggestedActivity` plus scaffolding/rationale, and falls back to `"goal-setting"` when nothing applies ([packages/buddy/src/learning/learner/orchestration/plan.ts:9](packages/buddy/src/learning/learner/orchestration/plan.ts#L9), [packages/buddy/src/learning/learner/orchestration/plan.ts:118](packages/buddy/src/learning/learner/orchestration/plan.ts#L118))

Why this matters pedagogically:

- the learner sees a planning surface but not a real path
- Buddy cannot sustain multi-session progress in a transparent way
- the learner cannot tell what is mastered, fragile, overdue, or blocked
- "plan" currently means "the model's next move," not "the learner's map"

What to change:

- separate `curriculum map` from `next-step decision`
- add explicit goal states such as `new`, `in progress`, `evidence emerging`, `stable`, `review due`
- generate concrete action objects instead of only markdown and a next activity
- introduce a review layer with due dates or revisit conditions
- let the plan surface answer learner questions like:
  - What am I working toward?
  - What is still weak?
  - What should I revisit today?
  - What should I do next and why?

### 3. Activity bundle steering is advertised as first-class, but is currently inconsistent and likely broken

This is a trust-breaking issue because the UI advertises an explicit learner control that the backend rejects.

The UI:

- displays Activity Bundles in the right sidebar as a way to "explicitly steer Buddy into a concrete activity bundle for the next turn" ([packages/web/src/components/layout/chat-right-sidebar.tsx:326](packages/web/src/components/layout/chat-right-sidebar.tsx#L326))
- sends `activityBundleId` when the learner clicks one ([packages/web/src/routes/$directory.chat.tsx:1245](packages/web/src/routes/$directory.chat.tsx#L1245), [packages/web/src/state/chat-actions.ts:581](packages/web/src/state/chat-actions.ts#L581))

But the backend session targeting layer rejects `activityBundleId` as a legacy unsupported field:

- [packages/buddy/src/routes/session/targeting.ts:102](packages/buddy/src/routes/session/targeting.ts#L102)

At the same time, the runtime still contains half-wired support for explicit activity bundles:

- prompt injection has an `activity-bundle-explicit` trigger ([packages/buddy/src/learning/runtime/prompt-injection-policy.ts:15](packages/buddy/src/learning/runtime/prompt-injection-policy.ts#L15), [packages/buddy/src/learning/runtime/prompt-injection-policy.ts:79](packages/buddy/src/learning/runtime/prompt-injection-policy.ts#L79))
- the composed system prompt supports a `selected_activity_bundle` section ([packages/buddy/src/learning/shared/compose-system-prompt.ts:189](packages/buddy/src/learning/shared/compose-system-prompt.ts#L189), [packages/buddy/src/learning/shared/compose-system-prompt.ts:335](packages/buddy/src/learning/shared/compose-system-prompt.ts#L335))
- but `createSessionMessageTransform` never resolves or passes an activity bundle into `buildLearningSystemPrompt` ([packages/buddy/src/routes/session/message-transform.ts:101](packages/buddy/src/routes/session/message-transform.ts#L101))

This is not just a missing feature.
It is a product contradiction:

- the learner is shown a steering wheel
- the request payload contains the steering signal
- the server treats that signal as unsupported legacy input

What to change:

- either fully implement activity-bundle steering now
- or remove/hide it from the UI until it actually works

If implemented, the flow should be:

- learner selects a bundle
- bundle is accepted by the backend
- bundle is reflected in runtime state
- bundle changes the next turn prompt
- bundle optionally spawns a concrete task object, not just a wording hint

### 4. Activity bundles are still mostly meta-instructions, not operational teaching moves

The activity bundle layer looks pedagogically rich on paper, but in implementation it often produces meta-plans rather than concrete learner work.

The bundle registry promises things like:

- guided attempt
- practice evidence
- assessment evidence
- follow-up action

Evidence:

- bundle definitions and promised outputs: [packages/buddy/src/learning/runtime/activity-bundles.ts:13](packages/buddy/src/learning/runtime/activity-bundles.ts#L13), [packages/buddy/src/learning/runtime/activity-bundles.ts:96](packages/buddy/src/learning/runtime/activity-bundles.ts#L96), [packages/buddy/src/learning/runtime/activity-bundles.ts:169](packages/buddy/src/learning/runtime/activity-bundles.ts#L169)

But the generic activity tools currently just return structured text plans:

- tool execution builds output with `definition.buildOutput(...)` and returns it as `output` ([packages/buddy/src/learning/activities/tools/catalog.ts:410](packages/buddy/src/learning/activities/tools/catalog.ts#L410), [packages/buddy/src/learning/activities/tools/catalog.ts:425](packages/buddy/src/learning/activities/tools/catalog.ts#L425), [packages/buddy/src/learning/activities/tools/catalog.ts:428](packages/buddy/src/learning/activities/tools/catalog.ts#L428))

That means the system often has:

- a bundle definition
- a skill
- maybe a subagent
- maybe a tool

But not a canonical task object with:

- one activity ID
- one deliverable
- one success criterion
- one verification method
- one closure event

Why this matters:

- the system can sound pedagogically intentional without actually running a clear learning loop
- the learner gets advice about the activity instead of the activity becoming a first-class object
- state mutation depends on whether the model remembers to also call `learner_practice_record` or `learner_assessment_record`

What to change:

- introduce a canonical `learning task` entity
- require each bundle to produce either:
  - a task object
  - a verified assessment event
  - or a deterministic workspace exercise object
- make bundles operational rather than descriptive

### 5. Evidence quality is too summary-based and too easy for the model to fabricate

Buddy does record evidence, which is good.
But the evidence model is too summary-heavy for a serious learning companion.

Current behavior:

- learner messages are stored, then an LLM decides whether to create evidence or a misconception ([packages/buddy/src/learning/learner/orchestration/observe-message.ts:34](packages/buddy/src/learning/learner/orchestration/observe-message.ts#L34), [packages/buddy/src/learning/learner/orchestration/observe-message.ts:67](packages/buddy/src/learning/learner/orchestration/observe-message.ts#L67), [packages/buddy/src/learning/learner/orchestration/observe-message.ts:123](packages/buddy/src/learning/learner/orchestration/observe-message.ts#L123))
- practice records are keyed off `learnerResponseSummary`, and evidence uses that summary directly ([packages/buddy/src/learning/learner/orchestration/record-practice.ts:32](packages/buddy/src/learning/learner/orchestration/record-practice.ts#L32), [packages/buddy/src/learning/learner/orchestration/record-practice.ts:73](packages/buddy/src/learning/learner/orchestration/record-practice.ts#L73))
- assessment records are keyed off `summary` and optional `learnerResponseSummary`, and evidence uses `summary` directly ([packages/buddy/src/learning/learner/orchestration/record-assessment.ts:29](packages/buddy/src/learning/learner/orchestration/record-assessment.ts#L29), [packages/buddy/src/learning/learner/orchestration/record-assessment.ts:60](packages/buddy/src/learning/learner/orchestration/record-assessment.ts#L60))
- artifact types do not store raw submission pointers, checker outputs, or verification provenance ([packages/buddy/src/learning/learner/artifacts/types.ts:114](packages/buddy/src/learning/learner/artifacts/types.ts#L114), [packages/buddy/src/learning/learner/artifacts/types.ts:133](packages/buddy/src/learning/learner/artifacts/types.ts#L133), [packages/buddy/src/learning/learner/artifacts/types.ts:154](packages/buddy/src/learning/learner/artifacts/types.ts#L154))

Why this matters:

- the model can overstate evidence quality
- Buddy can record "progress" from paraphrases instead of real learner work
- assessment memory is not easily auditable
- later planning decisions depend on summaries that may flatten important details

For a learning product, evidence should get more concrete as the stakes rise.
Right now it often gets more abstract.

What to change:

- attach raw evidence references whenever possible:
  - learner message IDs
  - code file path plus revision
  - answer text
  - checker output
  - rubric result
- add provenance fields such as:
  - `verifiedBy`
  - `verificationMethod`
  - `artifactRef`
  - `confidence`
- distinguish between:
  - self-report
  - observed attempt
  - verified success

## High-Impact Findings

### 6. Learner modeling exists in the backend, but barely exists in the product

Buddy has a meaningful learner/workspace patch surface:

- workspace label, tags, pinned goals, project constraints, local tools, preferred surfaces, motivation context, opportunities
- profile background, known prerequisites, time patterns, environment limits, motivation anchors, learner preferences

Evidence:

- patch schema in learner orchestration: [packages/buddy/src/learning/learner/orchestration/workspace.ts:62](packages/buddy/src/learning/learner/orchestration/workspace.ts#L62)
- patch route exists: [packages/buddy/src/routes/learner.ts:246](packages/buddy/src/routes/learner.ts#L246)

But the main settings/product surface only exposes:

- default persona
- default intent
- model/provider
- log level

Evidence:

- settings tabs are only `general` and `providers`: [packages/web/src/components/settings-modal.tsx:41](packages/web/src/components/settings-modal.tsx#L41)
- general settings are notebook defaults, not learner model inputs: [packages/web/src/components/settings-modal.tsx:235](packages/web/src/components/settings-modal.tsx#L235)
- the project-settings save path only patches `default_persona`, `default_intent`, `model`, and `logLevel`: [packages/web/src/state/project-settings.ts:195](packages/web/src/state/project-settings.ts#L195)

The onboarding is also notebook-first and generic:

- open a folder
- start your learning journey
- ask anything

Evidence:

- folder-first landing page: [packages/web/src/routes/chat.tsx:99](packages/web/src/routes/chat.tsx#L99)
- generic chat empty state: [packages/web/src/components/chat/chat-empty-state.tsx:4](packages/web/src/components/chat/chat-empty-state.tsx#L4)

Why this matters:

- Buddy cannot personalize well without learner inputs
- the backend has fields for constraints and motivation, but the learner is rarely asked for them
- the companion feels generic unless the user manually narrates their context in chat

What to change:

- add a learner setup flow on first use
- make the learner profile visible and editable
- let the learner set:
  - current goals
  - prior knowledge
  - time budget
  - preferred challenge level
  - why this matters right now
- let the plan surface show which of these inputs are influencing the current path

### 7. Interactive code learning has good mechanics but weak pedagogical scaffolding

The code-learning surface is one of Buddy's strongest foundations.
It has:

- a tracked teaching workspace
- checkpoint/restore
- multiple tracked files
- conflict handling
- LSP diagnostics

Evidence:

- workspace creation and files/checkpoints: [packages/buddy/src/learning/teaching/service.ts:476](packages/buddy/src/learning/teaching/service.ts#L476)
- editor panel with accept/restore step actions: [packages/web/src/components/teaching/teaching-editor-panel.tsx:266](packages/web/src/components/teaching/teaching-editor-panel.tsx#L266)

But the pedagogical start state is too empty:

- `initialCode()` returns `""` ([packages/buddy/src/learning/teaching/service.ts:33](packages/buddy/src/learning/teaching/service.ts#L33))
- creating a new teaching workspace writes an empty lesson file and empty checkpoint ([packages/buddy/src/learning/teaching/service.ts:491](packages/buddy/src/learning/teaching/service.ts#L491), [packages/buddy/src/learning/teaching/service.ts:518](packages/buddy/src/learning/teaching/service.ts#L518))
- starting an interactive lesson sends a generic prompt asking the model to "set up the next hands-on step" ([packages/web/src/routes/$directory.chat.tsx:1568](packages/web/src/routes/$directory.chat.tsx#L1568))

So the teaching mechanics are real, but the actual lesson design is still improvised per session.

Why this matters:

- interactive mode feels like "agent with a side editor," not a designed lesson system
- exercise quality depends too much on model initiative
- checkpoints mark acceptance, but not acceptance against an explicit rubric

What to change:

- bind interactive lessons to goals or tasks before the workspace opens
- create initial scaffolds from task templates, not blank files
- store explicit exercise metadata:
  - objective
  - deliverable
  - rubric
  - deterministic checker if any
  - hints allowed
  - completion rule
- make checkpoint acceptance update learner evidence with verification provenance

### 8. Math support is promising but currently too thin as a learning surface

Math Buddy has a strong prompt stance around figure usage, but the product surface is explicitly a placeholder.

Evidence:

- math figure panel says there is "no dedicated figure canvas or history panel yet" ([packages/web/src/components/teaching/math-figure-panel.tsx:13](packages/web/src/components/teaching/math-figure-panel.tsx#L13))

Right now math has:

- inline figure rendering in chat
- no persistent figure workspace
- no figure history
- no side-by-side proof and figure flow
- no learner manipulation or annotation loop

Why this matters:

- many math lessons need stable visual reference, not one transient inline image
- the lack of a figure surface reduces the pedagogical advantage of having math-specific tooling

What to change:

- add figure history and pinning
- allow Buddy to reference previous figures by stable IDs in the visible UI
- support a side-by-side flow: current proof step on one side, active figure on the other
- allow learner annotations or at least figure state reuse

### 9. Session teaching continuity is brittle because runtime state is in-memory only

Current teaching session state is stored in a process-local `Map`.

Evidence:

- [packages/buddy/src/learning/runtime/session-state.ts:5](packages/buddy/src/learning/runtime/session-state.ts#L5)

That state includes things like:

- persona
- intent override
- focus goal IDs
- prompt injection cache
- runtime inspector state

Why this matters:

- restart the backend and active teaching context disappears
- the learner may still see a session, but the runtime no longer "remembers" the exact pedagogical framing
- this weakens continuity for longer learning arcs

What to change:

- persist runtime session state
- or reconstruct it deterministically from session history and learner artifacts
- at minimum persist focus goals, current task, and current surface

### 10. Buddy still has an identity split: project tutor vs true learning companion

There are two product identities competing in the current implementation:

Identity A:

- Buddy as a notebook-local tutor for the current project

Identity B:

- Buddy as a long-horizon companion that remembers what the learner knows

Signals for A:

- folder-first entry
- workspace-local learning memory
- notebook-specific settings
- learning plan labeled per workspace

Signals for B:

- prompts and tools talking about learner state and cross-session continuity
- goal system framed as durable learning objectives
- global profile

The problem is not that both identities exist.
The problem is that the current product does not yet resolve which one owns the truth.

As a result:

- the learner experience overpromises continuity
- the UI acts local while the prompts act global
- the pedagogy feels inconsistent in scope

What to change:

- pick the canonical unit of learning
- if it is the learner, globalize the real memory
- if it is the notebook, simplify the language and stop implying broader continuity

## Important Secondary Findings

### 11. Practice-first is more a prompt norm than an enforced product loop

Buddy repeatedly says practice should be the main learning engine.
That principle is present in prompts and bundle definitions.

But the product does not consistently enforce it.

Evidence:

- practice-first bundle catalog and runtime permissions exist ([packages/buddy/src/learning/runtime/activity-bundles.ts:83](packages/buddy/src/learning/runtime/activity-bundles.ts#L83))
- the base prompt tells Buddy to prefer explanation only as much as needed before practice ([packages/buddy/src/learning/companion/buddy-base.p.md:18](packages/buddy/src/learning/companion/buddy-base.p.md#L18))

Still, there is no strong closure rule such as:

- every goal-focused session must end in either assigned practice, verified assessment, or explicit deferment
- explanation-only stretches must become tasks after a threshold
- suggested next activity must surface as an actual action object

What to change:

- formalize a session-level closure rule
- if a plan says `practice`, the UI and runtime should help instantiate a practice task
- if the learner only chats conceptually for too long, Buddy should ask whether to turn that into practice

### 12. Goal-writing is one of the strongest parts of Buddy, but it is too isolated from the rest of the product

This is a genuine strength.

The goal system has:

- a dedicated goal-writing agent
- scope selection
- deterministic linting
- explicit observability and testability rules

Evidence:

- goal-writer tool flow and CWSEI-style rigor: [packages/buddy/src/learning/goals/writer/goal-writer.p.md:23](packages/buddy/src/learning/goals/writer/goal-writer.p.md#L23), [packages/buddy/src/learning/goals/writer/goal-writer.p.md:38](packages/buddy/src/learning/goals/writer/goal-writer.p.md#L38), [packages/buddy/src/learning/goals/writer/goal-writer.p.md:118](packages/buddy/src/learning/goals/writer/goal-writer.p.md#L118)

But it is isolated because:

- goals are not a visible managed surface in the web app
- focus goal selection is not a persistent learner-facing workflow
- prerequisite/build/reinforcement edges are structurally present but never actually populated ([packages/buddy/src/learning/learner/artifacts/types.ts:95](packages/buddy/src/learning/learner/artifacts/types.ts#L95))

What to change:

- make goals a first-class visible object in the plan UI
- let learners pin, merge, revise, retire, and focus goals
- actually use goal relationships for sequencing and review

### 13. The product does not yet have a meaningful notion of review or retention

Buddy includes retrieval-check and transfer-check as activity names, which is good.
But there is no operational review engine.

Evidence:

- bundle names exist for retrieval/transfer checks ([packages/buddy/src/learning/runtime/activity-bundles.ts:192](packages/buddy/src/learning/runtime/activity-bundles.ts#L192), [packages/buddy/src/learning/runtime/activity-bundles.ts:210](packages/buddy/src/learning/runtime/activity-bundles.ts#L210))
- there is no artifact kind for scheduled review, retention state, or due queue in the learner schema ([packages/buddy/src/learning/learner/artifacts/types.ts:6](packages/buddy/src/learning/learner/artifacts/types.ts#L6))

What to change:

- add review items as first-class objects
- compute `due now`, `due soon`, and `overdue`
- use evidence recency and success quality to schedule revisits
- make review visible in the plan, not only available as a possible bundle name

### 14. Transparency exists as a runtime inspector, not as a learner-facing explanation model

Buddy does have a meaningful transparency surface, but it is mainly diagnostic.

Evidence:

- the right sidebar exposes a Runtime Inspector with prompt-injection triggers, capability gating, runtime agent choice, learner digest, and prompt sections ([packages/web/src/components/layout/chat-right-sidebar.tsx:381](packages/web/src/components/layout/chat-right-sidebar.tsx#L381), [packages/web/src/components/layout/chat-right-sidebar.tsx:397](packages/web/src/components/layout/chat-right-sidebar.tsx#L397), [packages/web/src/components/layout/chat-right-sidebar.tsx:483](packages/web/src/components/layout/chat-right-sidebar.tsx#L483))

This is useful for developers and advanced users.
But it is not the same thing as learner-facing metacognitive support.

The learner still does not get a clean explanation of:

- which evidence is being trusted
- which beliefs are verified versus inferred
- why a recommendation was selected
- what missing evidence would change the recommendation

Why this matters:

- a learning companion should improve the learner's self-model, not only the system's hidden model
- trust comes from inspectable pedagogical reasoning, not just hidden runtime sophistication
- the learner should be able to challenge or correct Buddy's view of their understanding

What to change:

- convert part of the runtime inspector into a learner-facing explanation surface
- attach "why this next" and "evidence used" to recommendations
- clearly label inferred beliefs versus verified observations
- let the learner dispute or revise Buddy's belief state directly

## Strong Foundations Worth Preserving

Buddy already has several unusually strong building blocks.
These should be preserved and sharpened, not thrown away.

### 1. Goals are defined as demonstrable performances

This is the right foundation for a serious learning product.
Buddy is already better than most AI tutors here.

### 2. Practice, assessment, feedback, and misconception are separate concepts

That separation is pedagogically useful.
It creates room for a real evidence-driven loop.

### 3. The coding workspace is a real teaching surface, not just a code block in chat

Checkpoints, tracked files, restore, and diagnostics are strong.
This can become a real lesson engine with better exercise modeling.

### 4. Persona-specific capability gating is directionally correct

Buddy does not treat every session as the same teaching context.
That is good.
The problem is product completion, not the existence of the runtime model.

## Recommended Product Direction

If the goal is "Buddy should feel like a true learning companion," I would recommend the following redesign direction.

## Non-Negotiable Design Invariants

Before the phase plan, these are the product rules I would treat as non-negotiable:

- no learner-facing control should appear in the UI unless the backend actually honors it
- no learning recommendation should exist without visible evidence or an explicit statement that it is an inference
- every active goal should have either a next task, a review state, or a blocked reason
- every meaningful practice or assessment step should create a durable artifact with provenance
- global-companion language should only be used if memory is actually global
- task completion should be verifiable, not only narrated

If Buddy follows these invariants, a lot of smaller design decisions become easier.
If it does not, new prompts and surfaces will keep drifting apart.

### Phase 1: Remove trust-breaking inconsistencies

Do this first.

- either wire `activityBundleId` end-to-end or remove the UI affordance
- stop using "cross-notebook learner store" language until the implementation matches it
- make the plan UI honest about what it currently is
- persist or reconstruct teaching runtime session state

### Phase 2: Make learner memory canonical and global

This is the biggest design decision.

Suggested model:

- global learner graph:
  - goals
  - evidence
  - feedback loops
  - misconceptions
  - review items
  - subject/topic clusters
- workspace context:
  - current project
  - local constraints
  - linked goals
  - local artifacts
- session context:
  - active goals
  - active task
  - current surface
  - current scaffold level

The workspace should shape the session.
It should not own the learner's knowledge.

### Phase 3: Introduce a first-class task model

Buddy needs a canonical unit between `goal` and `evidence`.

That unit should be `task`.

Each task should include:

- `taskId`
- `goalIds`
- `kind`
- `surface`
- `instructions`
- `deliverable`
- `successCriteria`
- `scaffoldingLevel`
- `verificationMethod`
- `status`

Then the loop becomes operational:

- plan suggests or instantiates a task
- learner attempts the task
- Buddy verifies it
- evidence is recorded against the task
- feedback resolves or opens loops
- the next plan uses actual task outcomes

### Phase 4: Upgrade evidence fidelity

Evidence should store more than summaries.

Add:

- raw submission refs
- code file paths and revisions
- checker output
- rubric judgments
- assistant confidence
- verification provenance

This is what makes later planning believable.

### Phase 5: Add a learner-facing control plane

Buddy needs a place where the learner can explicitly manage their own learning state.

Minimum viable surfaces:

- learner profile
- active goals
- current focus goals
- open feedback loops
- review due
- evidence timeline

Without this, Buddy remains mostly opaque.

### Phase 6: Turn interactive lessons into actual lesson objects

For code:

- start from an exercise template, not a blank file
- bind each lesson to one or more goals
- define acceptance criteria before the learner starts
- record checkpoint acceptance as verified evidence

For math:

- create a persistent figure workspace
- connect figures to proof steps and tasks
- let the learner revisit previous figures

## How To Know The Redesign Is Working

Buddy should not judge progress by "the assistant produced a good-looking lesson."
It should judge progress by whether the learning loop became operational and inspectable.

Good product metrics would be:

- percent of active goals with an explicit next task
- percent of tasks with a stored deliverable and verification method
- percent of evidence items with raw artifact references instead of summary-only text
- percent of sessions that end with one of:
  - verified evidence
  - assigned next task
  - explicit deferment reason
- percent of recommendations that expose "why this next" in the UI
- success rate of restoring the same teaching context after backend restart
- number of duplicate goals created across workspaces for the same learner concept

Good learner-facing signs would be:

- switching notebooks does not erase Buddy's sense of what the learner knows
- the learner can see why Buddy thinks a topic is weak or stable
- recommendations feel earned by evidence rather than improvised by tone
- interactive lessons start from a real exercise with visible success criteria
- review and revisit behavior happens automatically, not only when the learner remembers to ask

## Suggested Product Positioning

Right now Buddy is closest to:

"A local notebook tutor with emerging learning-memory features."

It is not yet fully:

"A long-horizon learning companion that knows what you know, what is weak, what is due, and what should happen next."

That second positioning is still achievable.
But it will require a shift from prompt-rich pedagogy to state-rich pedagogy.

In practical terms, that means:

- less emphasis on adding more teaching language
- more emphasis on making learning objects real and durable

## Bottom Line

Buddy already has a better learning vocabulary than most AI coding or tutoring products.

What it lacks is not educational intent.
What it lacks is product closure:

- the learner model is not yet truly canonical
- the plan is not yet operational
- evidence is too summary-based
- the UI still exposes unfulfilled teaching affordances

If you solve those four things, Buddy can become a real learning companion.

If you do not solve those four things, Buddy will remain a capable chat agent with learning-themed prompts and some excellent but disconnected pedagogical pieces.
