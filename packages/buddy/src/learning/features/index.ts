import { curriculumFeature } from "./curriculum/feature"
import { curriculumPlanningFeature } from "./curriculum-planning/feature"
import { memoryFeature } from "./memory/feature"
import { standardsFeature } from "./standards/feature"
import { readingFeature } from "./reading/feature"
import { teachingGuidanceFeature } from "./teaching-guidance/feature"
import { analogiesFeature } from "./analogies/feature"
import { stepwiseSolvingFeature } from "./stepwise-solving/feature"
import { debugGuidanceFeature } from "./debug-guidance/feature"
import { diagramsFeature } from "./diagrams/feature"
import { figureRenderingFeature } from "./figure-rendering/feature"
import { calculatorFeature } from "./calculator/feature"
import { lessonWorkspaceFeature } from "./lesson-workspace/feature"
import { practiceFeature } from "./practice/feature"
import { assessmentFeature } from "./assessment/feature"
import { questionSetsFeature } from "./question-sets/feature"
import { flashcardsFeature } from "./flashcards/feature"
import { mediaPresentationsFeature } from "./media-presentations/feature"
import { mathFeature } from "./math/feature"
import { whiteboardFeature } from "./whiteboard/feature"

const ALL_BUDDY_FEATURES = [
  curriculumFeature,
  curriculumPlanningFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  debugGuidanceFeature,
  diagramsFeature,
  figureRenderingFeature,
  calculatorFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  flashcardsFeature,
  mediaPresentationsFeature,
  mathFeature,
  whiteboardFeature,
] as const

export {
  curriculumFeature,
  curriculumPlanningFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  debugGuidanceFeature,
  diagramsFeature,
  figureRenderingFeature,
  calculatorFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  flashcardsFeature,
  mediaPresentationsFeature,
  mathFeature,
  whiteboardFeature,
  ALL_BUDDY_FEATURES,
}
