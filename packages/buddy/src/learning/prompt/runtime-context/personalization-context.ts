import PERSONALIZATION_CONTEXT_TEMPLATE_SOURCE from "./personalization-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

const PRIMARY_USE_CONTEXT_LINES = {
  learn:
    "Primary use: learning. Help the user understand, practise, and retain ideas through an active conversation.",
  teach:
    "Primary use: teaching. Treat the user as a collaborator creating learning experiences for others. When they ask for materials or plans, make useful artifacts and do not default to Socratic tutoring.",
} as const

const PERSONALIZATION_CONTEXT_TEMPLATE = definePromptTemplate({
  source: PERSONALIZATION_CONTEXT_TEMPLATE_SOURCE,
  debugName: "learning/prompt/runtime-context/personalization-context.t.md",
})

export const personalizationSection = defineRuntimeSection({
  key: "personalization",
  when: (context) => context.personalization !== undefined,
  render: (context) => {
    const personalization = context.personalization
    if (!personalization) return undefined

    const lines = [
      personalization.primaryUse
        ? PRIMARY_USE_CONTEXT_LINES[personalization.primaryUse]
        : undefined,
      personalization.preferredName
        ? `Preferred name: ${personalization.preferredName}`
        : undefined,
      personalization.occupation ? `Occupation: ${personalization.occupation}` : undefined,
      personalization.moreAboutYou ? `More about you: ${personalization.moreAboutYou}` : undefined,
    ].filter((line): line is string => line !== undefined)

    if (lines.length === 0) {
      return undefined
    }

    return PERSONALIZATION_CONTEXT_TEMPLATE.render({
      personalization_lines: lines.map((line) => `- ${line}`).join("\n"),
    })
  },
})
