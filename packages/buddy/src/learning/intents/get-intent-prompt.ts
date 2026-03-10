import type { Intent } from "../shared/teaching-vocabulary"
import LEARN_PROMPT from "./instruction.intent.p.md"
import PRACTICE_PROMPT from "./practice.intent.p.md"
import ASSESS_PROMPT from "./assessment.intent.p.md"

const INTENT_PROMPTS: Record<Intent, string> = {
  learn: LEARN_PROMPT,
  practice: PRACTICE_PROMPT,
  assess: ASSESS_PROMPT,
}

export function getIntentPrompt(intent: Intent): string {
  return INTENT_PROMPTS[intent]
}
