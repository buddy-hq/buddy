import MATH_BUDDY_OVERLAY from "./prompts/math-buddy.p.md"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import { analogiesFeature } from "../features/analogies/feature"
import { calculatorFeature } from "../features/calculator/feature"
import { curriculumFeature } from "../features/curriculum/feature"
import { diagramsFeature } from "../features/diagrams/feature"
import { figureRenderingFeature } from "../features/figure-rendering/feature"
import { mediaPresentationsFeature } from "../features/media-presentations/feature"
import { memoryFeature } from "../features/memory/feature"
import { practiceFeature } from "../features/practice/feature"
import { questionSetsFeature } from "../features/question-sets/feature"
import { readingFeature } from "../features/reading/feature"
import { standardsFeature } from "../features/standards/feature"
import { stepwiseSolvingFeature } from "../features/stepwise-solving/feature"
import { teachingGuidanceFeature } from "../features/teaching-guidance/feature"

export const MATH_BUDDY = defineBuddyPersona({
  id: "math-buddy",
  label: "Math Buddy",
  description:
    "Chat-first math Buddy persona with inline constrained geometry and unrestricted SVG figures.",
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
    questionSetsFeature,
    mediaPresentationsFeature,
  ],
  defaultSurface: "figure",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "primary",
    prompt: MATH_BUDDY_OVERLAY,
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
