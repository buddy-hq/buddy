# Buddy Skill Creator Context

Last updated: 2026-03-11

## Why This Note Exists

This note captures the current understanding of the "Buddy-specific skill creator" effort so the work can resume without re-exploring the same folders and rediscovering the same conclusions.

The immediate goal is not to build a generic Codex/OpenCode skill creator clone. The goal is to create a version of the skill creator that helps author high-quality **Buddy teaching capabilities** from distilled source knowledge.

## Problem Statement

The generic Codex skill creator is good at turning research and procedural guidance into a generic skill folder. It is not sufficient for Buddy because Buddy's internal teaching capabilities need a different contract.

The failure mode is not lack of rigor. The failure mode is that the generic creator tends to produce:

- skills shaped like operator checklists
- skills that expose internal scaffolds directly in the learner-facing output
- skills that ask setup questions appropriate for a general assistant but inappropriate for an internal teaching capability
- skills that optimize for auditability and templated delivery rather than natural, teacher-like delivery

For Buddy, the skill creator needs to help convert fragmented pedagogical knowledge from books, notes, papers, and other resources into concise, usable, learner-safe teaching playbooks.

## The Correct Target

The target was clarified during discussion.

This project is **not** primarily about:

- making it easier to install or copy generic skills into Buddy
- creating a skill to write code in the Buddy repo
- creating a generic runtime skill management workflow

This project **is** about:

- taking consolidated pedagogical knowledge
- distilling it into an actionable skill format suitable for Buddy
- making Buddy better at specific teaching moves such as:
  - creating analogies
  - giving explanations
  - creating assessments
  - using metaphors
  - other specialized instructional capabilities

Example use case:

- A future skill like `create-analogies` should encode expert knowledge about writing analogies from many source texts, so Buddy can use that capability appropriately for very different learners in different countries and contexts.

## What Was Explored

### 1. Buddy package: how Buddy uses skills

Only `packages/buddy` was explored for this part.

Main conclusion:

- Buddy has a product-facing skill layer, but runtime execution still comes from vendored OpenCode.
- Buddy also has bundled pedagogy skills inside the repo that work as internal teaching playbooks.

Important files already examined:

- `~/Code/buddy/packages/buddy/src/learning/skills/README.md`
- `~/Code/buddy/packages/buddy/src/learning/skills/service/discovery.ts`
- `~/Code/buddy/packages/buddy/src/learning/skills/service/catalog.ts`
- `~/Code/buddy/packages/buddy/src/learning/skills/service/mutations.ts`
- `~/Code/buddy/packages/buddy/src/learning/skills/service/permissions.ts`
- `~/Code/buddy/packages/buddy/src/config/opencode/skills.ts`
- `~/Code/buddy/packages/buddy/src/config/opencode/overlay-builder.ts`
- `~/Code/buddy/packages/buddy/src/learning/intents/capabilities/skill-capabilities.ts`
- `~/Code/buddy/packages/buddy/src/learning/intents/learn/capabilities.ts`
- `~/Code/buddy/packages/buddy/src/learning/intents/capabilities/resolution.ts`
- `~/Code/buddy/packages/buddy/src/learning/resolve-capability-profile.ts`
- `~/Code/buddy/packages/buddy/src/learning/agent-execution/permissions/session-permissions.ts`
- `~/Code/buddy/packages/buddy/src/learning/capabilities/pedagogy/skills/buddy-pedagogy-explanation/SKILL.md`
- `~/Code/buddy/packages/buddy/src/learning/capabilities/pedagogy/skills/buddy-pedagogy-worked-example/SKILL.md`
- `~/Code/buddy/packages/buddy/src/learning/capabilities/pedagogy/skills/buddy-pedagogy-concept-contrast/SKILL.md`
- `~/Code/buddy/packages/buddy/src/learning/capabilities/pedagogy/skills/buddy-pedagogy-analogy/SKILL.md`
- `~/Code/buddy/packages/buddy/test/skill-tool-visibility.test.ts`
- `~/Code/buddy/packages/buddy/test/runtime-activity-bundles.test.ts`
- `~/Code/buddy/packages/buddy/test/runtime-session-permissions.test.ts`

### 2. Original system skill creator

Non-binary contents of the upstream system skill creator were read.

Main files already examined:

- `~/.codex/skills/.system/skill-creator/SKILL.md`
- `~/.codex/skills/.system/skill-creator/license.txt`
- `~/.codex/skills/.system/skill-creator/agents/openai.yaml`
- `~/.codex/skills/.system/skill-creator/references/openai_yaml.md`
- `~/.codex/skills/.system/skill-creator/scripts/generate_openai_yaml.py`
- `~/.codex/skills/.system/skill-creator/scripts/init_skill.py`
- `~/.codex/skills/.system/skill-creator/scripts/quick_validate.py`
- `~/.codex/skills/.system/skill-creator/assets/skill-creator-small.svg`

Observation:

- The original creator is strong at generic skill packaging, progressive disclosure, and reusable resource organization.
- Its assumptions are still mostly Codex-generic.

### 3. Buddy fork of the skill creator

Only the Buddy fork's `SKILL.md` was intentionally read, because the rest was stated to be the same as the original fork source.

File already examined:

- `~/Code/resources/.agents/skills/skill-creator-for-buddy/SKILL.md`

Observation:

- The Buddy fork had only started to diverge from the original.
- It added some Buddy framing, but it was still mostly generic Codex skill-creator content.

### 4. Example output from generic creator: `create-analogies`

This was used as the concrete failure case.

Files already examined:

- `~/Code/resources/skills/create-analogies/SKILL.md`
- `~/Code/resources/skills/create-analogies/agents/openai.yaml`
- `~/Code/resources/skills/create-analogies/references/output_templates.md`
- `~/Code/resources/skills/create-analogies/references/analogy_research_answers.md`

## What We Learned About Buddy Skills

### Buddy has two relevant notions of "skill"

There was an early confusion here that got corrected.

#### A. Runtime-discovered skills

These are OpenCode-style filesystem skills discovered from skill folders and configured paths. Buddy exposes them through its API/UI layer.

Important facts:

- discovery includes locations such as `~/.agents/skills`, `~/.claude/skills`, workspace-local skill folders, config directories, and configured skill paths
- Buddy merges OpenCode-discovered skills with Buddy-managed skills
- Buddy can refresh local filesystem discovery without tearing down live runtimes
- permission rules are name-based
- workspace/global scope shown in Buddy is informational, not a separate permission boundary

This matters, but it is not the main target of the current effort.

#### B. Internal Buddy pedagogy skills

These are the more important reference point for this project.

Examples:

- `buddy-pedagogy-explanation`
- `buddy-pedagogy-worked-example`
- `buddy-pedagogy-concept-contrast`
- `buddy-pedagogy-analogy`

These are short internal playbooks used by Buddy as pedagogical capabilities. They are wired into intent/capability resolution and session permissions.

Important facts:

- they are concise
- they are procedural
- they are shaped like teaching behavior policies, not long operator manuals
- they are activated as part of Buddy's teaching behavior, not as giant visible templates

### Built-in Buddy pedagogy skill contract

The built-in pedagogy skills follow a clear shape:

- `# Role`
- `# Use When`
- `# Workflow`
- `# Tool Hints`
- `# Avoid`
- `# Output`

This is a much better model for the Buddy-specific creator than the generic Codex skill template.

### Why this matters

If the Buddy-specific creator is meant to author internal pedagogical capabilities, then the creator should default to this playbook contract rather than the generic "overview / intake / default deliverable / decision tree" structure.

## Clarified Intent From User

This was an important correction.

The user clarified that the goal is:

- not to create skills for writing code in Buddy
- not to focus on installation or runtime management
- not to produce generic skills that happen to be copied into Buddy later

The real goal is:

- convert fragmented teaching knowledge into a high-quality Buddy capability
- preserve and operationalize expert pedagogical knowledge
- help Buddy teach learners around the world more effectively

This means the Buddy-specific creator must be optimized for **pedagogical distillation**, not just generic skill packaging.

## Diagnosis of the `create-analogies` Example

### What is good about it

The `create-analogies` skill contains strong research synthesis.

Good qualities:

- it identifies teaching jobs for analogies
- it captures learner/context variables
- it emphasizes deep structure over surface similarity
- it includes failure modes and misconception risk
- it preserves useful evidence-backed guidance in references

In short: the knowledge is mostly good.

### What is wrong about it for Buddy

The problem is the shape of the skill, especially the way the generic creator turned the knowledge into a response contract.

#### 1. The default output is too mechanical

`create-analogies/SKILL.md` tells the agent to output:

- the best analogy
- a mapping table
- "where it breaks"
- a quick check question

And `references/output_templates.md` reinforces this with explicit sections and tables.

This is good as an internal drafting scaffold.
It is bad as a default learner-facing teaching response.

Why:

- it sounds like a worksheet or evaluation artifact
- it makes the analogy delivery feel templatized
- it is not how a good teacher would usually deliver an analogy in the middle of a live explanation

#### 2. It assumes the requester is co-designing the analogy

The skill asks several intake questions up front.

That may be appropriate for a general assistant producing custom work for a human requester.
It is often inappropriate for Buddy using the skill internally during teaching.

Buddy should often infer enough from context and deliver the right pedagogical move directly, instead of stopping to ask the learner to specify the "job" of the analogy or whether they want one option or three.

#### 3. It treats the analogy as a standalone artifact

The skill is optimized around producing a packaged analogy result.

But for Buddy, an analogy is usually just one move inside a larger teaching sequence.

The skill should help Buddy decide:

- when to use analogy at all
- what type of analogy move to use
- how to follow it with explanation, practice, transfer, or misconception repair

#### 4. It leaks internal reasoning into final output

Mapping tables, explicit rubrics, and stress-test checklists are useful internally.
They should not always be surfaced to the learner.

The generic creator did not clearly separate:

- internal generation/evaluation aids
- learner-facing response style

That is a core reason the result feels awkward.

#### 5. It is too broad as one Buddy capability

The skill mixes:

- create analogies
- critique analogies
- refine analogies
- bridging analogies
- contrasting cases
- synectics-style creativity

That breadth is manageable in a general-purpose skill.
For Buddy, it weakens the contract unless the skill is reframed as "choose and deliver the right analogy-based teaching move."

#### 6. It does not match Buddy's native playbook shape

Buddy's own pedagogy skills are lean playbooks.
`create-analogies` is still shaped like a general operator skill.

This shape mismatch is the strongest practical evidence that the Buddy-specific creator needs a different template and a different default philosophy.

## Synthesis: The Real Gap

The generic skill creator is very good at:

- organizing resources
- producing explicit templates
- creating reusable procedural guidance

But for Buddy, that is not enough.

The Buddy-specific creator must additionally know how to:

- preserve pedagogical rigor while keeping final delivery natural
- distinguish internal scaffolding from learner-facing output
- shape skills as teaching playbooks rather than operator manuals
- optimize for live teaching flow instead of artifact generation

## What the Buddy-Specific Creator Should Do

### Core job

Turn researched, fragmented pedagogical knowledge into concise Buddy playbooks that improve a specific teaching move.

### Default philosophy

The creator should assume:

- the final skill is for Buddy's internal teaching behavior
- the skill body should be concise and operational
- references should hold richer research and evidence
- learner-facing output should sound natural, not templated

### Preferred output contract for authored Buddy skills

Default generated `SKILL.md` should likely follow the built-in Buddy pedagogy shape:

- `# Role`
- `# Use When`
- `# Workflow`
- `# Tool Hints`
- `# Avoid`
- `# Output`

### Internal vs external guidance

The creator should explicitly teach authors to separate:

- internal evaluation scaffolds:
  - rubrics
  - mapping tables
  - failure scans
  - source-domain checks
- learner-facing delivery:
  - natural analogy
  - brief clarification of limits when needed
  - transition back to the real concept
  - next teaching move

### References strategy

The creator should push detailed evidence and source material into `references/`.

For a skill like `create-analogies`, likely references would be things like:

- `references/principles.md`
- `references/failure-modes.md`
- `references/examples.md`
- `references/source-map.md`

The skill body should remain lean and procedural.

## Likely Changes Needed to the Buddy Fork

These were not implemented yet. This is the likely direction.

### 1. Rewrite the Buddy fork `SKILL.md`

This is the first recommended change.

The Buddy fork creator should explicitly say:

- it is for authoring Buddy pedagogical playbooks
- the main output is a teaching capability, not just a generic skill package
- built-in Buddy pedagogy skills are the model to follow
- internal scaffolds should not automatically become learner-visible output

### 2. Change the default template generated by `init_skill.py`

If the Buddy fork is meant to generate Buddy-style pedagogy skills, then the template should produce something closer to:

- `Role`
- `Use When`
- `Workflow`
- `Tool Hints`
- `Avoid`
- `Output`

instead of the generic overview-based scaffold.

### 3. Update `quick_validate.py` if needed

The current validator from the generic creator may not be aligned with Buddy-style frontmatter or conventions if the fork evolves further.

This should be checked once the Buddy-specific contract is finalized.

### 4. Test the new creator on `create-analogies`

The best validation path is to use `create-analogies` as the first proving-ground capability.

Success criteria:

- preserves the strong research
- removes the mechanical delivery contract
- uses natural teacher-facing output guidance
- feels consistent with Buddy's built-in pedagogy playbooks

## Recommended Next Steps

When resuming this work, the suggested order is:

1. Rewrite `~/Code/resources/.agents/skills/skill-creator-for-buddy/SKILL.md` so the creator is explicitly about authoring Buddy pedagogical capabilities.
2. Define the Buddy-specific template contract based on existing built-in pedagogy skills.
3. Update the Buddy fork's helper scripts to generate and validate that contract.
4. Refactor `~/Code/resources/skills/create-analogies/SKILL.md` into a Buddy-native version and use it as the first acceptance test.

## Short Version

If context is tight, this is the minimum to remember:

- The initial framing was too generic.
- The real target is authoring Buddy pedagogical capabilities from distilled research.
- Buddy's built-in pedagogy skills are the right template model.
- The `create-analogies` example proves the generic creator produces overly mechanical output contracts.
- The fix is to build a Buddy-specific creator that preserves research rigor but generates lean playbooks with natural learner-facing delivery.
