import MATH_BUDDY_OVERLAY from "./prompts/math-buddy.p.md"
import {
  DEFAULT_PRIMARY_PERSONA_PERMISSION,
  defineBuddyPersona,
} from "./wiring/define-buddy-persona"

export const MATH_BUDDY = defineBuddyPersona({
  id: "math-buddy",
  label: "Math Buddy",
  description:
    "Chat-first math Buddy persona with inline constrained geometry and unrestricted SVG figures.",
  domain: "math",
  surfaces: ["curriculum", "figure", "question-set"],
  defaultSurface: "figure",
  hidden: false,
  toolDefaults: {
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "allow",
    render_figure: "allow",
    render_freeform_figure: "allow",
    render_mermaid: "allow",
    python_calculator: "allow",
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
    pedagogy_stepwise_solve: "allow",
  },
  skillDefaults: {
    "buddy-pedagogy-learn": "allow",
    "buddy-pedagogy-practice": "allow",
    "buddy-pedagogy-assess": "allow",
    "buddy-pedagogy-explanation": "allow",
    "buddy-pedagogy-worked-example": "allow",
    "buddy-pedagogy-concept-contrast": "allow",
    "buddy-pedagogy-reading-assistant": "allow",
    "buddy-pedagogy-analogy": "allow",
  },
  subagentDefaults: {
    "practice-agent": "allow",
    "question-set-author": "allow",
  },
  contextPolicy: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: false,
    attachTeachingPolicy: false,
    attachFigureContext: true,
  },
  runtime: {
    kind: "primary",
    prompt: MATH_BUDDY_OVERLAY,
    permission: DEFAULT_PRIMARY_PERSONA_PERMISSION,
  },
})
