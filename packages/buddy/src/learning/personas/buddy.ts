import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import { analogiesFeature } from "../features/analogies/feature"
import { assessmentFeature } from "../features/assessment/feature"
import { calculatorFeature } from "../features/calculator/feature"
import { curriculumFeature } from "../features/curriculum/feature"
import { diagramsFeature } from "../features/diagrams/feature"
import { figureRenderingFeature } from "../features/figure-rendering/feature"
import { flashcardsFeature } from "../features/flashcards/feature"
import { mathFeature } from "../features/math/feature"
import { mediaPresentationsFeature } from "../features/media-presentations/feature"
import { memoryFeature } from "../features/memory/feature"
import { practiceFeature } from "../features/practice/feature"
import { questionSetsFeature } from "../features/question-sets/feature"
import { readingFeature } from "../features/reading/feature"
import { standardsFeature } from "../features/standards/feature"
import { stepwiseSolvingFeature } from "../features/stepwise-solving/feature"
import { teachingGuidanceFeature } from "../features/teaching-guidance/feature"
import { whiteboardFeature } from "../features/whiteboard/feature"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
  features: [
    curriculumFeature,
    memoryFeature,
    standardsFeature,
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
    mathFeature,
    whiteboardFeature,
  ],
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "build",
    prompt: "",
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
      "learner-memory-consolidator": true,
    },
  },
})
