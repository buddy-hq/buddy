import CODE_BUDDY_OVERLAY from "./prompts/code-buddy.p.md"
import { defineBuddyPersona } from "./wiring/define-buddy-persona"
import { assessmentFeature } from "../features/assessment/feature"
import { curriculumFeature } from "../features/curriculum/feature"
import { debugGuidanceFeature } from "../features/debug-guidance/feature"
import { diagramsFeature } from "../features/diagrams/feature"
import { lessonWorkspaceFeature } from "../features/lesson-workspace/feature"
import { mediaPresentationsFeature } from "../features/media-presentations/feature"
import { memoryFeature } from "../features/memory/feature"
import { practiceFeature } from "../features/practice/feature"
import { questionSetsFeature } from "../features/question-sets/feature"
import { readingFeature } from "../features/reading/feature"
import { standardsFeature } from "../features/standards/feature"
import { teachingGuidanceFeature } from "../features/teaching-guidance/feature"

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
    mediaPresentationsFeature,
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
    subagents: {
      "question-set-author": true,
      "flashcard-author": true,
      general: true,
      explore: true,
      "learner-memory-consolidator": true,
    },
  },
})
