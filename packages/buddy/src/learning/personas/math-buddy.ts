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
  defaultIntent: "learn",
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
    render_saved_question_set: "allow",
    python_calculator: "allow",
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
