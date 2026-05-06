import PERSONALIZATION_CONTEXT_TEMPLATE_SOURCE from "./personalization-context.t.md"
import { defineRuntimeSection } from "./definition"
import { definePromptTemplate } from "../template/engine"

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
