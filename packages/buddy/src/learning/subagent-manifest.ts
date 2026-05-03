import { ASSESSMENT_AGENT } from "./features/assessment/subagents/assessment.js"
import { GOAL_WRITER } from "./features/curriculum-planning/subagents/goal-writer.js"
import { PRACTICE_AGENT } from "./features/practice/subagents/practice.js"
import { LEARNER_MEMORY_CONSOLIDATOR_AGENT } from "./features/memory/subagents/memory-consolidator.js"
import { QUESTION_SET_AUTHOR_AGENT } from "./features/question-sets/subagents/question-set-author.js"
import { CURRICULUM_ORCHESTRATOR } from "./features/curriculum/subagents/orchestrator"
import { FLASHCARD_AUTHOR_AGENT } from "./features/flashcards/subagents/flashcard-author.js"
import type { DefinedBuddySubagent } from "./runtime/define-buddy-subagent"

const BUDDY_SUBAGENTS = [
  ASSESSMENT_AGENT,
  CURRICULUM_ORCHESTRATOR,
  PRACTICE_AGENT,
  GOAL_WRITER,
  QUESTION_SET_AUTHOR_AGENT,
  LEARNER_MEMORY_CONSOLIDATOR_AGENT,
  FLASHCARD_AUTHOR_AGENT,
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
