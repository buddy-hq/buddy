import type { BuddyTool } from "./create-buddy-tool"
import {
  deferredLearningTools,
  type LearningToolGroupDefinition,
} from "./learning-tool-group-definition"
import { flashcardLearningToolGroup } from "../capabilities/flashcard/tools/tools"
import { freeformFigureLearningToolGroup } from "../capabilities/figures/freeform/tools/tools"
import { figureLearningToolGroup } from "../capabilities/figures/geometry/tools/tools"
import { mermaidLearningToolGroup } from "../capabilities/figures/mermaid/tools/tools"
import { questionSetLearningToolGroup } from "../capabilities/question-set/tools/tools"
import { teachingLearningToolGroup } from "../capabilities/lesson-workspace/tools/tools"
import { mathLearningToolGroup } from "../capabilities/math/tools/tools"
import { pedagogyLearningToolGroup } from "../capabilities/pedagogy/tools/tools"
import { goalLearningToolGroup } from "../curriculum/goals/tools/tools"
import { curriculumLearningToolGroup } from "../curriculum/planning/tools/tools"
import { knowledgeGraphLearningToolGroup } from "../knowledge-graph/tools/tools"
import { learnerMemoryLearningToolGroup } from "../learner-memory/tools/tools"

const FEATURE_LEARNING_TOOL_GROUPS = [
  pedagogyLearningToolGroup,
  curriculumLearningToolGroup,
  knowledgeGraphLearningToolGroup,
  figureLearningToolGroup,
  freeformFigureLearningToolGroup,
  mermaidLearningToolGroup,
  goalLearningToolGroup,
  learnerMemoryLearningToolGroup,
  teachingLearningToolGroup,
  mathLearningToolGroup,
  questionSetLearningToolGroup,
  flashcardLearningToolGroup,
] as const

function allFeatureLearningToolGroups(): LearningToolGroupDefinition[] {
  return [...FEATURE_LEARNING_TOOL_GROUPS]
}

function allDeferredFeatureLearningTools(): BuddyTool[] {
  return FEATURE_LEARNING_TOOL_GROUPS.flatMap((group) => deferredLearningTools(group))
}

export { allDeferredFeatureLearningTools, allFeatureLearningToolGroups }
