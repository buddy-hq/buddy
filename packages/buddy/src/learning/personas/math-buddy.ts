import MATH_BUDDY_OVERLAY from "./prompts/math-buddy.p.md"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import {
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  diagramsFeature,
  mathFiguresFeature,
  calculatorFeature,
  practiceFeature,
  questionSetsFeature,
} from "../features"

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
    mathFiguresFeature,
    calculatorFeature,
    practiceFeature,
    questionSetsFeature,
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
    availableSubagents: ["question-set-author", "flashcard-author", "general"],
  },
})
