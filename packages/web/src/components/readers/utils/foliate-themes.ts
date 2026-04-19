import type {
  FoliateReaderPreferences,
  FoliateReaderThemeDefinition,
  FoliateReaderThemeId,
} from "../foliate-reader-types"
import { READER_THEMES, VIEW_ELEMENT_CLASS_NAME } from "../foliate-reader-constants"
import type { View as FoliateView } from "foliate-js/view.js"
import { FONT_PUBLISHER, FONT_SANS, FONT_SERIF } from "../foliate-reader-constants"

const MIN_READER_INLINE_CONTENT_WIDTH_PX = 320
const MIN_READER_MARGIN_PX = 16

export function getThemeDefinition(themeId: FoliateReaderThemeId): FoliateReaderThemeDefinition {
  return READER_THEMES.find((entry) => entry.id === themeId) ?? READER_THEMES[0]
}

export function isFoliateReaderThemeId(value: string): value is FoliateReaderThemeId {
  return READER_THEMES.some((entry) => entry.id === value)
}

// ---------------------------------------------------------------------------
// CSS variable resolution for iframe injection
// ---------------------------------------------------------------------------
// Theme definitions reference Buddy CSS custom properties (var(--xxx)) which
// are not available inside the foliate-js iframe. We resolve them to actual
// computed color values using a temporary DOM element before injection.
// ---------------------------------------------------------------------------

const COLOR_KEYS: (keyof FoliateReaderThemeDefinition)[] = [
  "contentBackground",
  "contentForeground",
  "contentMuted",
  "contentLink",
  "contentHeading",
  "contentAccent",
]

/** Resolve a CSS color expression (including var() and color-mix()) to a
 *  computed rgb/rgba string by temporarily applying it to a DOM element. */
function resolveColor(value: string): string {
  if (!value.includes("var(")) return value
  const el = document.createElement("div")
  el.style.display = "none"
  el.style.color = value
  document.body.appendChild(el)
  const resolved = getComputedStyle(el).color
  el.remove()
  return resolved || value
}

/** Return a copy of the theme definition with all color fields resolved to
 *  concrete values so they work inside an iframe without access to the host
 *  document's CSS custom properties. */
function resolveTheme(theme: FoliateReaderThemeDefinition): FoliateReaderThemeDefinition {
  const resolved = { ...theme }
  for (const key of COLOR_KEYS) {
    const raw = resolved[key]
    if (typeof raw === "string") {
      ;(resolved as Record<string, string>)[key] = resolveColor(raw)
    }
  }
  return resolved
}

// ---------------------------------------------------------------------------
// Style generation
// ---------------------------------------------------------------------------

const SERIF_STACK = `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`
const SANS_STACK = `"Avenir Next", "IBM Plex Sans", "Segoe UI", sans-serif`
const MONO_STACK = `"SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace`

function fontStack(preset: FoliateReaderPreferences["fontPreset"]): string {
  if (preset === FONT_SERIF) return SERIF_STACK
  if (preset === FONT_SANS) return SANS_STACK
  return "inherit"
}

/** Build the CSS that foliate-js injects into the book iframe.
 *
 *  When the user chooses a non-publisher font (Serif / Sans) we return a
 *  two-element array [baseCSS, overrideCSS] so that the override sheet is
 *  appended *after* the book's own styles and uses `!important` to force
 *  the chosen font. When using publisher font, a single string is returned. */
export function buildReaderStyles(
  theme: FoliateReaderThemeDefinition,
  preferences: FoliateReaderPreferences,
  appearance: "light" | "dark",
): [string, string] {
  const family = fontStack(preferences.fontPreset)
  const overrideFont = preferences.fontPreset !== FONT_PUBLISHER

  // ---- base stylesheet (prepended before book CSS) ----
  const base = `
    @namespace epub "http://www.idpf.org/2007/ops";

    :root {
      color-scheme: ${appearance};
      --buddy-reader-accent: ${theme.contentAccent};
    }

    html {
      color-scheme: ${appearance};
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      font-size: ${preferences.fontScaleRem}rem;
      ${overrideFont ? `font-family: ${family};` : ""}
    }

    body {
      margin: 0 auto;
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      accent-color: ${theme.contentLink};
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    a { color: ${theme.contentLink}; }
    a:visited { color: ${theme.contentLink}; }
  `

  // ---- override stylesheet (appended after book CSS) ----
  const override = `
    @namespace epub "http://www.idpf.org/2007/ops";

    ${
      overrideFont
        ? `
    body, body * {
      font-family: inherit !important;
    }
    `
        : ""
    }

    p, li, blockquote, dd {
      line-height: ${preferences.lineHeight};
      text-align: ${preferences.justify ? "justify" : "start"};
      -webkit-hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    h1, h2, h3, h4, h5, h6 {
      color: ${theme.contentHeading};
      line-height: 1.14;
      text-wrap: balance;
    }

    hr {
      border: 0;
      border-top: 1px solid color-mix(in oklab, ${theme.contentMuted} 34%, transparent);
    }

    pre, code, samp, kbd {
      font-family: ${MONO_STACK} !important;
    }

    pre {
      white-space: pre-wrap !important;
    }

    blockquote {
      color: ${theme.contentMuted};
      border-inline-start: 2px solid color-mix(in oklab, ${theme.contentMuted} 28%, transparent);
      margin-inline: 0;
      padding-inline-start: 1rem;
    }

    mark {
      background: color-mix(in oklab, ${theme.contentAccent} 72%, transparent);
      color: inherit;
    }

    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
      display: none;
    }
  `

  return [base, override]
}

export function applyReaderPreferences(
  view: FoliateView,
  theme: FoliateReaderThemeDefinition,
  preferences: FoliateReaderPreferences,
  appearance: "light" | "dark",
) {
  view.className = VIEW_ELEMENT_CLASS_NAME

  if (preferences.autohideCursor) view.setAttribute("autohide-cursor", "")
  else view.removeAttribute("autohide-cursor")

  const renderer = view.renderer
  if (!renderer) return

  const resolved = resolveTheme(theme)
  renderer.setStyles?.(buildReaderStyles(resolved, preferences, appearance))
  if (preferences.reduceMotion) renderer.removeAttribute("animated")
  else renderer.setAttribute("animated", "")

  if (!view.isFixedLayout) {
    const viewportWidth = view.getBoundingClientRect().width
    const maxMarginByWidth = Number.isFinite(viewportWidth)
      ? Math.floor((viewportWidth - MIN_READER_INLINE_CONTENT_WIDTH_PX) / 2)
      : preferences.marginPx
    const responsiveMarginPx = Math.min(
      preferences.marginPx,
      Math.max(MIN_READER_MARGIN_PX, maxMarginByWidth),
    )

    renderer.setAttribute("flow", preferences.flow)
    renderer.setAttribute("margin", `${responsiveMarginPx}px`)
    renderer.setAttribute("gap", `${preferences.gapPercent}%`)
    renderer.setAttribute("max-inline-size", `${preferences.maxInlineSizePx}px`)
    renderer.setAttribute("max-block-size", `${preferences.maxBlockSizePx}px`)
  }
}
