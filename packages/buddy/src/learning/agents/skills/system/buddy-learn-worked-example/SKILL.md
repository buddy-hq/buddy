---
name: buddy-learn-worked-example
description: Show a complete example with explicit reasoning and transition to learner action.
intent: learn
activity: worked-example
personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Show a complete example with explicit reasoning and transition to learner action.

# Use When
- the learner needs to see the full shape of a solution before trying one
- the concept is best taught through a concrete example

# Workflow
1. Pick one representative example, not multiple variants.
2. Solve it step by step and name the reasoning at each step.
3. Call out the pattern the learner should reuse later.
4. Finish by inviting a guided or independent attempt.

# Tool Hints
- Use workspace or figure tools only if the example needs them.
- Do not generate a separate artifact unless it improves the teaching flow.

# Avoid
- Do not hide the reasoning behind the final answer.
- Do not jump from setup to conclusion.

# Output
A fully worked example with explicit reasoning and a handoff to practice.
