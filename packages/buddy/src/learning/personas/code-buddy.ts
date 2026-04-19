import CODE_BUDDY_OVERLAY from "./prompts/code-buddy.p.md"
import {
  DEFAULT_PRIMARY_PERSONA_PERMISSION,
  defineBuddyPersona,
} from "./wiring/define-buddy-persona"

export const CODE_BUDDY = defineBuddyPersona({
  id: "code-buddy",
  label: "Code Buddy",
  description: "Interactive code Buddy persona for the in-app lesson editor.",
  domain: "coding",
  defaultIntent: "practice",
  surfaces: ["curriculum", "editor", "question-set"],
  defaultSurface: "editor",
  hidden: false,
  toolDefaults: {
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "allow",
    teaching_start_lesson: "allow",
    teaching_checkpoint: "allow",
    teaching_add_file: "allow",
    teaching_set_lesson: "allow",
    teaching_restore_checkpoint: "allow",
    render_mermaid: "allow",
  },
  subagentDefaults: {
    "practice-agent": "prefer",
    "assessment-agent": "allow",
    "question-set-author": "allow",
  },
  contextPolicy: {
    attachCurriculum: true,
    attachProgress: true,
    attachTeachingWorkspace: true,
    attachTeachingPolicy: true,
    attachFigureContext: false,
  },
  runtime: {
    kind: "primary",
    prompt: CODE_BUDDY_OVERLAY,
    permission: DEFAULT_PRIMARY_PERSONA_PERMISSION,
  },
})
