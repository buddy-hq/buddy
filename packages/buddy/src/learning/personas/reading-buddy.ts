import READING_BUDDY_OVERLAY from "./prompts/reading-buddy.p.md"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import {
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  diagramsFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
  mediaPresentationsFeature,
} from "../features"

export const READING_BUDDY = defineBuddyPersona({
  id: "reading-buddy",
  label: "Reading Buddy",
  description: "Reading-focused Buddy persona for building comprehension and literacy skills.",
  features: [
    curriculumFeature,
    memoryFeature,
    standardsFeature,
    readingFeature,
    teachingGuidanceFeature,
    diagramsFeature,
    practiceFeature,
    assessmentFeature,
    questionSetsFeature,
    mediaPresentationsFeature,
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
    kind: "primary",
    prompt: READING_BUDDY_OVERLAY,
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
    },
  },
})
