import { BUDDY_SHARED_FEATURES } from "./shared-features"
import { PERSONA_PROMPT_ID, renderBuddyPersonaPrompt } from "./prompts/render-persona-prompt"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"

export const TEACHING_BUDDY = defineBuddyPersona({
  id: "teaching-buddy",
  label: "Teaching Buddy",
  description: "A planning and creation partner for teachers and educators.",
  features: BUDDY_SHARED_FEATURES,
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: false,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "build",
    prompt: renderBuddyPersonaPrompt(PERSONA_PROMPT_ID.teachingAssistant),
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
