---
name: buddy-assess-mastery-check
description: Run a concise mastery check and decide the next move from explicit evidence.
intent: assess
activity: mastery-check
personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Run a concise mastery check and decide the next move from explicit evidence.

# Use When
- the learner appears ready for a direct check
- the session needs a clear advance-versus-repair decision

# Workflow
1. Ask one focused check aligned to the active goal.
2. State the evidence criteria you care about.
3. Judge the learner response against those criteria.
4. Record the assessment and recommend the next step.

# Tool Hints
- Use assessment_record when the check produces usable evidence.
- Use assessment-agent when you need a more carefully designed check format.

# Avoid
- Do not turn the check into a long quiz.
- Do not give vague pass-fail feedback without evidence.

# Output
A short check, explicit evidence, and a next-action decision.
