---
name: align-teaching-topics-to-grade-level-and-age
description: Use when Buddy needs to answer what material, concept, skill, topic, task type, or depth is appropriate for a learner's age, grade, year level, school band, developmental level, or current readiness. Use for questions like what to teach at age X, what level to teach a topic, whether material is too advanced or too basic, what vocabulary or sentence complexity fits a grade band, how complex text should be, what prerequisite comes next, or how to scale material for K-2, 3-5, 6-8, 9-12, preschool, elementary, middle school, secondary, adolescents, or adults. Do not use for generic teaching-method selection; use teaching-models. Do not use for broad lesson/framework design; use learning-design-frameworks. Do not use for authoring worksheets, quizzes, rubrics, or handouts; use teaching-resource-authoring.
---

# Align Teaching Topics To Grade Level And Age

This skill routes questions about what teaching topics and depth fit a learner's grade level, age, or readiness to source-grounded references.

Its core question is:

> For this learner's age, grade, level, or readiness, what material should be taught, and at what depth?

Read only the reference files needed for the current placement question, usually one and at most two. If the corpus does not support a confident age-to-material answer, say so and recommend a diagnostic starting point rather than inventing a sequence.

## What This Skill Can Say

The local corpus supports **developmental bands, diagnostics, and domain progressions**, not a universal "teach every subject at every age" chart. Use these confidence defaults:

- **High confidence:** a source gives age/grade-linked expectations or a clear progression.
- **Medium confidence:** sources give grade-band traits or domain progression but not exact placement.
- **Low confidence:** sources only give general developmental cautions; use a diagnostic probe before choosing material.

For **adult learners**, do not default to school-age bands unless the question is explicitly about school-level material. Route by current knowledge, readiness, language load, and domain prerequisites instead.

## Fast Routing

1. If the user wants a **full age-by-age or K-12 map**, start with `references/scope-sequence-limits.md`.
2. If the user already has a **subject or topic**, start with the matching domain reference.
3. If the main issue is **wording, vocabulary, or text difficulty**, add `references/grade-band-language-and-text-complexity.md`.
4. If the main issue is **scaling the same topic across bands**, add `references/grade-band-material-leveling.md`.
5. If the main issue is **whether the learner is ready at all**, add `references/developmental-readiness-prerequisites.md`.

## Router

### Early Childhood Foundations

Read `references/early-childhood-foundations.md`.

Use when the question concerns toddlers, preschool, pre-K, kindergarten, early primary readiness, play-based or concrete foundations, early language, early symbols, categorization, oral stories, spatial/quantity experiences, or how concrete/symbolic material should be for young learners before formal subject sequences dominate.

### Early Number And Whole-Number Knowledge

Read `references/early-number-knowledge.md`.

Use when the question concerns preschool or primary-grade number sense, counting, more/less, simple addition stories, number-after knowledge, magnitude comparison, place value foundations, or what number material belongs around ages 4, 6, or 8.

### Mathematics Across Grade Levels

Read `references/mathematics-grade-level-progressions.md`.

Use when the question concerns math material across K-12, especially whether a math idea is surface, deep, or transfer-level work for a grade band, or how one math topic depends on earlier grade-level foundations.

### Literacy And Knowledge Sequencing

Read `references/literacy-knowledge-sequencing.md`.

Use when the question concerns what literacy, reading, writing, vocabulary, or background-knowledge material to prioritize by grade or level.

### Science, History, And Weakly Mapped Domains

Read `references/science-history-domain-placement.md`.

Use when the question concerns science, history, or another domain where the local corpus gives examples, conceptual-prerequisite guidance, or misconception guidance but not a clean age-by-age topic map.

### Grade-Band Language And Text Complexity

Read `references/grade-band-language-and-text-complexity.md`.

Use when the question is what **language** to use for an age or grade band: vocabulary size and type, how advanced words can be, sentence length and syntax, figurative or abstract wording, oral vs written explanation, read-aloud vs silent text, and how complex assigned reading should be for K-2, 3-5, 6-8, or 9-12.

### Grade-Band Material Leveling

Read `references/grade-band-material-leveling.md`.

Use when the user already has a topic but needs to know how to scale abstraction, memory demand, metacognition, examples, independence, or task complexity for K-2, 3-5, 6-8, or 9-12. Use `grade-band-language-and-text-complexity.md` when the main bottleneck is wording or text difficulty.

This route adjusts depth and format. It should not pretend to be a subject curriculum.

### Adolescent And Secondary Material Depth

Read `references/adolescent-secondary-material-depth.md`.

Use when the question concerns middle-school, secondary, or adolescent learners and the material involves abstraction, evidence-based argument, perspective-taking, moral reasoning, identity, controversy, disciplinary interpretation, metacognition, or independent transfer.

### Developmental Readiness And Prerequisites

Read `references/developmental-readiness-prerequisites.md`.

Use when the question is whether a learner is ready for a kind of material because of developmental stage, representational capacity, executive function, language, play, social reasoning, or zone of proximal development.

### Scope, Sequence, And Confidence Limits

Read `references/scope-sequence-limits.md`.

Use when the user asks for a broad age-by-age or K-12 sequence, when the domain is not covered by the stronger source maps, or when a proposed placement looks like an unsupported scope-and-sequence claim.

## Common Pairings

- **Topic placement + wording/text demand:** domain reference + `grade-band-language-and-text-complexity.md`
- **Topic placement + abstraction/independence scaling:** domain reference + `grade-band-material-leveling.md`
- **Topic placement + uncertain readiness:** domain reference + `developmental-readiness-prerequisites.md`
- **Broad sequence request + weak local mapping:** `scope-sequence-limits.md` + the closest domain reference

## Answer Default

When this skill is used, answer in this shape unless the user asks for another format:

1. **Placement:** what material or depth fits the requested age/grade/level.
2. **Why:** the source-grounded reason or progression logic.
3. **Prerequisite check:** one small way to verify readiness.
4. **Confidence:** high / medium / low, with limits.
5. **Next material:** the likely next step if the learner succeeds.

## Relationship To Other Skills

Use `teaching-models` after the material is chosen and the problem is how to teach it now.

Use `learning-design-frameworks` for broad curriculum design, alignment, rigor, UDL, formative assessment, differentiation, SEL, or technology integration.

Use `teaching-resource-authoring` when the result should be a concrete artifact such as a worksheet, diagnostic, item set, rubric, study guide, or project brief.

Use `whiteboard-teaching` when the central question is how to represent the material visually on a canvas.
