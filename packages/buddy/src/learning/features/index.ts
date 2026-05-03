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
import { mathFiguresFeature } from "./math-figures/feature"
import { calculatorFeature } from "./calculator/feature"
import { lessonWorkspaceFeature } from "./lesson-workspace/feature"
import { practiceFeature } from "./practice/feature"
import { assessmentFeature } from "./assessment/feature"
import { questionSetsFeature } from "./question-sets/feature"
import { flashcardsFeature } from "./flashcards/feature"

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
  mathFiguresFeature,
  calculatorFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  flashcardsFeature,
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
  mathFiguresFeature,
  calculatorFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  flashcardsFeature,
  ALL_BUDDY_FEATURES,
}
