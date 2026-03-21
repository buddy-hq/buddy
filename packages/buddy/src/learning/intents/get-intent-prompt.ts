import type { Intent } from "../shared/teaching-vocabulary"
import LEARN_PROMPT from "./learn/intent.p.md"
import PRACTICE_PROMPT from "./practice/intent.p.md"
import ASSESS_PROMPT from "./assess/intent.p.md"

function buildExplicitIntentSection(intent: Exclude<Intent, "auto">, prompt: string): string {
  return `The student has shown explicit intent to ${intent}. They could have chosen any of the following: learn, practice, or assess. But since they chose ${intent}, you should keep the session focused on that by following the following guidelines.
<${intent}IntentGuidelines>
${prompt}
</${intent}IntentGuidelines>`
}

function buildAutoIntentSection(): string {
  return `The student has shown no explicit intent whether this is a teach, practice, or assess session. You can teach the learner, make them practice or assess their understanding. When to do which depends on the learner's progress.
Here are the guidelines for how to do each:
<learn>
${LEARN_PROMPT}
</learn>
<practice>
${PRACTICE_PROMPT}
</practice>
<assess>
${ASSESS_PROMPT}
</assess>`
}

const INTENT_PROMPTS: Record<Exclude<Intent, "auto">, string> = {
  learn: buildExplicitIntentSection("learn", LEARN_PROMPT),
  practice: buildExplicitIntentSection("practice", PRACTICE_PROMPT),
  assess: buildExplicitIntentSection("assess", ASSESS_PROMPT),
}

export function getIntentPrompt(intent: Intent): string {
  if (intent === "auto") {
    return buildAutoIntentSection()
  }
  return INTENT_PROMPTS[intent]
}
