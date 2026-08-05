/**
 * Devtools registry for the marketing site.
 *
 * Mirrors the easel in `packages/web`: a prototype picker, a subtitle, and a stage.
 * Prototypes live in `src/devtools/easel/` as single throwaway `.astro` files and are
 * wired into the stage in `src/pages/devtools/index.astro`.
 */

export const DEVTOOLS_PATH = "/devtools"
export const DEVTOOLS_PROTOTYPE_PARAM = "p"

export const EASEL_HERO_ANNOUNCEMENT = "hero-announcement-chip"
export const EASEL_DRAW_FIGURES = "draw-figure-directions"
export const EASEL_SURFACE_PALETTE = "surface-palette-directions"
export const EASEL_FREE_SECTION = "free-section-directions"
export const EASEL_FREE_SECTION_R2 = "free-section-round2"
export const EASEL_FREE_SECTION_R3 = "free-section-round3"
export const EASEL_FREE_SECTION_R4 = "free-section-round4"
export const EASEL_FREE_SECTION_R5 = "free-section-round5"
export const EASEL_FREE_SECTION_R6 = "free-section-round6"
export const EASEL_FREE_SECTION_R7 = "free-section-round7"
export const EASEL_FOOTER = "footer-directions"

export type EaselPrototypeID =
  | typeof EASEL_HERO_ANNOUNCEMENT
  | typeof EASEL_DRAW_FIGURES
  | typeof EASEL_SURFACE_PALETTE
  | typeof EASEL_FREE_SECTION
  | typeof EASEL_FREE_SECTION_R2
  | typeof EASEL_FREE_SECTION_R3
  | typeof EASEL_FREE_SECTION_R4
  | typeof EASEL_FREE_SECTION_R5
  | typeof EASEL_FREE_SECTION_R6
  | typeof EASEL_FREE_SECTION_R7
  | typeof EASEL_FOOTER

export type EaselPrototype = {
  readonly id: EaselPrototypeID
  readonly label: string
  readonly subtitle: string
}

export const EASEL_PROTOTYPES = [
  {
    id: EASEL_HERO_ANNOUNCEMENT,
    label: "Hero · announcement chip for the launch video",
    subtitle:
      "Same four words in all seven, so the comparison is form not copy · every chip plays the video in a lightbox instead of leaving for YouTube · A pill · B ticket · C live dot · D thumbnail · E row-end · F bare link · G seam tab · plus all seven at 390px",
  },
  {
    id: EASEL_DRAW_FIGURES,
    label: "Draw · six figures that aren't a node graph",
    subtitle:
      "What Buddy sketches on the board, when the concept map is retired · A marked-up line · B quadrant · C derivation · D iron string · E two voices · F chapter map · desktop and phone side by side",
  },
  {
    id: EASEL_FOOTER,
    label: "Footer · five directions",
    subtitle:
      "Desktop and mobile side by side via container queries · A masthead · B single line · C sign-off · D columns · E rail",
  },
  {
    id: EASEL_FREE_SECTION_R7,
    label: "Free section · round 7 (anchor + options)",
    subtitle:
      "T arrangement — $0 and the app's price above the rule, your AI and its options below · U slot · V handwritten annotation",
  },
  {
    id: EASEL_FREE_SECTION_R6,
    label: "Free section · round 6 (air)",
    subtitle:
      "Four words max, one dominant element, deep vertical padding · Q centred · R split · S left-set with marks",
  },
  {
    id: EASEL_FREE_SECTION_R5,
    label: "Free section · round 5 (in context)",
    subtitle:
      "Left-set, visual-first, shown between stubs of its real neighbours · N Split · O The bill · P Lockup",
  },
  {
    id: EASEL_FREE_SECTION_R4,
    label: "Free section · round 4 (Billboard, fixed)",
    subtitle:
      "Three fixes for the Billboard's hierarchy — H claim-dominant, I claim + reason, J proof-dominant · copy alternates included",
  },
  {
    id: EASEL_FREE_SECTION_R3,
    label: "Free section · round 3 (page-native)",
    subtitle:
      "Four directions that match the landing page aesthetic — same fonts, tokens, spacing, and open layout",
  },
  {
    id: EASEL_FREE_SECTION_R2,
    label: "Free section · round 2 (minimal text)",
    subtitle:
      "Four minimal-text alternatives: Price Tag, Stack, Scoreboard, Pill Bar · mobile-first",
  },
  {
    id: EASEL_FREE_SECTION,
    label: "Free section · three directions",
    subtitle:
      "Three alternatives for the 'it's free + bring your own AI' section · learner and educator side by side",
  },
  {
    id: EASEL_SURFACE_PALETTE,
    label: "Surfaces · the live themes",
    subtitle:
      "Rendered from src/styles/theme.ts, the same data the landing page uses · Before is frozen for comparison · switch the real site with the floating Theme control",
  },
] as const satisfies readonly EaselPrototype[]

export const DEFAULT_EASEL_PROTOTYPE: EaselPrototypeID = EASEL_HERO_ANNOUNCEMENT

function isEaselPrototypeID(value: string | null): value is EaselPrototypeID {
  return EASEL_PROTOTYPES.some((prototype) => prototype.id === value)
}

export function resolveEaselPrototype(url: URL): EaselPrototype {
  const requested = url.searchParams.get(DEVTOOLS_PROTOTYPE_PARAM)
  const id = isEaselPrototypeID(requested) ? requested : DEFAULT_EASEL_PROTOTYPE
  const prototype = EASEL_PROTOTYPES.find((candidate) => candidate.id === id)
  if (!prototype) throw new Error(`Unknown easel prototype: ${id}`)
  return prototype
}
