import type { Transition } from "motion/react"

// ── Timing ──
export const ADVANCE_AFTER_SELECT_MS = 340
export const FINISH_EXPAND_DELAY_MS = 2_800
export const FINISH_NAVIGATE_DELAY_MS = 5_600
export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1]
export const SELECT_SPRING: Transition = { type: "spring", bounce: 0.24, duration: 0.5 }

// ── Fonts ──
export const FONT_LINK_ID = "ob-nocturne-fonts"
export const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&display=swap"
export const SERIF = '"Fraunces", Georgia, "Times New Roman", serif'
export const SANS = 'ui-sans-serif, -apple-system, "Segoe UI", sans-serif'
export const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", monospace'

export const ONBOARDING_STEPS = ["mode", "engine", "location"] as const
export type CinematicOnboardingStep = (typeof ONBOARDING_STEPS)[number]

/**
 * The location step runs two different actions, so a single busy flag cannot
 * label them: confirming made the picker button claim it was opening a picker.
 * Both controls lock while either runs; only the running one changes its label.
 */
export const LOCATION_ACTION = {
  confirm: "confirm",
  pick: "pick",
} as const

export type CinematicLocationAction = (typeof LOCATION_ACTION)[keyof typeof LOCATION_ACTION]

export const COPY = {
  intro: {
    heading: ["Hey, I'm Buddy."],
    begin: "Let's begin",
  },
  mode: {
    // A sentence the rows complete. Both options used to carry "I'm here to"
    // in full, so it moves up here and the rows keep only what differs.
    heading: ["I'm here to…"],
    choiceLearn: {
      title: "Learn",
      description: "For students, researchers, and lifelong learners.",
    },
    choiceTeach: {
      title: "Teach",
      description: "For school teachers and homeschoolers.",
    },
  },
  engine: {
    heading: ["Buddy works with", "100+ AI providers."],
    subheading: "ChatGPT gives you the best experience.",
    choiceChatGPT: {
      title: "ChatGPT",
      description: "Works with free and paid accounts.",
    },
    choiceFree: {
      title: "Free models",
      description: "No sign-in. Limited messages and intelligence.",
    },
    // The other providers are real but unreachable from onboarding, so they are
    // stated, never offered. Naming four makes "50+" concrete without wiring.
    footnote:
      "Anthropic, Gemini, OpenRouter, Ollama and 100+ more. Add any of them in Settings once you're in.",
  },
  location: {
    // One line of orientation, the folder, accept or change. The eyebrow, the
    // subheading and the reassurance footnote all restated the heading, and the
    // "Recommended" tag restated the fact that Buddy proposed the folder at all.
    heading: ["Your work lives here."],
    btnConfirm: "Use this",
    btnConfirmSettingUp: "Setting up…",
    btnCustom: "Choose a different home",
    btnCustomOpening: "Opening picker…",
  },
  details: {
    eyebrow: "Last thing, optional",
    heading: ["Tell me about", "yourself."],
    labelName: "What should Buddy call you?",
    placeholderName: "Your name",
    labelOccupation: "What do you do?",
    placeholderOccupation: "e.g. Student, Software Developer, Teacher",
    labelAbout: "Goals, context, or how you like to work",
    placeholderAbout: "Write a line or two (optional)...",
    btnFinish: "Enter Buddy",
    btnSkip: "Skip for now",
  },
  chrome: {
    backButton: "Back",
  },
  auth: {
    title: "Connecting ChatGPT",
    description: "Finish sign-in in your browser…",
    cancel: "Cancel sign-in",
  },
} as const

// ── Animation Variants ──
export const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.06 } },
  exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
}
export const rise = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE_OUT } },
  exit: { opacity: 0, y: -12, transition: { duration: 0.2, ease: EASE_OUT } },
}
export const lineMask = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.02 } },
  exit: { transition: { staggerChildren: 0.03 } },
}
export const lineInner = {
  hidden: { y: "115%" },
  show: { y: "0%", transition: { duration: 0.62, ease: EASE_OUT } },
  exit: { y: "-45%", opacity: 0, transition: { duration: 0.24, ease: EASE_OUT } },
}

// ── Theme ──
export type ThemeId = "nocturne"

export type ThemeConfig = {
  id: ThemeId
  name: string
  ring: string
  ring2: string
  soft: string
  word: string
  ink: string
  bloom: string
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  nocturne: {
    id: "nocturne",
    name: "Ember Nocturne",
    ring: "#FF6A2C",
    ring2: "#FF8A4C",
    soft: "rgba(255, 106, 44, 0.16)",
    word: "#FF9256",
    ink: "#180b04",
    bloom: "rgba(255, 120, 60, 0.45)",
  },
}

// ── Background Space ──
export type SpaceId = "nebula-orion"
export type SpaceColorId = "amethyst"
export type TransitionId = "dissolve"
export type MoodKey = "neutral" | "learn" | "teach"
export type MoodColors = { a: string; b: string; c: string; core: string }

export type SpaceConfig = {
  id: SpaceId
  name: string
  bg: string
  moods: Record<MoodKey, MoodColors>
  grainOpacity?: number
}

export const SPACES: Record<SpaceId, SpaceConfig> = {
  "nebula-orion": {
    id: "nebula-orion",
    name: "Cosmic Orion Nebula",
    bg: "#010102",
    moods: {
      neutral: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      learn: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
      teach: {
        a: "rgba(255, 0, 85, 0.35)",
        b: "rgba(186, 104, 200, 0.25)",
        c: "rgba(236, 72, 153, 0.15)",
        core: "rgba(255, 64, 129, 0.55)",
      },
    },
    grainOpacity: 0.05,
  },
}

export function getBgFilter(): string {
  return "hue-rotate(295deg) saturate(1.3)"
}
