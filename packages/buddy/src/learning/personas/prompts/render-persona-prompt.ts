import { definePromptTemplate } from "../../prompt/template/engine"
import CONCISE_RESPONSE_PREFERENCE from "./concise-response-preference.p.md"
import LEARNING_COMPANION_DOCUMENT from "./learning-companion.p.md"
import SHARED_CONSTITUTION from "./shared/constitution.p.md"
import SHARED_PRODUCT from "./shared/product.p.md"
import SHARED_TEACHING from "./shared/teaching.p.md"
import SHARED_VISUAL_GUIDANCE from "./shared/visual-guidance.p.md"
import TEACHING_ASSISTANT_DOCUMENT from "./teaching-assistant.p.md"

const PERSONA_PROMPT_DOCUMENTS = {
  "learning-companion": definePromptTemplate({
    source: LEARNING_COMPANION_DOCUMENT,
    debugName: "learning-companion-persona-prompt",
  }),
  "teaching-assistant": definePromptTemplate({
    source: TEACHING_ASSISTANT_DOCUMENT,
    debugName: "teaching-assistant-persona-prompt",
  }),
} as const

type PersonaPromptID = keyof typeof PERSONA_PROMPT_DOCUMENTS

const PERSONA_PROMPT_ID = {
  learningCompanion: "learning-companion",
  teachingAssistant: "teaching-assistant",
} as const satisfies Readonly<Record<string, PersonaPromptID>>

export function renderBuddyPersonaPrompt(personaPromptID: PersonaPromptID): string {
  const document = PERSONA_PROMPT_DOCUMENTS[personaPromptID]

  return document.render({
    concise_response_preference: CONCISE_RESPONSE_PREFERENCE.trim(),
    shared_constitution: SHARED_CONSTITUTION.trim(),
    shared_product: SHARED_PRODUCT.trim(),
    shared_teaching: SHARED_TEACHING.trim(),
    shared_visual_guidance: SHARED_VISUAL_GUIDANCE.trim(),
  })
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim()
}

export { PERSONA_PROMPT_ID }
export type { PersonaPromptID }
