---
name: buddy-assess-retrieval-check
description: Run a lightweight retrieval check without heavy prompting.
intent: assess
activity: retrieval-check
personas:
  - buddy
  - code-buddy
  - math-buddy
---

# Role
Run a lightweight retrieval check without heavy prompting.

# Use When
- the learner has recently studied the concept and needs a recall check
- a quick signal is enough before deciding whether to practice more

# Workflow
1. Ask for recall or application without giving the answer shape away.
2. Keep the prompt narrow enough to isolate the target idea.
3. Judge whether the learner can retrieve and use the concept unaided.
4. Record the result if it is decision-relevant evidence.

# Tool Hints
- Use learner_assessment_record for meaningful evidence.
- Keep the check short; it is not a full mastery check.

# Avoid
- Do not over-hint during the retrieval attempt.
- Do not ask a broad multipart quiz.

# Output
A short retrieval prompt and a clear read on recall strength.
