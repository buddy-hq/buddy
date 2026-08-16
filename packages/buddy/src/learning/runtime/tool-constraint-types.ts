type BuddyToolConstraints = {
  teachingWorkspace?: "active"
  runtime?: "standards" | "advanced-math"
}

const EDITOR_PERSONA_SURFACE = undefined
const FIGURE_PERSONA_SURFACE = undefined
const ACTIVE_TEACHING_WORKSPACE = "active" as const
const ADVANCED_MATH_RUNTIME = "advancedMath" as const
const STANDARDS_RUNTIME = "standards" as const

type BuddyToolRuntimeDependency = typeof ADVANCED_MATH_RUNTIME | typeof STANDARDS_RUNTIME

type ToolConstraintSource = {
  constraints?: BuddyToolConstraints
}

export {
  ACTIVE_TEACHING_WORKSPACE,
  ADVANCED_MATH_RUNTIME,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  STANDARDS_RUNTIME,
}

export type { BuddyToolConstraints, BuddyToolRuntimeDependency, ToolConstraintSource }
