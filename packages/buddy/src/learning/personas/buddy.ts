import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import {
  curriculumFeature,
  curriculumPlanningFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  analogiesFeature,
  stepwiseSolvingFeature,
  diagramsFeature,
  questionSetsFeature,
  flashcardsFeature,
} from "../features"

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
    curriculumPlanningFeature,
    questionSetsFeature,
    flashcardsFeature,
  ],
  defaultSurface: "curriculum",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: false,
  },
  runtime: {
    kind: "build",
    prompt: "",
    permission: {
      todoread: "deny",
      todowrite: "deny",
    },
  },
})
