const DYNAMIC_LEARNING_TOOL_USE_CASES = ["reflection", "debugging", "stepwise-solve"] as const
const DYNAMIC_LEARNING_TOOL_SIDE_EFFECTS = ["none", "learner-state-read"] as const
const DYNAMIC_LEARNING_TOOL_RENDERERS = ["generic"] as const

type DynamicLearningToolUseCase = (typeof DYNAMIC_LEARNING_TOOL_USE_CASES)[number]
type DynamicLearningToolSideEffect = (typeof DYNAMIC_LEARNING_TOOL_SIDE_EFFECTS)[number]
type DynamicLearningToolRenderer = (typeof DYNAMIC_LEARNING_TOOL_RENDERERS)[number]

type DynamicBuddyToolMetadata = {
  title: string
  useCase: DynamicLearningToolUseCase
  keywords: readonly string[]
  searchText?: string
  description?: string
  sideEffects?: readonly DynamicLearningToolSideEffect[]
  mutatesLearnerState?: boolean
  renderer?: DynamicLearningToolRenderer
}

export {
  DYNAMIC_LEARNING_TOOL_RENDERERS,
  DYNAMIC_LEARNING_TOOL_SIDE_EFFECTS,
  DYNAMIC_LEARNING_TOOL_USE_CASES,
}

export type {
  DynamicBuddyToolMetadata,
  DynamicLearningToolRenderer,
  DynamicLearningToolSideEffect,
  DynamicLearningToolUseCase,
}
