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
  surfaces: ["curriculum", "question-set"],
  defaultSurface: "curriculum",
  hidden: false,
  toolDefaults: {
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "allow",
    render_mermaid: "allow",
    search_standards: "allow",
    get_standard: "allow",
    get_learning_components: "allow",
    get_prerequisites: "allow",
    get_next_standards: "allow",
    get_crosswalk: "allow",
    query_standards_sql: "allow",
    pedagogy_prepare_resource: "allow",
    pedagogy_resource_ingest_full_text: "allow",
    pedagogy_reflection: "allow",
  },
  skillDefaults: {
    "buddy-pedagogy-learn": "allow",
    "buddy-pedagogy-practice": "allow",
    "buddy-pedagogy-assess": "allow",
    "buddy-pedagogy-explanation": "allow",
    "buddy-pedagogy-worked-example": "allow",
    "buddy-pedagogy-concept-contrast": "allow",
    "buddy-pedagogy-reading-assistant": "allow",
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
