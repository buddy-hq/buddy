import type { BuddyModeID, BuddyModeProfile } from "./types.js"

const BUILTIN_BUDDY_MODES: Record<BuddyModeID, BuddyModeProfile> = {
  buddy: {
    id: "buddy",
    label: "Buddy",
    description: "General Buddy mode for learning conversations and project help.",
    runtimeAgent: "buddy",
    surfaces: ["curriculum"],
    defaultSurface: "curriculum",
    hidden: false,
    behavior: {
      sessionProfile: "general",
      attachCurriculum: true,
      attachTeachingWorkspace: false,
      attachTeachingPolicy: false,
    },
  },
  "code-buddy": {
    id: "code-buddy",
    label: "Code Buddy",
    description: "Buddy mode for hands-on coding lessons with the editor workspace.",
    runtimeAgent: "code-buddy",
    surfaces: ["curriculum", "editor"],
    defaultSurface: "editor",
    hidden: false,
    behavior: {
      sessionProfile: "workspace",
      attachCurriculum: true,
      attachTeachingWorkspace: true,
      attachTeachingPolicy: true,
    },
  },
  "math-buddy": {
    id: "math-buddy",
    label: "Math Buddy",
    description: "Buddy mode for math coaching with inline figure tools.",
    runtimeAgent: "math-buddy",
    surfaces: ["curriculum", "figure"],
    defaultSurface: "figure",
    hidden: false,
    behavior: {
      sessionProfile: "figure",
      attachCurriculum: true,
      attachTeachingWorkspace: false,
      attachTeachingPolicy: false,
    },
  },
}

export function builtinBuddyModes(): Record<BuddyModeID, BuddyModeProfile> {
  return {
    buddy: {
      ...BUILTIN_BUDDY_MODES.buddy,
      surfaces: [...BUILTIN_BUDDY_MODES.buddy.surfaces],
    },
    "code-buddy": {
      ...BUILTIN_BUDDY_MODES["code-buddy"],
      surfaces: [...BUILTIN_BUDDY_MODES["code-buddy"].surfaces],
    },
    "math-buddy": {
      ...BUILTIN_BUDDY_MODES["math-buddy"],
      surfaces: [...BUILTIN_BUDDY_MODES["math-buddy"].surfaces],
    },
  }
}
