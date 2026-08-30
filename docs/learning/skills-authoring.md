# Pedagogical Skill Authoring Guide

## Status & Scope

Canonical authority for authoring and refactoring Buddy pedagogical skills and teaching playbooks.

This guide defines how to translate research-backed educational methods into operational agent skills. For engineering guidelines on tool schemas, telegraph English, parameter nullability, and provider tool calling, refer to [Create Buddy Tool Guide](../../.agents/skills/create-buddy-tool-guide/SKILL.md). For core pedagogical principles, refer to [Curriculum Principles & Pedagogical Authority](curriculum/principles.md).

---

## 1. The Core Objective: Pedagogical Distillation

The purpose of a Buddy pedagogy skill is **pedagogical distillation**: converting fragmented, research-backed teaching knowledge into an actionable, high-quality teaching capability.

- A pedagogy skill is **not** a generic agent tool package or a code automation script.
- A pedagogy skill is **not** an operator manual or an interactive intake questionnaire.
- A pedagogy skill is an internal **teaching playbook** that enables Buddy to deliver natural, effective instructional moves during live learning conversations.

The goal is to preserve pedagogical rigor while keeping learner-facing delivery fluid, conversational, and context-sensitive.

---

## Skill domains

Buddy has two related but distinct notions of “skill”:

- **Runtime-discovered skills** are OpenCode-style filesystem skills found through configured paths
  and exposed through Buddy's product/API layer. Discovery, installation, refresh, and runtime
  permission mechanics belong to that domain.
- **Internal Buddy pedagogy playbooks** are concise, procedural capabilities such as explanations,
  worked examples, concept contrasts, and analogies. They are activated as part of teaching
  behavior through capability resolution and session permissions.

This guide owns the second domain: authoring internal teaching playbooks. It is not a guide for
generic skill packaging or runtime skill management.

---

## 2. Lessons from the `create-analogies` Case Study

The transition from generic agent skills to Buddy teaching playbooks was shaped by diagnosing the failure modes of generic skill authoring on the `create-analogies` capability.

### What Generic Authoring Got Right
- Identified concrete teaching jobs for analogies.
- Emphasized deep relational structure over surface similarity.
- Accounted for learner background variables and misconception risks.
- Maintained research evidence in reference files.

### Why Generic Authoring Failed in Live Teaching

1. **Overly Mechanical Default Output:**
   Generic templates instructed the agent to output explicit mapping tables, "where it breaks" sections, and formal evaluation questions. While useful as internal drafting scaffolds, emitting them verbatim turns a conversational teaching moment into a rigid worksheet.
2. **Assumption of Requester Co-Design:**
   Generic skills begin by asking intake questions (e.g., "What job should this analogy do?"). In a live tutoring session, Buddy must infer context autonomously and execute the move without forcing the learner through intake forms.
3. **Treating Teaching Moves as Standalone Artifacts:**
   Generic authoring treated an analogy as a packaged deliverable. In Buddy, an analogy is only one move within a broader instructional sequence (e.g., concept introduction → analogy → check for understanding → deliberate practice).
4. **Leaking Internal Scaffolding into Learner Output:**
   Stress-test checklists, domain-mapping matrices, and rubrics belong in internal model reasoning, not in the visible response.
5. **Over-Broad Scope:**
   Mixing analogy creation, critique, refinement, bridging analogies, and contrasting cases into a single unbounded skill diluted execution discipline.

---

## 3. Core Design Principles for Pedagogy Skills

### 3.1 Strict Separation: Internal Scaffolding vs. Learner-Facing Delivery

Pedagogical skills must explicitly decouple internal generation/evaluation criteria from the student-facing response:

| Layer | Purpose | Content | Learner Visible? |
|---|---|---|---|
| **Internal Scaffolding** | Evaluation, stress-testing, misconception scanning | Structural mapping tables, domain-boundary checks, diagnostic criteria | ❌ No |
| **Learner-Facing Delivery** | Conversational instruction, guided inquiry, practice | Natural explanations, timely checks, clear transitions back to target concept | ✅ Yes |

### 3.2 Autonomous Pedagogical Diagnosis

A teaching skill must guide Buddy to:
- Diagnose the learner's current state from session context and memory.
- Choose and execute the appropriate pedagogical move directly.
- Avoid asking the learner meta-pedagogical questions about instructional design.

### 3.3 Reference Strategy

Keep the primary skill playbook lean and procedural. Offload deep academic research, extended examples, and failure taxonomies to a `references/` directory:
- `references/principles.md`: Research rationale and learning-science grounding.
- `references/failure-modes.md`: Catalog of known misconceptions and domain boundary traps.
- `references/examples.md`: High-quality worked examples across varied domains.

---

## 4. The Standard Six-Section Pedagogy Playbook

All Buddy pedagogy playbooks in `packages/buddy/src/learning/features/*/skills/` should follow this standardized structure:

```markdown
# Role
[One concise paragraph defining the pedagogical stance and specific teaching capability.]

# Use When
[Bullet list of positive choice triggers and learner states where this move applies.]

# Workflow
1. [Step 1: Context inspection / memory check]
2. [Step 2: Internal evaluation / scaffolding]
3. [Step 3: Move execution & learner delivery]
4. [Step 4: Transition to next instructional step]

# Tool Hints
[Guidance on related learning tools, dynamic tool search, or workspace updates.]

# Avoid
[Bullet list of negative triggers, failure modes, mechanical formatting traps, and anti-patterns.]

# Output
[Guidelines for conversational tone, concise phrasing, and hiding internal evaluation matrices.]
```

---

## 5. Authoring Checklist

Before publishing a pedagogical skill, verify:

- [ ] Does the skill define a single, coherent instructional move?
- [ ] Is the primary `SKILL.md` concise and structured with the six standard sections?
- [ ] Are extensive background research and failure catalogs relegated to `references/`?
- [ ] Does the output section strictly forbid leaking internal tables, rubrics, or meta-questions to the learner?
- [ ] Does the skill integrate smoothly into continuous multi-turn teaching sequences?
