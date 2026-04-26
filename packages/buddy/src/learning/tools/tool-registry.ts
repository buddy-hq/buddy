import { flashcardTools } from "@buddy/backend/learning/capabilities/flashcard/tools/tools"
import { freeformFigureTools } from "@buddy/backend/learning/capabilities/figures/freeform/tools/tools"
import { figureTools } from "@buddy/backend/learning/capabilities/figures/geometry/tools/tools"
import { mermaidTools } from "@buddy/backend/learning/capabilities/figures/mermaid/tools/tools"
import { questionSetTools } from "@buddy/backend/learning/capabilities/question-set/tools/tools"
import { teachingTools } from "@buddy/backend/learning/capabilities/lesson-workspace/tools/tools"
import { mathTools } from "@buddy/backend/learning/capabilities/math/tools/tools"
import { pedagogyTools } from "@buddy/backend/learning/capabilities/pedagogy/tools/tools"
import { goalTools } from "@buddy/backend/learning/curriculum/goals/tools/tools"
import { curriculumTools } from "@buddy/backend/learning/curriculum/planning/tools/tools"
import { knowledgeGraphTools } from "@buddy/backend/learning/knowledge-graph/tools/tools"
import { learnerTools } from "@buddy/backend/learning/learner-model/tools/tools"
import { dynamicToolSearchTools } from "./dynamic-tool-search"
import {
  LEARNING_TOOL_GROUP_POLICIES,
  allLearningToolGroups,
  type LearningToolGroup,
  type LearningToolGroupPolicy,
} from "./tool-metadata"

const learningToolGroups = {
  pedagogy: pedagogyTools,
  curriculum: curriculumTools,
  knowledgeGraph: knowledgeGraphTools,
  figures: figureTools,
  freeformFigures: freeformFigureTools,
  mermaid: mermaidTools,
  goals: goalTools,
  learner: learnerTools,
  toolDiscovery: dynamicToolSearchTools,
  teaching: teachingTools,
  math: mathTools,
  questionSet: questionSetTools,
  flashcard: flashcardTools,
} as const

type RegisteredLearningTool = (typeof learningToolGroups)[LearningToolGroup][number]
type RegisteredLearningToolGroupDescriptor = LearningToolGroupPolicy & {
  tools: readonly RegisteredLearningTool[]
}

const registeredLearningToolGroupDescriptors = {
  pedagogy: {
    ...LEARNING_TOOL_GROUP_POLICIES.pedagogy,
    tools: learningToolGroups.pedagogy,
  },
  curriculum: {
    ...LEARNING_TOOL_GROUP_POLICIES.curriculum,
    tools: learningToolGroups.curriculum,
  },
  knowledgeGraph: {
    ...LEARNING_TOOL_GROUP_POLICIES.knowledgeGraph,
    tools: learningToolGroups.knowledgeGraph,
  },
  figures: {
    ...LEARNING_TOOL_GROUP_POLICIES.figures,
    tools: learningToolGroups.figures,
  },
  freeformFigures: {
    ...LEARNING_TOOL_GROUP_POLICIES.freeformFigures,
    tools: learningToolGroups.freeformFigures,
  },
  mermaid: {
    ...LEARNING_TOOL_GROUP_POLICIES.mermaid,
    tools: learningToolGroups.mermaid,
  },
  goals: {
    ...LEARNING_TOOL_GROUP_POLICIES.goals,
    tools: learningToolGroups.goals,
  },
  learner: {
    ...LEARNING_TOOL_GROUP_POLICIES.learner,
    tools: learningToolGroups.learner,
  },
  toolDiscovery: {
    ...LEARNING_TOOL_GROUP_POLICIES.toolDiscovery,
    tools: learningToolGroups.toolDiscovery,
  },
  teaching: {
    ...LEARNING_TOOL_GROUP_POLICIES.teaching,
    tools: learningToolGroups.teaching,
  },
  math: {
    ...LEARNING_TOOL_GROUP_POLICIES.math,
    tools: learningToolGroups.math,
  },
  questionSet: {
    ...LEARNING_TOOL_GROUP_POLICIES.questionSet,
    tools: learningToolGroups.questionSet,
  },
  flashcard: {
    ...LEARNING_TOOL_GROUP_POLICIES.flashcard,
    tools: learningToolGroups.flashcard,
  },
} as const satisfies Record<LearningToolGroup, RegisteredLearningToolGroupDescriptor>

function allRegisteredLearningTools(): RegisteredLearningTool[] {
  const tools: RegisteredLearningTool[] = []
  for (const group of allLearningToolGroups()) {
    tools.push(...registeredLearningToolGroupDescriptors[group].tools)
  }
  return tools
}

function getRegisteredLearningToolGroup(
  group: LearningToolGroup,
): readonly RegisteredLearningTool[] {
  return registeredLearningToolGroupDescriptors[group].tools
}

function getRegisteredLearningToolGroupDescriptor(
  group: LearningToolGroup,
): RegisteredLearningToolGroupDescriptor {
  return registeredLearningToolGroupDescriptors[group]
}

export {
  allRegisteredLearningTools,
  getRegisteredLearningToolGroup,
  getRegisteredLearningToolGroupDescriptor,
  registeredLearningToolGroupDescriptors,
}

export type { RegisteredLearningTool, RegisteredLearningToolGroupDescriptor }
