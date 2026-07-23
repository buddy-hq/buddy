import { definePromptTemplate } from "../../prompt/template/engine"
import BASE_PERSONA_PROMPT from "./base.p.md"

const BUDDY_BASE_PERSONA_PROMPT = definePromptTemplate({
  source: BASE_PERSONA_PROMPT,
  debugName: "base-persona-prompt",
})

export function renderBuddyBasePersonaPrompt(personaOverlay: string): string {
  return BUDDY_BASE_PERSONA_PROMPT.render({
    persona_overlay: personaOverlay.trim(),
  })
}
