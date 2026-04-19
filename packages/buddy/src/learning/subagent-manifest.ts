import { ASSESSMENT_AGENT } from "./curriculum/assessment/assessment.agent.js"
import { GOAL_WRITER } from "./curriculum/goals/writer.agent.js"
import { CURRICULUM_ORCHESTRATOR } from "./curriculum/orchestrator.agent.js"
import { PRACTICE_AGENT } from "./curriculum/practice/practice.agent.js"
import { FLASHCARD_AUTHOR_AGENT } from "./flashcard-author/agent.js"
import { QUESTION_SET_AUTHOR_AGENT } from "./question-set-author/agent.js"
import type { DefinedBuddySubagent } from "./define-buddy-subagent"

const BUDDY_SUBAGENTS = [
  ASSESSMENT_AGENT,
  CURRICULUM_ORCHESTRATOR,
  PRACTICE_AGENT,
  GOAL_WRITER,
  FLASHCARD_AUTHOR_AGENT,
  QUESTION_SET_AUTHOR_AGENT,
] as const satisfies readonly DefinedBuddySubagent[]

type BuddySubagentDefinition = (typeof BUDDY_SUBAGENTS)[number]

function cloneBuddySubagentDefinition(input: BuddySubagentDefinition): BuddySubagentDefinition {
  return {
    ...input,
    prompt: input.prompt,
    ...(input.permission ? { permission: input.permission } : {}),
  }
}

function listBuddySubagentDefinitions(): BuddySubagentDefinition[] {
  return BUDDY_SUBAGENTS.map((subagent) => cloneBuddySubagentDefinition(subagent))
}

export { BUDDY_SUBAGENTS, listBuddySubagentDefinitions }

export type { BuddySubagentDefinition }
