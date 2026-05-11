import CODE_BUDDY_OVERLAY from "./prompts/code-buddy.p.md"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import {
  curriculumFeature,
  memoryFeature,
  standardsFeature,
  readingFeature,
  teachingGuidanceFeature,
  debugGuidanceFeature,
  diagramsFeature,
  lessonWorkspaceFeature,
  practiceFeature,
  assessmentFeature,
  questionSetsFeature,
} from "../features"

export const CODE_BUDDY = defineBuddyPersona({
  id: "code-buddy",
  label: "Code Buddy",
  description: "Interactive code Buddy persona for the in-app lesson editor.",
  features: [
    curriculumFeature,
    memoryFeature,
    standardsFeature,
    readingFeature,
    teachingGuidanceFeature,
    debugGuidanceFeature,
    diagramsFeature,
    lessonWorkspaceFeature,
    practiceFeature,
    assessmentFeature,
    questionSetsFeature,
  ],
  defaultSurface: "editor",
  hidden: false,
  context: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: true,
    attachTeachingPolicy: true,
    attachFigureContext: false,
  },
  runtime: {
    kind: "primary",
    prompt: CODE_BUDDY_OVERLAY,
    availableSubagents: [
      "question-set-author",
      "flashcard-author",
      "general",
      "explore",
      "learner-memory-consolidator",
    ],
  },
})
