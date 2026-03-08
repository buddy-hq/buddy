export const PERSONA_IDS = ["buddy", "code-buddy", "math-buddy"] as const
export type PersonaId = (typeof PERSONA_IDS)[number]

export const TEACHING_INTENT_IDS = ["learn", "practice", "assess"] as const
export type TeachingIntentId = (typeof TEACHING_INTENT_IDS)[number]

export const SURFACE_IDS = ["chat", "curriculum", "editor", "figure", "quiz"] as const
export type SurfaceId = (typeof SURFACE_IDS)[number]

export const PERSONA_SURFACE_IDS = ["curriculum", "editor", "figure"] as const
export type PersonaSurfaceId = (typeof PERSONA_SURFACE_IDS)[number]

export const WORKSPACE_STATES = ["chat", "interactive"] as const
export type WorkspaceState = (typeof WORKSPACE_STATES)[number]

export const ACTIVITY_KINDS = [
  "goal-setting",
  "explanation",
  "worked-example",
  "analogy",
  "concept-contrast",
  "guided-practice",
  "independent-practice",
  "debug-attempt",
  "stepwise-solve",
  "mastery-check",
  "retrieval-check",
  "transfer-check",
  "review",
  "reflection",
] as const
export type ActivityKind = (typeof ACTIVITY_KINDS)[number]

export const SCAFFOLDING_LEVELS = ["worked-example", "guided", "independent", "transfer"] as const
export type ScaffoldingLevel = (typeof SCAFFOLDING_LEVELS)[number]

export const ACTIVITY_CAPABILITY_MODES = ["skill", "tool", "hybrid"] as const
export type ActivityCapabilityMode = (typeof ACTIVITY_CAPABILITY_MODES)[number]

export const TOOL_IDS = [
  "curriculum_read",
  "curriculum_update",
  "goal_decide_scope",
  "goal_lint",
  "goal_commit",
  "goal_state",
  "learner_snapshot_read",
  "activity_explanation",
  "activity_worked_example",
  "activity_concept_contrast",
  "activity_analogy",
  "activity_guided_practice",
  "activity_independent_practice",
  "activity_debug_attempt",
  "activity_stepwise_solve",
  "activity_mastery_check",
  "activity_reflection",
  "activity_retrieval_check",
  "activity_transfer_check",
  "learner_practice_record",
  "learner_assessment_record",
  "render_figure",
  "render_freeform_figure",
  "teaching_start_lesson",
  "teaching_checkpoint",
  "teaching_add_file",
  "teaching_set_lesson",
  "teaching_restore_checkpoint",
] as const
export type ToolId = (typeof TOOL_IDS)[number]

export type ToolAccess = "inherit" | "allow" | "deny"
export type ToolDelta = Partial<Record<ToolId, ToolAccess>>

export const SUBAGENT_IDS = [
  "curriculum-orchestrator",
  "goal-writer",
  "practice-agent",
  "assessment-agent",
  "feedback-engine",
  "progress-tracker",
  "sequencer",
  "alignment-auditor",
  "exercise-author",
  "analogy-author",
  "hint-generator",
  "rubric-grader",
  "solution-checker",
] as const
export type SubagentId = (typeof SUBAGENT_IDS)[number]

export type SubagentAccess = "inherit" | "allow" | "deny" | "prefer"
export type SubagentDelta = Partial<Record<SubagentId, SubagentAccess>>

export const TEACHING_INTENT_USER_LABELS: Record<TeachingIntentId, string> = {
  learn: "Understand",
  practice: "Practice",
  assess: "Check",
}

export function isPersonaId(value: string): value is PersonaId {
  return PERSONA_IDS.includes(value as PersonaId)
}

export function isTeachingIntentId(value: string): value is TeachingIntentId {
  return TEACHING_INTENT_IDS.includes(value as TeachingIntentId)
}

export function isPersonaSurfaceId(value: string): value is PersonaSurfaceId {
  return PERSONA_SURFACE_IDS.includes(value as PersonaSurfaceId)
}
