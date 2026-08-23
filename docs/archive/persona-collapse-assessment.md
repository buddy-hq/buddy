# Persona Collapse Assessment: Are We There Yet?

## TL;DR

**Yes, mostly.** The infrastructure for collapsing Math Buddy and Reading Buddy into a single base Buddy is in place. The remaining work is real but bounded — it's prompt restructuring and a small feature-list merge, not new architecture. Code Buddy is a different story (you already said you're deferring it, which is right).

---

## What's Already Done

The month of work created a clean path:

| Layer | Status | What It Solved |
|-------|--------|----------------|
| Intent removal | ✅ Done | Model decides the teaching move, not a runtime enum |
| Feature-based access | ✅ Done | `defineBuddyFeature` owns tools, skills, subagents, surfaces |
| Dynamic tool search/load | ✅ Done | `learning_tool_search` → `learning_tool_load` → session-scoped grants |
| Skills as guidance | ✅ Done | `learn`, `practice`, `assess`, `explain`, `reading`, etc. are SKILL.md files |
| Skill library | ✅ Done | Curated install pipeline for external skills |
| Subagent delegation | ✅ Done | Object-reference wiring through features |

The key insight you had — **skills carry the domain routing, not personas** — is already working in the codebase. The `learn` skill says "search `reflection metacognition misconception repair`". The `reading` skill says "call `ingest_full_text`". Skills are the routing layer, and they already work for all personas.

## What Makes Personas Different Today

Looking at the actual code, here's what separates Math Buddy and Reading Buddy from base Buddy:

### Math Buddy vs Buddy

| Dimension | Buddy | Math Buddy |
|-----------|-------|------------|
| Extra features | — | `mathFiguresFeature`, `calculatorFeature`, `practiceFeature` |
| Missing features | — | No `curriculumPlanningFeature`, no `flashcardsFeature` |
| Prompt overlay | Generic buddy.p.md (67 lines) | math-buddy.p.md (85 lines of figure/calculator policy) |
| Default surface | `curriculum` | `figure` |
| Context flags | `attachFigureContext: false` | `attachFigureContext: true` |
| Runtime kind | `build` | `primary` |

### Reading Buddy vs Buddy

| Dimension | Buddy | Reading Buddy |
|-----------|-------|---------------|
| Extra features | — | `practiceFeature`, `assessmentFeature` |
| Missing features | — | No `analogiesFeature`, `stepwiseSolvingFeature`, `curriculumPlanningFeature`, `flashcardsFeature` |
| Prompt overlay | Generic buddy.p.md | reading-buddy.p.md (87 lines of reading grounding rules) |
| Default surface | `curriculum` | `curriculum` |
| Context flags | Same | Same |

### The Real Differentiators

1. **Feature sets**: Math Buddy adds `mathFigures` + `calculator` + `practice`. Reading Buddy adds `practice` + `assessment`. These are just capability differences.
2. **Prompt overlays**: Math Buddy's 85-line prompt is 90% figure-rendering protocol. Reading Buddy's 87-line prompt is reading-grounding rules.
3. **Context attachment**: Only Math Buddy sets `attachFigureContext: true`.

## The Collapse Plan

### What a Single Buddy Would Look Like

```
Unified Buddy = base Buddy
  + ALL features from all personas (except code-buddy-specific ones)
  + math-buddy.p.md → becomes a "math teaching" skill
  + reading-buddy.p.md → becomes a "reading" skill (partly already is)
  + attachFigureContext → true when mathFigures tools are loaded
```

### Step-by-step

1. **Merge feature lists**: Give base Buddy the superset of features from `buddy` + `math-buddy` + `reading-buddy`. That means adding `mathFiguresFeature`, `calculatorFeature`, `practiceFeature`, `assessmentFeature`.

2. **Convert math prompt to a skill**: The math-buddy.p.md content is almost entirely figure/calculator usage policy. This becomes a `math-teaching` skill with triggers like "when teaching math", "when the learner needs a figure", "when calculation is required". The skill tells the model when and how to use `render_figure`, `render_freeform_figure`, `python_calculator`.

3. **Reading prompt is mostly already a skill**: Reading-buddy.p.md duplicates what the `reading` SKILL.md already does. The reading grounding rules, mode switching, and response shape can fold into the existing `reading` skill or a companion `reading-grounding` skill.

4. **Make context attachment dynamic**: `attachFigureContext` should activate when math-figures tools are available/loaded, not when a persona says so. This is the one small runtime change needed.

5. **Skill descriptions carry routing**: The base prompt needs a small section saying "load the `math-teaching` skill when the learner is working on math" and "load the `reading` skill when working from a resource". Skill descriptions need to be strong enough for the model to self-select.

6. **Remove math-buddy and reading-buddy persona definitions**.

### What You Keep

- **Base Buddy persona** with the full feature set
- **Code Buddy** (deferred, different enough to stay separate for now)
- **All skills** as the routing layer
- **Dynamic tools** as the context-saving layer

## The One Risk: Skill Selection Reliability

Your migration notes already flagged this:

> [!WARNING]
> **Skill routing cannot be hidden inside the skill.** Always-visible prompt text must tell the model when to use pedagogy skills. Skill descriptions must be strong enough for the model to choose the skill.

This is the real question mark. The model needs to reliably:
1. Recognize "this is a math topic" → load `math-teaching` skill
2. Recognize "this is a reading session" → load `reading` skill  
3. Inside those skills, know which dynamic tools to search and load

This is **inference-time routing**, not architecture. The architecture supports it. The question is whether skill descriptions + base prompt hints are enough for the model to make good choices consistently.

### Why I Think It Works

- The `learn` skill already does this pattern: it has a "Dynamic Tool Search" section that tells the model exactly what to search for.
- The `reading` skill already says "start by loading the reading skill" — Reading Buddy's prompt literally just points to the skill.
- Math-buddy's prompt is almost entirely _usage protocol_ for specific tools, which is exactly what a skill should contain.

### The Safety Net

If skill selection is unreliable in practice, you can add a lightweight hint in the base prompt keyed to **what features are enabled**, not what persona is running. Something like:

```
When math tools (render_figure, python_calculator) are available and the topic involves mathematics, load the `math-teaching` skill for figure and calculation protocol.
```

This is still simpler than maintaining three separate personas.

## Summary

| Question | Answer |
|----------|--------|
| Is the architecture ready? | **Yes** |
| Is the dynamic tool pipeline ready? | **Yes** |
| Are skills already the routing layer? | **Yes**, for teaching pedagogy. Not yet for subject-domain (math, reading). |
| What's left? | Convert math + reading prompts into skills, merge feature lists, test skill-selection reliability |
| Is it risky? | **Low risk.** The prompts are already mostly skill-shaped. The main bet is on model skill-selection quality. |
| Should Code Buddy stay separate? | **Yes, for now.** It has lesson-workspace, debug-guidance, and a fundamentally different interaction model. |

**You're at the "do it" stage, not the "design it" stage.**
