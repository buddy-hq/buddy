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

export const ONBOARDING_STEPS = ["mode", "engine", "location", "details"] as const
export type CinematicOnboardingStep = (typeof ONBOARDING_STEPS)[number]

export const COPY = {
  intro: {
    heading: ["Hey — I'm Buddy."],
    subtitle: "Let's make this space yours. Takes about a minute.",
    clickToBegin: "Click to begin",
  },
  mode: {
    eyebrow: "Let's begin",
    heading: ["What brings you", "to Buddy today?"],
    choiceLearn: {
      title: "I'm here to learn.",
      description: "For students, researchers, and lifelong learners.",
    },
    choiceTeach: {
      title: "I'm here to teach.",
      description: "For school teachers and homeschoolers.",
    },
    footnote: "You can change this anytime in Settings.",
  },
  engine: {
    eyebrow: "The Engine",
    heading: ["Pick the mind", "behind Buddy."],
    choiceChatGPT: {
      title: "Connect ChatGPT",
      description: "Works with both free and paid plans. Recommended.",
    },
    choiceFree: {
      title: "Use Free Models",
      description: "No login, but limited messages and intelligence.",
      tag: "Instant",
    },
    footnote: "More connection options available in the Settings.",
  },
  location: {
    eyebrow: "Your space",
    heading: ["Buddy keeps your", "work in one place."],
    folderLabelCustom: "Chosen folder",
    folderLabelDefault: "Recommended",
    btnConfirm: "Use this location",
    btnConfirmSettingUp: "Setting up…",
    btnCustom: "Choose a different folder",
    btnCustomOpening: "Opening picker…",
    footnote: "You can still open folders from anywhere later.",
  },
  details: {
    eyebrow: "Last thing — optional",
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
