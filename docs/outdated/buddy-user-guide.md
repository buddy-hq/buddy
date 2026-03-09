# Buddy User Guide

This guide explains how Buddy works today, how to use it well, and what actually happens in the backend when you interact with it.

It is intentionally transparent. Buddy is an open-source agent product. The point of this guide is not only to tell you which buttons to click, but also to help you understand the runtime model behind those buttons.

If you want the implementation source of truth, read:

- [buddy-core.spec.md](/Users/prashantbhudwal/Code/buddy/buddy-core.spec.md)
- [runtime definitions](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/runtime/definitions.ts)
- [runtime compiler](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/runtime/compiler.ts)
- [adaptive router](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/runtime/router.ts)
- [session route](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/routes/session.ts)

## 1. Read This First

Buddy is not a chat app with a few cosmetic modes.

It is a teaching runtime built on top of vendored OpenCode. Every normal message you send is shaped by:

- the persona you picked
- the instructional strategy in effect
- whether `Auto` is allowed to change that strategy
- the current learner state
- the current workspace context
- the available teaching surfaces for that persona

The shortest correct mental model is:

- `persona` = which teacher/runtime agent is active
- `strategy` = how that teacher is trying to teach right now
- `Auto` = whether Buddy may change strategy for the next turn
- `chat` = the transport, not a separate teaching mode
- `Learning Plan` = the generated view of learner state for this workspace

There is no separate “chat mode” versus “understand mode”. You always use chat. `Understand`, `Practice`, and `Check` are teaching strategies that change the prompt, tool policy, preferred subagents, and expected behavior behind the chat.

## 2. The Core Runtime Model

Buddy’s runtime has three user-visible control axes and two backend-only axes.

### User-visible axes

- `persona`
  `Buddy`, `Code Buddy`, `Math Buddy`
- `instructionalStrategy`
  `Understand`, `Practice`, `Check`
- `adaptivity`
  `Auto` on or off

### Backend axes

- `activity`
  The concrete move Buddy is trying to make right now, such as `goal-setting`, `explanation`, `guided-practice`, `independent-practice`, or `mastery-check`.
- `workspaceState`
  Whether Buddy is working only in chat, or whether there is an active interactive teaching workspace.

When you send a normal message, Buddy compiles those pieces into one runtime profile. That profile determines:

- which runtime agent actually receives the message
- which surfaces should be visible
- which tools are allowed or denied
- which internal subagents are preferred
- what teaching contract is injected into the system prompt

## 3. What You Control in the UI

The main composer exposes four important controls.

### Persona picker

This chooses the active teaching persona for the session.

Use it when the domain changes:

- `Buddy`
  General learning companion for mixed-topic study, planning, recap, and broad project learning.
- `Code Buddy`
  Coding-focused teacher with the editor workspace available.
- `Math Buddy`
  Math-focused teacher with figure tools available.

### Strategy selector

This chooses the current teaching stance:

- `Understand`
  Conceptual explanation, framing, worked examples, and misconception repair.
- `Practice`
  Deliberate practice, hints, and skill-building through doing.
- `Check`
  Inline mastery check to generate evidence, not grades.

### Auto

`Auto` is not a fourth strategy.

It means Buddy may choose the effective strategy for the next turn by reading:

- your latest message
- the current session state
- the current learner digest

### Learning Plan sidebar

The right sidebar is not a manually edited curriculum file. It is a generated view built from:

- workspace context
- learner store records
- derived progress/review/alignment projections

Use it to understand what Buddy currently thinks is happening, not to author the system state directly.

## 4. Persona Matrix

These are the personas that ship in the current UI.

| Persona | Runtime Agent | Default Strategy | Surfaces | Base Capabilities |
| --- | --- | --- | --- | --- |
| `Buddy` | `buddy` | `instruction` | `curriculum` | learner-state reads, practice recording, assessment recording |
| `Code Buddy` | `code-buddy` | `practice` | `curriculum`, `editor` | learner-state tools plus lesson/editor tools |
| `Math Buddy` | `math-buddy` | `instruction` | `curriculum`, `figure` | learner-state tools plus figure rendering tools |

Source:

- [persona registry](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/personas/registry.ts)

### What this means in practice

- `Buddy` is the least opinionated persona. Use it when you want broad help, planning, and teaching without a specialized surface.
- `Code Buddy` is the only persona that gets the editor teaching workspace. If you want file-backed lessons, use this.
- `Math Buddy` is the only persona that gets figure tools by default. If diagrams materially help, use this.

## 5. Strategy Matrix

Strategies are not cosmetic labels. They change the runtime contract.

Source:

- [strategy definitions](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/runtime/definitions.ts)

| UI Label | Internal ID | Default Activities | Tool Policy | Preferred Helpers |
| --- | --- | --- | --- | --- |
| `Understand` | `instruction` | `explanation`, `worked-example` | allows learner-state reads, denies practice and assessment recording | analogy-oriented helpers, no practice or assessment subagent by default |
| `Practice` | `practice` | `guided-practice`, `independent-practice` | allows learner-state reads, practice recording, and assessment recording | `practice-agent`, feedback/hint helpers |
| `Check` | `assessment` | `mastery-check`, `review`, `reflection` | allows learner-state reads and assessment recording, denies practice recording | `assessment-agent`, rubric/solution helpers |

### The practical meaning

- `Understand` should move you toward clarity quickly, then toward meaningful practice.
- `Practice` is the main learning engine. If you stay only in `Understand`, you are usually underusing Buddy.
- `Check` is for evidence. Use it after explanation or practice, not as the default first move.

## 6. Tool Model

Tools in Buddy are backend capabilities. They are not separate buttons in the main UI.

The active runtime profile decides which tools are available for the current turn.

Tool access is an intersection:

- persona enables the broad capability family
- strategy can still allow or deny specific tools for the current turn

Example:

- `Code Buddy` gives the runtime access to editor/lesson tools
- `Understand` can still deny `practice_record` and `assessment_record`
- `Practice` can re-enable `practice_record`

### Learning-plan tools

- `curriculum_read`
  Reads the generated Learning Plan view for the current workspace.
- `curriculum_update`
  Deprecated. It intentionally tells the agent that the Learning Plan is generated and should not be edited directly.

### Goal tools

- `goal_decide_scope`
  Helps determine the right scope for a goal set.
- `goal_lint`
  Validates goals before they are committed.
- `goal_commit`
  Persists validated goals to the learner store.
- `goal_state`
  Returns workspace-relevant goals.

### Learner-state tools

- `learner_state_query`
  Reads scoped learner state.
- `practice_record`
  Records a practice attempt or meaningful practice outcome.
- `assessment_record`
  Records assessment evidence.

### Code Buddy teaching tools

- `teaching_start_lesson`
- `teaching_checkpoint`
- `teaching_add_file`
- `teaching_set_lesson`
- `teaching_restore_checkpoint`

These are only available when the persona and runtime support the interactive lesson workspace.

### Math Buddy figure tools

- `render_figure`
- `render_freeform_figure`

These are only available when the persona supports the figure surface.

### What users should take from this

You do not manually call most of these tools from the UI. The agent calls them if the current runtime profile allows them.

If you want to influence tool usage:

- pick the right persona
- pick the right strategy
- keep `Auto` on only when you want Buddy to steer

## 7. Internal Agents and Services

Buddy has a small set of user-facing runtime agents and a separate set of internal helpers.

### User-facing runtime agents

- `buddy`
- `code-buddy`
- `math-buddy`

These correspond to the personas in the UI.

### Internal subagents

- `curriculum-orchestrator`
- `goal-writer`
- `practice-agent`
- `assessment-agent`

These are registered in:

- [buddy-agents.ts](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/agent-kit/buddy-agents.ts)

They are not directly exposed in the current UI.

### Internal services

Some spec concepts are services, not chatty agents:

- feedback engine
- progress recorder
- sequencer
- alignment auditor

These shape learner state and projections, but you do not invoke them directly from the composer.

### Can you execute a subagent directly?

Not from the current web UI.

The web product exposes persona selection, not raw subagent execution. The backend can still route to subagents automatically, and the API still supports an explicit raw `agent` field, but the main product path is:

- choose a persona
- send a normal message
- let the runtime delegate internally when needed

Direct `@agent` execution is not currently exposed in the composer. `mentionableAgents` is intentionally empty in the main chat route.

## 8. Normal Chat vs Slash Commands

This matters.

### Normal chat messages

A normal message goes through the Buddy teaching runtime.

That means the backend:

1. resolves persona, strategy, activity, and adaptivity
2. loads the workspace context
3. queries the learner store for a prompt digest
4. optionally runs the adaptive router if `Auto` is on
5. compiles a runtime profile
6. composes a Buddy teaching system prompt
7. sends the request to the selected runtime agent

If you want Buddy to teach, explain, practice, or check understanding, use a normal message.

### Slash commands

Slash commands go through the session command path, not the teaching prompt path.

Current built-in slash commands include:

- `/new`
- `/persona`
- `/model`
- `/mcp`

Slash commands are for control and operational actions. They do not go through the same Buddy teaching system-prompt assembly as normal messages.

That means:

- use normal chat for learning
- use slash commands for runtime/session controls

Do not rely on `/...` commands for `Understand`, `Practice`, or `Check` behavior.

## 9. What Happens When You Send a Normal Message

This is the real backend path.

Source:

- [session route](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/routes/session.ts)
- [system prompt assembly](/Users/prashantbhudwal/Code/buddy/packages/buddy/src/learning/shared/compose-system-prompt.ts)

### Step 1: Buddy resolves the target persona

The backend accepts either:

- `persona`
- or a raw `agent` override

The web UI uses `persona`.

Buddy maps that to a runtime agent:

- `Buddy` -> `buddy`
- `Code Buddy` -> `code-buddy`
- `Math Buddy` -> `math-buddy`

### Step 2: Buddy resolves strategy and adaptivity

The backend reads:

- requested strategy from the UI
- requested adaptivity from the UI
- notebook defaults if the UI did not override them

### Step 3: Buddy loads learner context

Buddy ensures workspace context exists, then queries the learner store for a scoped digest.

That digest includes:

- whether this is a cold start
- workspace label and tags
- relevant goal IDs
- recommended next action
- constraints summary
- open feedback actions
- session-plan summary
- alignment summary
- tiered prompt context

### Step 4: Buddy observes your latest message

Buddy records the learner message against the session and relevant goals before compiling the runtime profile.

### Step 5: If `Auto` is on, Buddy runs the adaptive router

The router inspects your latest message for signals such as:

- explanation request
- practice request
- check request
- frustration/confusion
- completion or mastery claims

It can produce one of four actions:

- `stay`
- `soft-switch`
- `hard-switch`
- `recommend-switch`

### Step 6: Buddy builds the next teaching state

The runtime state stores:

- persona
- adaptivity
- selected strategy
- current effective strategy
- current activity
- current surface
- workspace state
- current goal IDs
- optional handoff summary

This state is later exposed by:

- `GET /api/session/:sessionID/teaching-state`

### Step 7: Buddy compiles a runtime profile

The runtime compiler turns persona + strategy + activity + learner digest into:

- visible surfaces
- default surface
- effective tool permissions
- effective subagent preferences
- teaching contract
- context injections

### Step 8: Buddy composes the teaching system prompt

The system prompt includes:

- runtime profile summary
- workspace-state summary
- learner/context injections
- switch handoff, when relevant
- teaching workspace context, if an editor lesson is active
- teaching policy additions such as “completion claim detected”

### Step 9: Buddy forwards the request into vendored OpenCode

At this point Buddy is acting as a thin product/runtime layer over OpenCode. The request is forwarded to the selected runtime agent with the compiled Buddy system prompt attached.

## 10. How Switching Works

Switching is explicit in the runtime, even when it looks smooth in the UI.

### Manual switching

If `Auto` is off:

- the strategy you selected is the strategy Buddy uses for the next prompt
- clicking `Understand`, `Practice`, or `Check` directly sets the next strategy

### Auto switching

If `Auto` is on:

- Buddy still receives your selected persona
- Buddy may change the effective strategy for the next turn
- the UI syncs back from the backend teaching state so you can see the current effective strategy

### Soft switch

A soft switch changes strategy or activity while staying in the same session.

Example:

- `Understand` -> `Practice`

### Hard switch

A hard switch still stays in the same chat, but Buddy rebuilds the runtime state more aggressively.

Buddy uses it for things like:

- strong context-pollution risk
- moving out of assessment because the learner is confused or frustrated
- cases where the next move should be treated as a sharper reset

Important:

- hard switch does not create a new thread
- hard switch does inject a handoff summary into the new runtime

### Recommend switch

This is the lightest behavior.

If Buddy suspects assessment is the right next move but the signal is weak, it can keep the current strategy instead of forcing the switch immediately. In practice, that usually means the next-step recommendation stays visible in the Learning Plan while the active strategy remains unchanged.

## 11. What Changes in the Background During a Switch

When the runtime decides a real switch happened, Buddy builds a handoff summary.

That handoff may include:

- old persona and strategy
- new persona and strategy
- active goal IDs
- strengths
- active misconceptions
- accepted work
- pending work
- evidence references

This handoff is then injected into the next system prompt so the next strategy does not start blind.

That is the reason switching is more than just flipping a UI toggle.

## 12. How to Use Each Strategy Properly

### Use `Understand` when

- you are new to the concept
- you need framing before doing
- you want a worked example
- you are stuck and need repair

Good prompts:

- `Explain this in plain language, then show one worked example.`
- `What is the key idea here and what mistake am I making?`
- `Teach me just enough to start practicing.`

### Use `Practice` when

- you want to do the learning work
- you want a concrete task
- you want hints instead of full solutions
- you want to build fluency

Good prompts:

- `Give me one guided practice task tied to the current goal.`
- `Let me try first. Only hint if I stall.`
- `Make the next one slightly harder.`

### Use `Check` when

- you think you understand the material
- you want real evidence
- you want Buddy to identify the next gap precisely

Good prompts:

- `Give me a quick mastery check.`
- `Assess my current understanding of this goal.`
- `Check whether I can do this without hints.`

### Use `Auto` when

- you want Buddy to move between explanation, practice, and checking
- you do not want to micromanage each turn
- you trust Buddy to use practice as the default engine once goals exist

Turn `Auto` off when:

- you want a fixed explanation block
- you want a controlled practice session
- you want to force a check now

## 13. Common Flows

### Cold start in a new notebook

Recommended flow:

1. choose the right persona
2. ask Buddy to define concrete goals
3. move into guided practice quickly
4. use `Check` after some real work

Good first prompt:

- `Help me define 3 concrete learning goals for this notebook, then start with guided practice.`

### Concept -> practice -> check

This is the most useful default flow.

1. `Understand`
2. `Practice`
3. `Check`
4. back to `Understand` only if the check exposes a real gap

### Code Buddy interactive lesson

Use `Code Buddy` when the lesson should be grounded in a real editor workspace.

Typical flow:

1. choose `Code Buddy`
2. start in `Practice` or `Auto`
3. let Buddy use the teaching workspace tools
4. checkpoint when you want to lock a stable state
5. use `Check` to verify understanding, not just whether the code runs

### Math Buddy explanation or checking

Use `Math Buddy` when a figure or visual explanation materially helps.

Typical flow:

1. choose `Math Buddy`
2. start in `Understand`
3. ask for a figure only when it clarifies the idea
4. move into `Practice` or `Check`

## 14. How to Read the Learning Plan Sidebar

The Learning Plan is a generated operational view, not a notebook file.

Read it like this:

- top badge row
  Buddy’s current recommendation and scaffolding level
- `Active Goals`
  what the current workspace is optimizing for
- `Next Up`
  what Buddy thinks should happen next
- `Review`
  spaced retrieval and review obligations
- `Coverage`
  where goal coverage is weak
- `Required Actions`
  feedback loops that still need closure
- `Constraints`
  what is currently shaping the plan

Use `Show raw plan` if you want to inspect the markdown representation that Buddy generated behind the structured view.

## 15. Notebook Settings and Defaults

Notebook settings control defaults, not hard locks.

You can set:

- default persona
- starting strategy
- default `Auto` state

What they mean:

- default persona
  what new prompts in this notebook start with
- starting strategy
  the initial teaching stance
- default `Auto`
  whether new prompts start in adaptive or manual control

If `Auto` is enabled, the starting strategy is still useful. It is the starting point before adaptation, not a guarantee that the strategy will remain fixed.

## 16. What the Product Does Not Expose Yet

The current UI does not expose:

- direct subagent selection
- direct raw agent picker
- direct editing of learner-store records
- direct editing of the Learning Plan document

Those are deliberate product choices in the current build.

If you are using Buddy as an open-source project and want to inspect or extend those parts, use the code or the HTTP routes rather than expecting the web UI to expose everything directly.

## 17. Useful API Surfaces for Inspection

If you want to inspect the backend behavior directly, these routes matter:

- `GET /api/config/personas`
  Persona catalog used by the UI
- `GET /api/session/:sessionID/teaching-state`
  Current Buddy teaching runtime state for the session
- `GET /api/learner/curriculum-view`
  Generated Learning Plan data
- `GET /api/learner/state`
  Broader learner-state snapshot
- `GET /api/learner/goals`
  Goals view
- `GET /api/learner/progress`
  Progress projection
- `GET /api/learner/review`
  Review projection

Internal route/type names still use `curriculum` in some places. User-facing product copy should be read as `Learning Plan`.

## 18. Recommended Usage Patterns

If you want Buddy to be effective, do this:

- define goals early
- move into practice faster than feels comfortable
- use `Check` to generate evidence, not reassurance
- leave `Auto` on when you want Buddy to steer
- turn `Auto` off when you want exact control
- use `Code Buddy` for real editor-backed work
- use `Math Buddy` when a figure materially helps
- treat the Learning Plan as feedback about the system state

Avoid this:

- staying in `Understand` for too long
- using slash commands for teaching
- expecting the Learning Plan to be a manually edited file
- assuming Buddy changed strategy “mysteriously” without checking the current teaching state

## 19. The Most Honest Short Version

If you want the shortest accurate explanation of how to use Buddy:

1. pick the right persona
2. define goals early
3. spend more time in `Practice` than `Understand`
4. use `Check` to create evidence
5. leave `Auto` on if you want Buddy to steer
6. read the Learning Plan to see what Buddy thinks is happening
7. use normal messages for teaching and slash commands for controls

That is the current product model.
