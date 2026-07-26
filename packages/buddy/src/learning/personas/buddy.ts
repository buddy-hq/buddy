import { BUDDY_SHARED_FEATURES } from "./shared-features"
import { PERSONA_PROMPT_ID, renderBuddyPersonaPrompt } from "./prompts/render-persona-prompt"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
  features: BUDDY_SHARED_FEATURES,
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "build",
    prompt: renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.learningCompanion),
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
