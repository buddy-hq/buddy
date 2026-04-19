import { defineBuddyPersona } from "./wiring/define-buddy-persona"

export const BUDDY = defineBuddyPersona({
  id: "buddy",
  label: "Buddy",
  description: "The default Buddy persona for learning conversations and project help.",
  domain: "general",
  defaultIntent: "learn",
  surfaces: ["curriculum", "flashcard", "question-set"],
  defaultSurface: "curriculum",
  hidden: false,
  toolDefaults: {
    learner_snapshot_read: "allow",
    learner_practice_record: "allow",
    learner_assessment_record: "allow",
    render_mermaid: "allow",
  },
  subagentDefaults: {
    "curriculum-orchestrator": "prefer",
    "goal-writer": "prefer",
    "question-set-author": "prefer",
    "flashcard-author": "prefer",
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
    prompt: "",
    permission: {
      todoread: "deny",
      todowrite: "deny",
    },
  },
})
