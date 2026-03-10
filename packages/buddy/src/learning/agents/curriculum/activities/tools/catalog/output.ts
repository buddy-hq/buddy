import type { TeachingIntentId } from "@buddy/backend/learning/shared/teaching-vocabulary"
import { compactLine } from "./context"

export function formatActivityOutput(input: {
  id: string
  intent: TeachingIntentId
  goalLabel: string
  learnerContext: string[]
  sections: Array<[string, string[]]>
}) {
  const learnerContextBlock =
    input.learnerContext.length > 0
      ? `Learner context:\n${input.learnerContext.map((line) => `- ${line}`).join("\n")}`
      : ""

  const sectionBlocks = input.sections
    .map(([label, values]) => {
      const items = values.map((value) => compactLine(value)).filter(Boolean)
      if (items.length === 0) return ""
      return `${label}:\n${items.map((item) => `- ${item}`).join("\n")}`
    })
    .filter(Boolean)
    .join("\n")

  return [
    `<activity_tool_output name="${input.id}">`,
    `Intent: ${input.intent}`,
    `Target: ${input.goalLabel}`,
    learnerContextBlock,
    sectionBlocks,
    "</activity_tool_output>",
  ]
    .filter(Boolean)
    .join("\n")
}
