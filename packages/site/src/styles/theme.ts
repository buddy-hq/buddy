/**
 * The site's theme contract.
 *
 * Single source of truth for every structural colour on the marketing site. Components must
 * not contain colour of their own — they reference these tokens and the active theme supplies
 * the values. `ThemeStyles.astro` emits `:root` plus one `[data-theme="…"]` block per theme,
 * so switching is a single attribute on <html> with no rebuild.
 *
 * Two kinds of colour exist on this site and only one of them lives here:
 *
 *   Structural — page, surfaces, borders, text, accent. Owned by the theme. Defined below.
 *   Depicted   — book covers, chess boards, syntax highlighting, the panda, a quiz's green
 *                tick. That is illustration inside a screenshot, not theme. It stays literal
 *                in the component and does NOT move when the theme moves.
 *
 * Token roles, not colour names: a theme is free to make `--accent-fill` any hue it likes and
 * no call site has to change.
 */

export const THEME_TOKEN_NAMES = [
  /** Wells and insets — the only surface that goes *below* the page. */
  "--surface-sunken",
  /** Page ground. The floor everything else is measured against. */
  "--surface-page",
  /** Default section/card fill, one step above the page. */
  "--surface-base",
  /** Raised card, two steps above the page. */
  "--surface-raised",
  /** Third step. For a card stacked on a card — use sparingly. */
  "--surface-high",
  /** Popovers and menus — things that genuinely float above the page. */
  "--surface-overlay",
  /** The sticky header. Translucent page colour, NOT an overlay: a header that is lighter
   *  than the page reads as a foreign bar pasted across the top. It should disappear into
   *  the page and let `backdrop-filter` do the separating. */
  "--surface-sticky",

  /** A block at the opposite end of the value scale from the page: the white Download
   *  button, an inverted badge. Neutral on purpose — this is not the accent. */
  "--invert-fill",
  "--invert-ink",

  /**
   * PRODUCT SHOTS. Every mock on the site — the hero window (both audiences), the reader,
   * the whiteboard, the game — is made of this ladder and nothing else. It is the mock
   * equivalent of `--paper-*`: a material, not a surface.
   *
   * Two rules make a mock read as a mock instead of as more website:
   *
   *   1. It sits BELOW the page. `--chrome-panel` is the mock ground and is a clear step
   *      darker than `--surface-page`. A mock lighter than the page reads as another
   *      section; a mock darker than it reads as a screen embedded in one.
   *   2. It carries the page's hue, so it is the same product — just a darker material.
   *
   * The ladder has eight rungs because a screenshot of Buddy has as much internal depth as
   * the page around it: a sidebar is not a title bar is not a chat bubble. Flattening that
   * is what makes a mock look like a dead rectangle. Ordered darkest → lightest.
   */
  "--chrome-screen",
  "--chrome-sunken",
  "--chrome-panel",
  "--chrome-bar",
  "--chrome-base",
  "--chrome-doc",
  "--chrome-raised",
  "--chrome-high",

  /** Whiteboard canvas — a rung of the product-shot family above, not a family of its own.
   *  It was previously near-neutral and read warm next to the rest of the mocks. */
  "--board-base",
  "--board-raised",
  "--board-grid",
  "--board-ink",
  "--board-ink-weak",

  /**
   * The aurora violet, carried over from the app's own onboarding nebula. One colour for
   * everything that is neither the page nor the action: Obsidian, a diagram branch, a chord
   * in a music tile. It replaces the scatter of blues, teals and purples that had
   * accumulated across the mocks.
   */
  "--aurora-base",
  "--aurora-ink",
  "--aurora-weak",
  "--aurora-border",

  "--border-weak",
  "--border-base",
  "--border-strong",

  /** Headlines. */
  "--fg-strong",
  /** Body copy. */
  "--fg-base",
  /** Secondary copy, captions. */
  "--fg-weak",
  /** Metadata, eyebrow labels, disabled. */
  "--fg-weaker",

  /** Accent as text or icon. */
  "--accent-base",
  /** Accent as a filled block — buttons. */
  "--accent-fill",
  /** Text on top of `--accent-fill`. */
  "--accent-ink",
  /** Accent as a tinted background. */
  "--accent-weak",
  /** Accent as a border. */
  "--accent-border",
  /** Ambient wash. Normally `transparent` — a section-wide accent glow is what made the old
   *  site read brown. Only a theme that means it should set this. */
  "--accent-glow",

  /** Marks Buddy itself made: eyebrows, its stroke on a board, the row it highlighted.
   *  In single-accent themes these equal the accent; in two-accent themes they diverge. */
  "--agent-base",
  "--agent-weak",
  "--agent-border",

  /** Reading surfaces — paper, not chrome. Vault notes, excerpts, a printed worksheet.
   *  Three rungs so a sheet can hold a recessed block and a footer without them merging. */
  "--paper-sunken",
  "--paper-base",
  "--paper-raised",
  "--paper-ink",
  "--paper-ink-soft",
  "--paper-ink-weak",
  "--paper-border",
  /** Highlighter on paper. */
  "--paper-mark",

  /** Shadow for elements sitting ON paper. Black shadows vanish on a dark page but read
   *  as grime on a light one, so this is far weaker than the dark-UI shadows below. */
  "--shadow-paper",
  "--shadow-raised",
  "--shadow-overlay",
] as const

export type ThemeTokenName = (typeof THEME_TOKEN_NAMES)[number]

/** Every theme must supply every token — no partial themes, no silent inheritance. */
export type ThemeTokens = Readonly<Record<ThemeTokenName, string>>

export type Theme = {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly tokens: ThemeTokens
}

const INK_SURFACES = {
  /**
   * Steps are ~0.045 L apart, not ~0.03. Below about 0.04 the eye reads two adjacent
   * surfaces as the same grey, which is exactly how the page ended up flat — a ladder with
   * rungs too close together is not a ladder.
   */
  "--surface-sunken": "oklch(0.163 0.013 264)",
  "--surface-page": "oklch(0.21 0.014 264)",
  "--surface-base": "oklch(0.254 0.015 264)",
  "--surface-raised": "oklch(0.298 0.016 264)",
  "--surface-high": "oklch(0.344 0.017 264)",
  "--surface-overlay": "oklch(0.32 0.017 264)",
  "--surface-sticky": "oklch(0.21 0.014 264 / 82%)",
  "--invert-fill": "oklch(0.955 0.003 264)",
  "--invert-ink": "oklch(0.2 0.012 264)",
  "--chrome-screen": "oklch(0.088 0.011 264)",
  "--chrome-sunken": "oklch(0.124 0.012 264)",
  "--chrome-panel": "oklch(0.158 0.013 264)",
  "--chrome-bar": "oklch(0.19 0.013 264)",
  "--chrome-base": "oklch(0.222 0.014 264)",
  "--chrome-doc": "oklch(0.258 0.015 264)",
  "--chrome-raised": "oklch(0.3 0.016 264)",
  "--chrome-high": "oklch(0.345 0.017 264)",
  "--board-base": "oklch(0.198 0.012 264)",
  "--board-raised": "oklch(0.248 0.013 264)",
  "--board-grid": "oklch(0.42 0.015 264)",
  "--board-ink": "oklch(0.94 0.008 264)",
  "--board-ink-weak": "oklch(0.7 0.01 264)",
  "--aurora-base": "oklch(0.72 0.17 292)",
  "--aurora-ink": "oklch(0.52 0.2 292)",
  "--aurora-weak": "oklch(0.72 0.17 292 / 14%)",
  "--aurora-border": "oklch(0.72 0.17 292 / 34%)",
  "--border-weak": "oklch(0.62 0.03 264 / 16%)",
  "--border-base": "oklch(0.62 0.03 264 / 26%)",
  "--border-strong": "oklch(0.66 0.035 264 / 42%)",
  "--fg-strong": "oklch(0.975 0.004 264)",
  "--fg-base": "oklch(0.9 0.008 264)",
  "--fg-weak": "oklch(0.78 0.012 264)",
  "--fg-weaker": "oklch(0.635 0.015 264)",
} as const satisfies Partial<ThemeTokens>

const PAPER_WARM = {
  "--paper-sunken": "oklch(0.925 0.016 85)",
  "--paper-base": "oklch(0.962 0.012 85)",
  "--paper-raised": "oklch(0.995 0.006 85)",
  "--paper-ink": "oklch(0.24 0.012 60)",
  "--paper-ink-soft": "oklch(0.36 0.012 60)",
  "--paper-ink-weak": "oklch(0.47 0.012 60)",
  "--paper-border": "oklch(0 0 0 / 12%)",
} as const satisfies Partial<ThemeTokens>

/**
 * Elevation on a dark UI comes from the surface ladder, not from shadow. These are
 * deliberately close to invisible: enough to seat an element, never enough to announce
 * itself. If something needs to look raised, move it up a surface step instead of
 * reaching for a bigger shadow.
 */
const SHADOWS = {
  "--shadow-paper": "0 2px 6px -3px rgb(0 0 0 / 0.13)",
  "--shadow-raised": "0 1px 2px rgb(0 0 0 / 0.18)",
  /**
   * Tight on purpose. A wide blur reads as a grey cloud rather than a shadow: on a small
   * card the haze covers more of the card than the card covers of the page, and on paper it
   * looks like dirt. Keep the blur close to the element and let the surface ladder carry
   * the depth.
   */
  "--shadow-overlay": "0 4px 12px -8px rgb(0 0 0 / 0.32)",
} as const satisfies Partial<ThemeTokens>

/** The live orange, unchanged from B · Ink in the easel. */
const ORANGE_BASE = {
  "--accent-base": "oklch(0.79 0.145 46)",
  "--accent-fill": "oklch(0.7 0.19 41)",
  "--accent-ink": "oklch(0.18 0.04 41)",
  "--accent-weak": "oklch(0.7 0.19 41 / 12%)",
  "--accent-border": "oklch(0.7 0.19 41 / 32%)",
  "--accent-glow": "transparent",
} as const satisfies Partial<ThemeTokens>

/** The same orange with the intensity turned up rather than down. */
const ORANGE_HOT = {
  "--accent-base": "oklch(0.76 0.185 45)",
  "--accent-fill": "oklch(0.7 0.205 42)",
  "--accent-ink": "oklch(0.19 0.05 42)",
  "--accent-weak": "oklch(0.7 0.205 42 / 14%)",
  "--accent-border": "oklch(0.7 0.205 42 / 34%)",
  "--accent-glow": "transparent",
} as const satisfies Partial<ThemeTokens>

export const THEME_INK = "ink"
export const THEME_INK_SIGNAL = "ink-signal"
export const THEME_INK_DUO = "ink-duo"
export const THEME_INK_MIDNIGHT = "ink-midnight"

export const DEFAULT_THEME_ID = THEME_INK_SIGNAL

export const THEMES = [
  {
    id: THEME_INK,
    name: "Ink",
    description: "Cool neutral ground, warm accent. The incumbent.",
    tokens: {
      ...INK_SURFACES,
      ...ORANGE_BASE,
      "--agent-base": "oklch(0.79 0.145 46)",
      "--agent-weak": "oklch(0.7 0.19 41 / 12%)",
      "--agent-border": "oklch(0.7 0.19 41 / 32%)",
      ...PAPER_WARM,
      "--paper-mark": "oklch(0.7 0.19 41 / 28%)",
      ...SHADOWS,
    },
  },
  {
    id: THEME_INK_SIGNAL,
    name: "Ink · Signal",
    description: "Ink's exact ground, accent turned up instead of down.",
    tokens: {
      ...INK_SURFACES,
      ...ORANGE_HOT,
      "--agent-base": "oklch(0.76 0.185 45)",
      "--agent-weak": "oklch(0.7 0.205 42 / 14%)",
      "--agent-border": "oklch(0.7 0.205 42 / 34%)",
      ...PAPER_WARM,
      "--paper-mark": "oklch(0.7 0.205 42 / 30%)",
      ...SHADOWS,
    },
  },
  {
    id: THEME_INK_DUO,
    name: "Ink · Duo",
    description: "Orange means act, teal means Buddy did this. Both at full chroma.",
    tokens: {
      ...INK_SURFACES,
      ...ORANGE_HOT,
      "--agent-base": "oklch(0.8 0.14 186)",
      "--agent-weak": "oklch(0.8 0.14 186 / 14%)",
      "--agent-border": "oklch(0.8 0.14 186 / 34%)",
      ...PAPER_WARM,
      "--paper-mark": "oklch(0.8 0.14 186 / 30%)",
      ...SHADOWS,
    },
  },
  {
    id: THEME_INK_MIDNIGHT,
    name: "Ink · Midnight",
    description: "Ink's ground made deeper and more saturated, not paler.",
    tokens: {
      "--surface-sunken": "oklch(0.146 0.023 264)",
      "--surface-page": "oklch(0.192 0.026 264)",
      "--surface-base": "oklch(0.236 0.029 264)",
      "--surface-raised": "oklch(0.281 0.031 264)",
      "--surface-high": "oklch(0.328 0.033 264)",
      "--surface-overlay": "oklch(0.304 0.032 264)",
      "--surface-sticky": "oklch(0.192 0.026 264 / 82%)",
      "--invert-fill": "oklch(0.955 0.006 264)",
      "--invert-ink": "oklch(0.185 0.024 264)",
      "--chrome-screen": "oklch(0.082 0.018 264)",
      "--chrome-sunken": "oklch(0.116 0.021 264)",
      "--chrome-panel": "oklch(0.148 0.024 264)",
      "--chrome-bar": "oklch(0.179 0.026 264)",
      "--chrome-base": "oklch(0.21 0.028 264)",
      "--chrome-doc": "oklch(0.245 0.03 264)",
      "--chrome-raised": "oklch(0.287 0.032 264)",
      "--chrome-high": "oklch(0.332 0.034 264)",
      "--board-base": "oklch(0.186 0.024 264)",
      "--board-raised": "oklch(0.236 0.026 264)",
      "--board-grid": "oklch(0.41 0.028 264)",
      "--board-ink": "oklch(0.94 0.01 264)",
      "--board-ink-weak": "oklch(0.7 0.014 264)",
      "--aurora-base": "oklch(0.73 0.18 292)",
      "--aurora-ink": "oklch(0.52 0.21 292)",
      "--aurora-weak": "oklch(0.73 0.18 292 / 16%)",
      "--aurora-border": "oklch(0.73 0.18 292 / 36%)",
      "--border-weak": "oklch(0.66 0.06 264 / 18%)",
      "--border-base": "oklch(0.66 0.06 264 / 28%)",
      "--border-strong": "oklch(0.7 0.065 264 / 44%)",
      "--fg-strong": "oklch(0.975 0.006 264)",
      "--fg-base": "oklch(0.9 0.012 264)",
      "--fg-weak": "oklch(0.785 0.018 264)",
      "--fg-weaker": "oklch(0.645 0.026 264)",
      ...ORANGE_HOT,
      "--accent-base": "oklch(0.78 0.18 48)",
      "--agent-base": "oklch(0.78 0.18 48)",
      "--agent-weak": "oklch(0.7 0.205 42 / 14%)",
      "--agent-border": "oklch(0.7 0.205 42 / 34%)",
      ...PAPER_WARM,
      "--paper-mark": "oklch(0.7 0.205 42 / 30%)",
      ...SHADOWS,
    },
  },
] as const satisfies readonly Theme[]

export type ThemeID = (typeof THEMES)[number]["id"]

/** Where the dev switcher remembers your pick. Deliberately not a URL param — the choice has
 *  to survive navigating between the landing page, /teachers, and /devtools. */
export const THEME_STORAGE_KEY = "buddy-site-theme"

export const THEME_IDS: readonly ThemeID[] = THEMES.map((theme) => theme.id)

export function isThemeID(value: string | null | undefined): value is ThemeID {
  return THEMES.some((theme) => theme.id === value)
}

function declarations(tokens: ThemeTokens): string {
  return THEME_TOKEN_NAMES.map((name) => `  ${name}: ${tokens[name]};`).join("\n")
}

/**
 * `:root` carries the default theme so the page is correct with no JS and no attribute.
 * Each theme also gets a `[data-theme]` block, which wins by specificity when set.
 */
export function buildThemeStylesheet(): string {
  const fallback = THEMES.find((theme) => theme.id === DEFAULT_THEME_ID)
  if (!fallback) throw new Error(`Default theme is missing: ${DEFAULT_THEME_ID}`)

  const blocks = THEMES.map(
    (theme) => `[data-theme="${theme.id}"] {\n${declarations(theme.tokens)}\n}`,
  )

  return [`:root {\n${declarations(fallback.tokens)}\n}`, ...blocks].join("\n\n")
}
