import { analogiesFeature } from "../features/analogies/feature"
import { assessmentFeature } from "../features/assessment/feature"
import { benchFeature } from "../features/bench/feature"
import { calculatorFeature } from "../features/calculator/feature"
import { curriculumFeature } from "../features/curriculum/feature"
import { diagramsFeature } from "../features/diagrams/feature"
import { figureRenderingFeature } from "../features/figure-rendering/feature"
import { flashcardsFeature } from "../features/flashcards/feature"
import { htmlWidgetsFeature } from "../features/html-widgets/feature"
import { mathFeature } from "../features/math/feature"
import { mediaPresentationsFeature } from "../features/media-presentations/feature"
import { memoryFeature } from "../features/memory/feature"
import { platformFeature } from "../features/platform/feature"
import { practiceFeature } from "../features/practice/feature"
import { questionSetsFeature } from "../features/question-sets/feature"
import { readingFeature } from "../features/reading/feature"
import { standardsFeature } from "../features/standards/feature"
import { stepwiseSolvingFeature } from "../features/stepwise-solving/feature"
import { teachingGuidanceFeature } from "../features/teaching-guidance/feature"
import { whiteboardFeature } from "../features/whiteboard/feature"

export const BUDDY_SHARED_FEATURES = [
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  benchFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  diagramsFeature,
  figureRenderingFeature,
  calculatorFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  flashcardsFeature,
  mediaPresentationsFeature,
  htmlWidgetsFeature,
  mathFeature,
  whiteboardFeature,
  platformFeature,
] as const
