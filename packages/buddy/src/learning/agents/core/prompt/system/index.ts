import { titleCaseFromKebab } from "./helpers"
import { buildStableHeaderSections } from "./stable-header"
import { buildTurnContextSections } from "./turn-context/build"
import type { BuildTurnContextSectionsInput } from "./turn-context/types"
import type { LearningPromptBuild } from "./types"
export type {
  LearningPromptBuild,
  PromptInjectionAudit,
  PromptInjectionCache,
  PromptInjectionDecision,
  PromptInjectionPolicy,
  PromptInjectionPolicyAudit,
  PromptInjectionPolicyMatrixEntry,
  RuntimePromptSection,
  RuntimePromptSectionKind,
} from "./types"
export { buildPromptInjectionPolicy } from "./prompt-injection-policy"
export {
  resolvePromptInjectionDecision,
} from "./prompt-injection"

function renderSections(sections: LearningPromptBuild["stableHeaderSections"]): string {
  return sections.map((entry) => entry.text).join("\n\n").trim()
}

function renderTurnContext(sections: LearningPromptBuild["turnContextSections"]): string {
  return [
    "<buddy_turn_context>",
    ...sections.map((entry) => `${entry.label}:\n${entry.text}`),
    "</buddy_turn_context>",
  ].join("\n\n").trim()
}

export type BuildLearningSystemPromptInput = BuildTurnContextSectionsInput

export async function buildLearningSystemPrompt(input: BuildLearningSystemPromptInput): Promise<LearningPromptBuild> {
  const stableHeaderSections = buildStableHeaderSections(input.runtimeProfile)
  const turnContextSections = await buildTurnContextSections(input)

  return {
    stableHeader: renderSections(stableHeaderSections),
    turnContext: renderTurnContext(turnContextSections),
    stableHeaderSections,
    turnContextSections,
  }
}

export async function composeLearningSystemPrompt(input: BuildLearningSystemPromptInput): Promise<string> {
  const { stableHeader, turnContext } = await buildLearningSystemPrompt(input)
  return [stableHeader, turnContext].filter(Boolean).join("\n\n")
}

export function getAdvisorySuggestions(input: {
  recommendedNextAction: string
  openFeedbackActions: string[]
  relevantGoalIds: string[]
}) {
  const suggestions: string[] = []

  if (input.relevantGoalIds.length > 0) {
    suggestions.push(`Focus goals: ${input.relevantGoalIds.join(", ")}`)
  }

  suggestions.push(`Suggested next action for the learner UI: ${titleCaseFromKebab(input.recommendedNextAction)}`)

  for (const action of input.openFeedbackActions.slice(0, 2)) {
    suggestions.push(`Resolve feedback: ${action}`)
  }

  return suggestions
}
