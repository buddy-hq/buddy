/**
 * Competitor logo assets for compare banners and OG generation.
 * Paths are relative to `packages/site` for Node scripts; Astro imports live in CompareBanner.
 */
export type CompareLogoId =
  | "buddy-vs-chatgpt"
  | "buddy-vs-claude-teachers"
  | "buddy-vs-diffit"
  | "buddy-vs-khanmigo"
  | "buddy-vs-knowt"
  | "buddy-vs-magicschool"
  | "buddy-vs-notebooklm"
  | "buddy-vs-quizlet"
  | "buddy-vs-remnote"

export type CompareLogoMeta = {
  readonly id: CompareLogoId
  /** Filename under src/assets/competitors/ */
  readonly file: string
  /** Brand accent for gradient (hex) */
  readonly accent: string
  /** Prefer light plate behind monochrome / dark marks */
  readonly plate: "light" | "dark" | "none"
}

export const BUDDY_ACCENT = "#FF6B35"

export const COMPARE_LOGOS = {
  "buddy-vs-chatgpt": {
    id: "buddy-vs-chatgpt",
    file: "chatgpt.svg",
    accent: "#10A37F",
    plate: "dark",
  },
  "buddy-vs-claude-teachers": {
    id: "buddy-vs-claude-teachers",
    file: "claude.svg",
    accent: "#D97757",
    plate: "light",
  },
  "buddy-vs-diffit": {
    id: "buddy-vs-diffit",
    file: "diffit.webp",
    accent: "#0B9B6B",
    plate: "light",
  },
  "buddy-vs-khanmigo": {
    id: "buddy-vs-khanmigo",
    file: "khanmigo.svg",
    accent: "#14BF96",
    plate: "light",
  },
  "buddy-vs-knowt": {
    id: "buddy-vs-knowt",
    file: "knowt.png",
    accent: "#2DD4BF",
    plate: "none",
  },
  "buddy-vs-magicschool": {
    id: "buddy-vs-magicschool",
    file: "magicschool.png",
    accent: "#7C3AED",
    plate: "light",
  },
  "buddy-vs-notebooklm": {
    id: "buddy-vs-notebooklm",
    file: "notebooklm.svg",
    accent: "#4285F4",
    plate: "light",
  },
  "buddy-vs-quizlet": {
    id: "buddy-vs-quizlet",
    file: "quizlet.svg",
    accent: "#4255FF",
    plate: "light",
  },
  "buddy-vs-remnote": {
    id: "buddy-vs-remnote",
    file: "remnote.svg",
    accent: "#506CF7",
    plate: "light",
  },
} satisfies Readonly<Record<CompareLogoId, CompareLogoMeta>>

export function isCompareLogoId(value: string): value is CompareLogoId {
  return Object.hasOwn(COMPARE_LOGOS, value)
}

export function getCompareLogoMeta(entryId: string): CompareLogoMeta {
  if (!isCompareLogoId(entryId)) {
    throw new Error(`No competitor logo registered for compare entry "${entryId}".`)
  }
  return COMPARE_LOGOS[entryId]
}

export function getCompareOgImagePath(entryId: string): string {
  return `/og/${entryId}.png`
}
