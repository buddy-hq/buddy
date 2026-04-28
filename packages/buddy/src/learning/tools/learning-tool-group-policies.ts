import {
  ADVANCED_MATH_RUNTIME_DEPENDENCY,
  STANDARDS_RUNTIME_DEPENDENCY,
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
  toolDiscovery: {
    registerWarning: "Failed to register Buddy dynamic tool-discovery tools into OpenCode runtime:",
    unregisterWarning:
      "Failed to unregister Buddy dynamic tool-discovery tools from OpenCode runtime:",
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

function allLearningToolGroups(): LearningToolGroup[] {
  return Object.keys(LEARNING_TOOL_GROUP_POLICIES) as LearningToolGroup[]
}

function getLearningToolGroupPolicy(group: LearningToolGroup): LearningToolGroupPolicy {
  return LEARNING_TOOL_GROUP_POLICIES[group]
}

export { LEARNING_TOOL_GROUP_POLICIES, allLearningToolGroups, getLearningToolGroupPolicy }

export type { LearningToolGroup, LearningToolGroupPolicy }
