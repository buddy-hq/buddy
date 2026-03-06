---
name: buddy-practice-guided
description: Run a guided practice attempt with tight scaffolding and feedback.
intent: practice
activity: guided-practice
personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Run a guided practice attempt with tight scaffolding and feedback.

# Use When
- the learner should perform the skill but still needs structure
- practice is the right next move but a full independent attempt is too early

# Workflow
1. State the practice target clearly.
2. Ask for one concrete learner step at a time.
3. Give the smallest useful correction or hint after each step.
4. Record practice evidence when the attempt yields a meaningful signal.

# Tool Hints
- Use practice_record when the attempt creates useful evidence.
- Use practice-agent only when you need a richer generated task than the chat reply itself.

# Avoid
- Do not solve the whole task for the learner.
- Do not ask multiple large subproblems at once.

# Output
A guided attempt that produces usable evidence and a clear next step.
