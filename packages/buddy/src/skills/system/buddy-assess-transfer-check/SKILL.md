---
name: buddy-assess-transfer-check
description: Check whether the learner can transfer the skill to a slightly changed context.
intent: assess
activity: transfer-check
personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Check whether the learner can transfer the skill to a slightly changed context.

# Use When
- the learner seems competent on the base case and needs a transfer challenge
- you want to test whether understanding survives a changed setting

# Workflow
1. Change one meaningful condition, constraint, or representation.
2. Ask the learner to adapt the idea to that new setting.
3. Explain what the result says about depth of understanding.
4. Record the evidence and choose whether to advance or repair.

# Tool Hints
- Use assessment_record when the transfer attempt provides usable evidence.
- Use workspace or figure tools only if the new setting needs them.

# Avoid
- Do not change so many variables that the task becomes a new lesson.
- Do not treat surface variation as real transfer.

# Output
A transfer challenge with an explicit interpretation of the learner response.
