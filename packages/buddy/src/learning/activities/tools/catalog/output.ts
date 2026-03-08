import type { TeachingIntentId } from "../../../runtime/types.js"
import { compactLine } from "./context.js"

export function formatActivityOutput(input: {
  id: string
  intent: TeachingIntentId
  goalLabel: string
  learnerContext: string[]
  sections: Array<[string, string[]]>
}) {
  const lines = [`<activity_tool_output name="${input.id}">`]
  lines.push(`Intent: ${input.intent}`)
  lines.push(`Target: ${input.goalLabel}`)

  if (input.learnerContext.length > 0) {
    lines.push("Learner context:")
    for (const line of input.learnerContext) {
      lines.push(`- ${line}`)
    }
  }

  for (const [label, values] of input.sections) {
    const items = values.map((value) => compactLine(value)).filter(Boolean)
    if (items.length === 0) continue
    lines.push(`${label}:`)
    for (const item of items) {
      lines.push(`- ${item}`)
    }
  }

  lines.push(`</activity_tool_output>`)
  return lines.join("\n")
}
