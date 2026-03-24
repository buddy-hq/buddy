import type { BuddyPersona, BuddyPersonaProfile } from "./types"

const RESERVED_SUBAGENT_DEFAULTS = {
  "progress-tracker": "deny",
  sequencer: "deny",
  "alignment-auditor": "deny",
  "exercise-author": "deny",
} as const

const BUILTIN_BUDDY_PERSONAS = {
  buddy: {
    id: "buddy",
    label: "Buddy",
    description: "General Buddy persona for learning conversations and project help.",
    domain: "general",
    defaultIntent: "learn",
    surfaces: ["curriculum"],
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
      ...RESERVED_SUBAGENT_DEFAULTS,
    },
    contextPolicy: {
      attachCurriculum: true,
      attachProgress: true,
      attachTeachingWorkspace: false,
      attachTeachingPolicy: false,
      attachFigureContext: false,
    },
  },
  "code-buddy": {
    id: "code-buddy",
    label: "Code Buddy",
    description: "Coding-focused Buddy persona for hands-on lessons with the editor workspace.",
    domain: "coding",
    defaultIntent: "practice",
    surfaces: ["curriculum", "editor"],
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
      "feedback-engine": "prefer",
      ...RESERVED_SUBAGENT_DEFAULTS,
    },
    contextPolicy: {
      attachCurriculum: true,
      attachProgress: true,
      attachTeachingWorkspace: true,
      attachTeachingPolicy: true,
      attachFigureContext: false,
    },
  },
  "math-buddy": {
    id: "math-buddy",
    label: "Math Buddy",
    description: "Math-focused Buddy persona for coaching with inline figure tools.",
    domain: "math",
    defaultIntent: "learn",
    surfaces: ["curriculum", "figure"],
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
    },
    subagentDefaults: {
      "analogy-author": "prefer",
      "solution-checker": "prefer",
      "practice-agent": "allow",
      ...RESERVED_SUBAGENT_DEFAULTS,
    },
    contextPolicy: {
      attachCurriculum: true,
      attachProgress: true,
      attachTeachingWorkspace: false,
      attachTeachingPolicy: false,
      attachFigureContext: true,
    },
  },
} as const

export function builtinBuddyPersonas(): Record<BuddyPersona, BuddyPersonaProfile> {
  return {
    buddy: {
      ...BUILTIN_BUDDY_PERSONAS.buddy,
      surfaces: [...BUILTIN_BUDDY_PERSONAS.buddy.surfaces],
    },
    "code-buddy": {
      ...BUILTIN_BUDDY_PERSONAS["code-buddy"],
      surfaces: [...BUILTIN_BUDDY_PERSONAS["code-buddy"].surfaces],
    },
    "math-buddy": {
      ...BUILTIN_BUDDY_PERSONAS["math-buddy"],
      surfaces: [...BUILTIN_BUDDY_PERSONAS["math-buddy"].surfaces],
    },
  }
}

export { BUILTIN_BUDDY_PERSONAS }
