import READING_BUDDY_OVERLAY from "./prompts/reading-buddy.p.md"
import {
  DEFAULT_PRIMARY_PERSONA_PERMISSION,
  defineBuddyPersona,
} from "./wiring/define-buddy-persona"

export const READING_BUDDY = defineBuddyPersona({
  id: "reading-buddy",
  label: "Reading Buddy",
  description: "Reading-focused Buddy persona for building comprehension and literacy skills.",
  domain: "general",
  defaultIntent: "learn",
  surfaces: ["curriculum", "question-set"],
  defaultSurface: "curriculum",
  hidden: false,
  toolDefaults: {
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "allow",
    render_mermaid: "allow",
  },
  subagentDefaults: {
    "practice-agent": "prefer",
    "assessment-agent": "allow",
    "question-set-author": "prefer",
  },
  contextPolicy: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: false,
  },
  runtime: {
    kind: "primary",
    prompt: READING_BUDDY_OVERLAY,
    permission: DEFAULT_PRIMARY_PERSONA_PERMISSION,
  },
})
