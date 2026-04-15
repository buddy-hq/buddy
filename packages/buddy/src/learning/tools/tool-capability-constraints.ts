type BuddyToolPersonaSurface = "curriculum" | "editor" | "figure" | "question-set"
type BuddyToolWorkspaceState = "chat" | "interactive"

const EDITOR_PERSONA_SURFACE: BuddyToolPersonaSurface = "editor"
const FIGURE_PERSONA_SURFACE: BuddyToolPersonaSurface = "figure"
const INTERACTIVE_WORKSPACE_STATE: BuddyToolWorkspaceState = "interactive"
const ADVANCED_MATH_RUNTIME_DEPENDENCY = "advancedMath" as const
const STANDARDS_RUNTIME_DEPENDENCY = "standards" as const

type LearningToolRuntimeDependency =
  | typeof ADVANCED_MATH_RUNTIME_DEPENDENCY
  | typeof STANDARDS_RUNTIME_DEPENDENCY

type BuddyToolCapabilityConstraints = {
  surfaces?: readonly BuddyToolPersonaSurface[]
  workspaceStates?: readonly BuddyToolWorkspaceState[]
  runtimeDependency?: LearningToolRuntimeDependency
}

type LearningToolConstraintSource = {
  capability?: BuddyToolCapabilityConstraints
}

export {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  STANDARDS_RUNTIME_DEPENDENCY,
}

export type {
  BuddyToolCapabilityConstraints,
  BuddyToolPersonaSurface,
  BuddyToolWorkspaceState,
  LearningToolConstraintSource,
  LearningToolRuntimeDependency,
}
