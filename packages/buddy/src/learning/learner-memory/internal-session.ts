import { LEARNER_MEMORY_INTERNAL_SESSION_TUNING } from "./tuning"

const INTERNAL_LEARNER_MEMORY_SESSION_PREFIX = LEARNER_MEMORY_INTERNAL_SESSION_TUNING.sessionPrefix
const LEARNER_MEMORY_CONSOLIDATION_SESSION_TITLE =
  LEARNER_MEMORY_INTERNAL_SESSION_TUNING.consolidationSessionTitle

function internalLearnerMemorySession(input: {
  sessionID: string
  title?: string
  parentID?: string
}): boolean {
  return (
    input.sessionID.startsWith(INTERNAL_LEARNER_MEMORY_SESSION_PREFIX) ||
    input.title === LEARNER_MEMORY_CONSOLIDATION_SESSION_TITLE ||
    input.parentID !== undefined
  )
}

export {
  INTERNAL_LEARNER_MEMORY_SESSION_PREFIX,
  LEARNER_MEMORY_CONSOLIDATION_SESSION_TITLE,
  internalLearnerMemorySession,
}
