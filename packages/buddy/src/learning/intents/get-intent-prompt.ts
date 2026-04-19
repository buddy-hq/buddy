import type { Intent } from "../shared/teaching-vocabulary"
import LEARNING_PRINCIPLES from "./learning-principles.p.md"
import LEARN_PROMPT from "./learn/intent.p.md"
import PRACTICE_PROMPT from "./practice/intent.p.md"
import ASSESS_PROMPT from "./assess/intent.p.md"

function withLearningPrinciples(prompt: string): string {
  return `${LEARNING_PRINCIPLES}\n\n${prompt}`
}

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
${withLearningPrinciples(LEARN_PROMPT)}
</learn>
<practice>
${withLearningPrinciples(PRACTICE_PROMPT)}
</practice>
<assess>
${withLearningPrinciples(ASSESS_PROMPT)}
</assess>`
}

const INTENT_PROMPTS: Record<Exclude<Intent, "auto">, string> = {
  learn: buildExplicitIntentSection("learn", withLearningPrinciples(LEARN_PROMPT)),
  practice: buildExplicitIntentSection("practice", withLearningPrinciples(PRACTICE_PROMPT)),
  assess: buildExplicitIntentSection("assess", withLearningPrinciples(ASSESS_PROMPT)),
}

export function getIntentPrompt(intent: Intent): string {
  if (intent === "auto") {
    return buildAutoIntentSection()
  }
  return INTENT_PROMPTS[intent]
}
