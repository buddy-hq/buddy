# Post-Refactor Activity Direction

This note captures the architecture decisions locked after the agent-controlled teaching runtime refactor, plus the next direction for activity support.

## What has already been implemented

- The teacher agent is now the pedagogy controller.
- Backend code no longer chooses the next strategy or activity.
- Runtime control is now:
  - `persona`
  - optional `intentOverride`
  - learner state
  - workspace state
  - capability envelope
- `Auto` means "no intent override".
- Intent is a steering signal, not a permission partition.
- Suggestions are a separate advisory lane and only steer the agent when the user explicitly clicks one.
- Prompt construction is now split into:
  - stable session header in `system`
  - volatile turn context appended to the current user turn
- First-class activity bundles now exist as usable runtime objects:
  - bundles are filtered by persona, intent, and workspace state
  - explicit bundle selection injects the bundle's actual skill content into the next turn context
  - bundle tools and helpers remain available through normal runtime permissions
  - clicking a sidebar action or bundle can execute immediately when the composer is idle, otherwise it stages a visible one-turn steer
  - Buddy now ships first-class vendor-callable activity tools such as:
    - `activity_explanation`
    - `activity_guided_practice`
    - `activity_mastery_check`
    - `activity_debug_attempt`

## Current architectural position

- Personas remain first-class:
  - `buddy`
  - `code-buddy`
  - `math-buddy`
- Intents remain the only first-class pedagogical control:
  - `learn`
  - `practice`
  - `assess`
  - `Auto` in the UI means no override
- Activities are no longer backend-routed runtime state.
- Tools are gated by:
  - persona
  - environment
  - safety
- Tools are not gated by current intent.

## What is still missing

The current refactor removed the bad deterministic router, but it did not yet add strong first-class activity support.

Current state:
- activities exist mostly as playbook vocabulary and advisory labels
- activities are not modeled as reusable capability bundles
- there is no strong `persona x intent x activity` layer yet

## Locked direction from here

Activities should become agent-selected capability bundles, not backend-owned runtime state.

That means:
- the backend does not choose an activity
- the agent may choose an activity when needed
- the activity should map to one or more of:
  - a skill
  - a tool
  - a sub-agent

## Recommended ontology

- `persona` = who is teaching
- `intent` = why this turn exists
- `activity` = how the teacher executes that intent
- `tool` = concrete execution, artifact generation, mutation, or persistence
- `skill` = procedural playbook / methodology / instructions for running the activity
- `sub-agent` = bounded specialist capability when the activity is large enough to delegate

## Vendor findings

### Skills

Vendored OpenCode has first-class skill support:

- skills are discovered from `SKILL.md` files in:
  - `.claude/skills`
  - `.agents/skills`
  - `.opencode/skill` / `.opencode/skills`
  - configured skill paths and URLs
- core implementation:
  - `vendor/opencode/packages/opencode/src/skill/skill.ts`
  - `vendor/opencode/packages/opencode/src/tool/skill.ts`

Important behavior:
- the native `skill` tool lists available skills in its tool description
- calling `skill({ name })` loads the full `SKILL.md` content into the conversation
- skill output is injected as a `<skill_content name=\"...\">` block
- skill visibility is permission-controlled through `permission: "skill"`

### Plugins

Vendored OpenCode also has first-class plugin support:

- plugin type and hooks:
  - `vendor/opencode/packages/plugin/src/index.ts`
- plugin custom tool helper:
  - `vendor/opencode/packages/plugin/src/tool.ts`
- runtime loading:
  - `vendor/opencode/packages/opencode/src/plugin/index.ts`
- plugin and custom tools are merged into the tool registry:
  - `vendor/opencode/packages/opencode/src/tool/registry.ts`

Important behavior:
- plugins can contribute `Hooks.tool`
- plugin tools are first-class callable tools
- plugins can also add hooks like:
  - `tool.execute.before`
  - `tool.execute.after`
  - `chat.message`
  - `experimental.chat.system.transform`
  - `experimental.chat.messages.transform`

## Buddy-specific integration facts

- Buddy already has skill management and curation logic in:
  - `packages/buddy/src/skills/service.ts`
- Buddy already passes skill paths into the OpenCode overlay in:
  - `packages/buddy/src/config/opencode/index.ts`

So Buddy is already in a position to use native OpenCode skills as part of the teaching architecture without patching vendor code.

## Recommended integration strategy

### 1. Use skills for nontrivial activity procedures

Use a skill when the activity needs a reusable teaching playbook.

Examples:
- `learn / worked-example / code-buddy`
- `practice / guided-practice / code-buddy`
- `assess / mastery-check / math-buddy`
- `learn / analogy / math-buddy`

Skills should hold:
- pedagogy steps
- when to use the activity
- how to interact with the learner
- what evidence to gather
- when to escalate to tools or sub-agents

### 2. Use tools for concrete work

Use a tool when the activity needs:
- structured output
- persistence
- side effects
- file or workspace mutation
- figure generation
- practice / assessment recording

Examples:
- `practice_record`
- `assessment_record`
- `teaching_set_lesson`
- `render_figure`

### 3. Use sub-agents for large delegated work

Use a sub-agent when the activity implies a bounded but larger specialist task.

Examples:
- `practice-agent`
- `assessment-agent`
- `goal-writer`
- `curriculum-orchestrator`

### 4. Do not use plugins as the main activity model

Plugins are powerful, but they are the wrong default abstraction for the core Buddy teaching ontology.

Use plugins only when we need:
- runtime-wide extension
- custom tool registration outside Buddy core
- prompt/message/system transforms
- instrumentation or provider hooks

Do not use plugins as the primary representation of everyday teaching activities.

Reason:
- activities are product-level teaching concepts
- plugins are runtime extension infrastructure

## Target model for activities

An activity should eventually compile to a bundle like:

```ts
type ActivityBundle = {
  id: string
  intent: "learn" | "practice" | "assess"
  personas: Array<"buddy" | "code-buddy" | "math-buddy">
  skills?: string[]
  tools?: string[]
  subagents?: string[]
  description: string
  whenToUse: string[]
  outputs?: string[]
}
```

Example shape:

```ts
{
  id: "guided-practice",
  intent: "practice",
  personas: ["code-buddy"],
  skills: ["guided-practice-code"],
  tools: ["practice_record", "teaching_set_lesson", "teaching_checkpoint"],
  subagents: ["practice-agent"],
  description: "Run a guided coding attempt with tight scaffolding.",
  whenToUse: [
    "learner is making progress but still needs structure",
    "workspace is active",
  ],
  outputs: ["practice task", "recorded practice evidence"],
}
```

## Bundled skills and filtering

Skills can be pre-bundled, but the bundling model is still filesystem-backed.

That means:
- Buddy should ship curated `SKILL.md` directories as product assets
- Buddy should expose those directories through `skills.paths` or materialize them into a Buddy-managed root on first run
- this does not require vendored OpenCode changes

Relevant implementation facts:
- OpenCode discovers skills from filesystem paths and configured URLs
- Buddy already forwards skill paths through `packages/buddy/src/config/opencode/index.ts`
- Buddy already resolves shared skill roots in `packages/buddy/src/config/opencode/skills.ts`
- Buddy already has a managed root in `packages/buddy/src/skills/service.ts`

Intent-aware filtering is also possible, but it should be done carefully.

Locked direction:
- skills should carry Buddy metadata such as:
  - `intent`
  - `personas`
  - `activity`
  - optional `auto` eligibility
- Buddy should build an `ActivityBundle` registry from that metadata
- filtering should happen at the bundle/selection layer, not by turning intent into a global hard permission partition again

Recommended behavior:
- explicit `learn` / `practice` / `assess` override:
  - show and prefer matching activity bundles and their skills
- `Auto`:
  - keep the full persona-appropriate activity bundle set available
  - rank or suggest relevant bundles instead of hard-denying the rest

Important constraint:
- do not make skill filtering recreate the old router
- the agent should still choose whether to load a skill
- filtering is there to reduce noise and align the available playbook with the current persona and explicit user steering

## Current implementation slice

The first architectural slice is now implemented.

What exists now:
- Buddy has a first-class activity-bundle registry in runtime code
- bundles are keyed by:
  - persona
  - intent
  - workspace state when needed
- each bundle can expose:
  - skills
  - tools
  - sub-agents
- bundled skills are shipped as repo assets under Buddy source
- Buddy adds the bundled skill root to OpenCode skill discovery paths
- runtime permissions now allow or deny bundled skills per session so the native `skill` tool only advertises the relevant Buddy activity skills
- the learning prompt now includes an `Activity Capabilities` section in the turn-context packet
- the runtime inspector now exposes:
  - allowed bundled skills
  - resolved activity bundles
  - bundle-linked tools and helpers

Important current behavior:
- explicit `intent` override filters the activity bundles and bundled skills down to that intent
- `Auto` keeps the full persona-appropriate bundle set available
- the backend still does not choose the activity
- the agent chooses whether to use a bundle and whether to load its skill

This means the architecture is now tangible:
- activity support is first-class
- skills are pre-bundled
- tools and sub-agents attach to activities
- the agent remains the controller

## Final decision

The next architectural step should be:

- keep the current intent-only runtime and capability-envelope model
- add first-class activity bundles
- implement activities primarily as:
  - skills for procedure
  - tools for concrete work
  - sub-agents for larger bounded delegation
- do not reintroduce backend-routed activity state
- do not make plugin the default activity abstraction

## File references

- `vendor/opencode/packages/opencode/src/skill/skill.ts`
- `vendor/opencode/packages/opencode/src/tool/skill.ts`
- `vendor/opencode/packages/plugin/src/index.ts`
- `vendor/opencode/packages/plugin/src/tool.ts`
- `vendor/opencode/packages/opencode/src/tool/registry.ts`
- `packages/buddy/src/skills/service.ts`
- `packages/buddy/src/config/opencode/index.ts`
