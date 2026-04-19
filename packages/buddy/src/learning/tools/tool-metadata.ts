import {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  EDITOR_PERSONA_SURFACE,
  FIGURE_PERSONA_SURFACE,
  INTERACTIVE_WORKSPACE_STATE,
  STANDARDS_RUNTIME_DEPENDENCY,
  type BuddyToolCapabilityConstraints,
  type LearningToolRuntimeDependency,
} from "./tool-capability-constraints"

const LEARNING_TOOL_GROUP_POLICIES = {
  pedagogy: {
    registerWarning: "Failed to register Buddy pedagogy tools into OpenCode runtime:",
  },
  curriculum: {
    registerWarning: "Failed to register Buddy curriculum tools into OpenCode runtime:",
  },
  knowledgeGraph: {
    registerWarning: "Failed to register Buddy knowledge-graph tools into OpenCode runtime:",
    runtimeDependency: STANDARDS_RUNTIME_DEPENDENCY,
  },
  figures: {
    registerWarning: "Failed to register Buddy figure tools into OpenCode runtime:",
  },
  freeformFigures: {
    registerWarning: "Failed to register Buddy freeform figure tools into OpenCode runtime:",
  },
  mermaid: {
    registerWarning: "Failed to register Buddy Mermaid tools into OpenCode runtime:",
  },
  goals: {
    registerWarning: "Failed to register Buddy goal tools into OpenCode runtime:",
  },
  learner: {
    registerWarning: "Failed to register Buddy learner tools into OpenCode runtime:",
  },
  teaching: {
    registerWarning: "Failed to register Buddy teaching tools into OpenCode runtime:",
  },
  math: {
    registerWarning: "Failed to register Buddy math tools into OpenCode runtime:",
    unregisterWarning: "Failed to unregister Buddy math tools from OpenCode runtime:",
    runtimeDependency: ADVANCED_MATH_RUNTIME_DEPENDENCY,
  },
  questionSet: {
    registerWarning: "Failed to register Buddy question-set tools into OpenCode runtime:",
    unregisterWarning: "Failed to unregister Buddy question-set tools from OpenCode runtime:",
  },
  flashcard: {
    registerWarning: "Failed to register Buddy flashcard tools into OpenCode runtime:",
    unregisterWarning: "Failed to unregister Buddy flashcard tools from OpenCode runtime:",
  },
} as const

type LearningToolGroup = keyof typeof LEARNING_TOOL_GROUP_POLICIES

type LearningToolGroupPolicy = {
  registerWarning: string
  unregisterWarning?: string
  runtimeDependency?: LearningToolRuntimeDependency
}

const LEARNING_TOOL_METADATA = [
  { id: "pedagogy_guided_practice", group: "pedagogy" },
  { id: "pedagogy_independent_practice", group: "pedagogy" },
  { id: "pedagogy_debug_attempt", group: "pedagogy" },
  { id: "pedagogy_stepwise_solve", group: "pedagogy" },
  { id: "pedagogy_mastery_check", group: "pedagogy" },
  { id: "pedagogy_reflection", group: "pedagogy" },
  { id: "pedagogy_retrieval_check", group: "pedagogy" },
  { id: "pedagogy_prepare_resource", group: "pedagogy" },
  { id: "pedagogy_resource_ingest_full_text", group: "pedagogy" },
  { id: "pedagogy_transfer_check", group: "pedagogy" },
  { id: "search_standards", group: "knowledgeGraph" },
  { id: "get_standard", group: "knowledgeGraph" },
  { id: "get_learning_components", group: "knowledgeGraph" },
  { id: "get_prerequisites", group: "knowledgeGraph" },
  { id: "get_next_standards", group: "knowledgeGraph" },
  { id: "get_crosswalk", group: "knowledgeGraph" },
  { id: "query_standards_sql", group: "knowledgeGraph" },
  {
    id: "render_figure",
    group: "figures",
    capability: {
      surfaces: [FIGURE_PERSONA_SURFACE],
    },
  },
  {
    id: "render_freeform_figure",
    group: "freeformFigures",
    capability: {
      surfaces: [FIGURE_PERSONA_SURFACE],
    },
  },
  { id: "render_mermaid", group: "mermaid" },
  { id: "goal_decide_scope", group: "goals" },
  { id: "goal_lint", group: "goals" },
  { id: "goal_commit", group: "goals" },
  { id: "goal_state", group: "goals" },
  { id: "learner_snapshot_read", group: "learner" },
  { id: "learner_practice_record", group: "learner" },
  { id: "learner_assessment_record", group: "learner" },
  {
    id: "teaching_start_lesson",
    group: "teaching",
    capability: {
      surfaces: [EDITOR_PERSONA_SURFACE],
    },
  },
  {
    id: "teaching_checkpoint",
    group: "teaching",
    capability: {
      surfaces: [EDITOR_PERSONA_SURFACE],
      workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
    },
  },
  {
    id: "teaching_add_file",
    group: "teaching",
    capability: {
      surfaces: [EDITOR_PERSONA_SURFACE],
      workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
    },
  },
  {
    id: "teaching_set_lesson",
    group: "teaching",
    capability: {
      surfaces: [EDITOR_PERSONA_SURFACE],
      workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
    },
  },
  {
    id: "teaching_restore_checkpoint",
    group: "teaching",
    capability: {
      surfaces: [EDITOR_PERSONA_SURFACE],
      workspaceStates: [INTERACTIVE_WORKSPACE_STATE],
    },
  },
  {
    id: "python_calculator",
    group: "math",
    capability: {
      runtimeDependency: ADVANCED_MATH_RUNTIME_DEPENDENCY,
    },
  },
  { id: "save_question_set", group: "questionSet" },
  { id: "save_flashcard_deck", group: "flashcard" },
] as const

type LearningToolId = (typeof LEARNING_TOOL_METADATA)[number]["id"]
type LearningToolMetadata = {
  id: LearningToolId
  group: LearningToolGroup
  capability?: BuddyToolCapabilityConstraints
}

function cloneCapabilityConstraints(
  capability: BuddyToolCapabilityConstraints | undefined,
): BuddyToolCapabilityConstraints {
  if (!capability) {
    return {}
  }

  return {
    ...(capability.surfaces ? { surfaces: [...capability.surfaces] } : {}),
    ...(capability.workspaceStates ? { workspaceStates: [...capability.workspaceStates] } : {}),
    ...(capability.runtimeDependency ? { runtimeDependency: capability.runtimeDependency } : {}),
  }
}

function cloneLearningToolMetadata(input: LearningToolMetadata): LearningToolMetadata {
  return {
    ...input,
    ...(input.capability ? { capability: cloneCapabilityConstraints(input.capability) } : {}),
  }
}

function allLearningToolGroups(): LearningToolGroup[] {
  return Object.keys(LEARNING_TOOL_GROUP_POLICIES) as LearningToolGroup[]
}

function getLearningToolGroupPolicy(group: LearningToolGroup): LearningToolGroupPolicy {
  return LEARNING_TOOL_GROUP_POLICIES[group]
}

function allLearningToolMetadata(): LearningToolMetadata[] {
  return LEARNING_TOOL_METADATA.map((tool) => cloneLearningToolMetadata(tool))
}

function allLearningToolIds(): LearningToolId[] {
  return LEARNING_TOOL_METADATA.map((tool) => tool.id)
}

function getLearningToolMetadata(toolID: LearningToolId): LearningToolMetadata | undefined {
  return LEARNING_TOOL_METADATA.find((tool) => tool.id === toolID)
}

export {
  LEARNING_TOOL_GROUP_POLICIES,
  allLearningToolGroups,
  allLearningToolIds,
  allLearningToolMetadata,
  getLearningToolGroupPolicy,
  getLearningToolMetadata,
}

export type { LearningToolGroup, LearningToolGroupPolicy, LearningToolId, LearningToolMetadata }
