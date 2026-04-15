import BUDDY_BASE_PROMPT from "./buddy.p.md"
import { composePersonaPrompt, defineBuddyPersona } from "./wiring/define-buddy-persona"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
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
    render_saved_question_set: "allow",
  },
  subagentDefaults: {
    "curriculum-orchestrator": "prefer",
    "goal-writer": "prefer",
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
    kind: "build",
    prompt: composePersonaPrompt(BUDDY_BASE_PROMPT),
    permission: {
      todoread: "deny",
      todowrite: "deny",
    },
  },
})
