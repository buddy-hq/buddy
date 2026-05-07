# Prompt Engineering

## Situation
- Buddy already has the right primitives: personas, surfaces, skills, tools, and subagents.
- The main gap is prompt quality, especially routing.
- Good prompting should help Buddy decide:
  - what kind of help is needed
  - which capability to trigger
  - when not to trigger it

## First Principles
### Goal
- Buddy is a learning companion.
- It should help the learner make real progress, not just answer questions.

### Context
- learner state and history
- machine and workspace state
- reading and resource state

### Capabilities
- personas
- skills
- tools
- subagents

## This Pass
- This pass is mainly prompt enhancement, not broad code changes.
- We will improve one skill at a time.
- Main source material can come from `~/code/resources`, distilled into prompts and skills.
- Scope is limited to the pedagogical skill layer inside the core `buddy` persona.
- Out of scope for this pass:
  - `reading-buddy`
  - `code-buddy`
  - `math-buddy`
  - goal tools
  - operational reading workflow
  - routing subagent layer
  - artifact-generation trigger rules
- Priority order:
  - choose objective first
  - distill resources second
  - write deep skill prompt third

## Prompt Layers In Scope
- built-in skills
- only the pedagogical skill layer for core `buddy`

## Pedagogical Skill Layer In Core Buddy
- `learn`
- `practice`
- `assess`
- `explain`
- `worked-example`
- `compare-concepts`
- `analogy`

## Biggest Hits
1. Deep skill content distilled from pedagogy resources.
2. Skill objectives that guide Buddy when the learner wants explanation, practice, or assessment.
3. Shared authoring standard for large, detailed skills.

## Working Rules
- Use Mermaid as the reference pattern for strong trigger descriptions.
- A good pedagogical skill should be detailed, not shallow.
- A good skill should encode solved teaching knowledge from resources, not just generic advice.
- A good skill should guide Buddy when the learner wants explanation, practice, or assessment.
- Do not try to improve all personas, layers, or surfaces at once.

## Decisions
Workflow:
- define scope first
- pick one narrow target
- improve routing prompts for that target
- distill pedagogy from resources into that target
- review, then move to the next slice

### Locked Decisions

1. This pass is mainly prompt enhancement, not broad code changes.
2. We will define scope before rewriting prompts.
3. We will not attack all surfaces at once.
4. Routing is the first priority.
5. Scope is limited to the pedagogical skill layer in core `buddy`.
6. Do not conflate the `curriculum` feature with the `teaching-guidance` feature.
7. Treat reading as out of scope for this pass.
8. Start with `learn`, `practice`, and `assess`.
9. Skills can and should be highly detailed when the source material supports it.

## How
- Treat `learn`, `practice`, and `assess` as the core pedagogical loop.
- Improve them in this order:
  1. choose one skill objective
  2. gather and distill source material from `~/code/resources`
  3. write a deep skill prompt using that distilled material
  4. tighten trigger language so Buddy knows when to use it
  5. repeat for the next skill
- Working objective:
  - `learn` should guide Buddy when the learner wants explanation or understanding
  - `practice` should guide Buddy when the learner wants to work or apply
  - `assess` should guide Buddy when the learner wants to be checked or calibrated
- Main quality goal:
  - Buddy should have deep, high-quality pedagogical skills instead of shallow ones.

### Proposed Decisions

1. First skill to deepen
Context:
- We have locked the first target as `learn`, `practice`, and `assess`.
- The next step is to pick one skill and deepen it by distilling resources into it.
Options:
- 1A. `learn`
  - tradeoffs
    - pros
      - central skill for explanation and conceptual understanding
      - likely to benefit most from distilled pedagogy books
    - cons
      - can still overlap with `explain` if not handled carefully
  - comments
    -
- 1B. `practice`
  - tradeoffs
    - pros
      - strong leverage on actual learning-by-doing
      - likely to benefit from concrete practice design literature
    - cons
      - may depend on explanation quality upstream
  - comments
    -
- 1C. `assess`
  - tradeoffs
    - pros
      - strong leverage on evidence and calibration
      - can improve how Buddy checks mastery
    - cons
      - may be less immediately visible than `learn` or `practice`
  - comments
    -

## Subagent Prompt Scratchpad
- Detailed prompt iteration lives in `docs/features/prompt-engineering/explanation-guide-subagent-prompt.md`.
- Keep this file focused on scope and design decisions.
