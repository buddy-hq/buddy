import { OPEN_CODE_GPT_SYSTEM_PROMPT } from "@buddy/opencode-adapter/system-prompt"
import CODE_AVATAR_PROMPT from "./prompts/code-avatar.p.md"
import { BUDDY_SHARED_FEATURES } from "./shared-features"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"

export const CODE = defineBuddyPersona({
  id: "code",
  label: "Code",
  description: "OpenCode's coding persona with Buddy capabilities.",
  features: BUDDY_SHARED_FEATURES,
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: false,
    attachProgress: false,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "build",
    prompt: [OPEN_CODE_GPT_SYSTEM_PROMPT, CODE_AVATAR_PROMPT].join("\n\n"),
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
