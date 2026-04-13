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

export function buildReaderStyles(
  theme: FoliateReaderThemeDefinition,
  preferences: FoliateReaderPreferences,
  appearance: "light" | "dark",
) {
  const fontFamily =
    preferences.fontPreset === FONT_SERIF
      ? `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif`
      : preferences.fontPreset === FONT_SANS
        ? `"Avenir Next", "IBM Plex Sans", "Segoe UI", sans-serif`
        : "inherit"

  return `
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
      ${preferences.fontPreset === FONT_PUBLISHER ? "" : `font-family: ${fontFamily};`}
    }

    body {
      margin: 0 auto;
      background: ${theme.contentBackground};
      color: ${theme.contentForeground};
      accent-color: ${theme.contentLink};
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    p,
    li,
    blockquote,
    dd {
      line-height: ${preferences.lineHeight};
      text-align: ${preferences.justify ? "justify" : "start"};
      -webkit-hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hyphens: ${preferences.hyphenate ? "auto" : "manual"};
      hanging-punctuation: allow-end last;
      widows: 2;
    }

    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      color: ${theme.contentHeading};
      line-height: 1.14;
      text-wrap: balance;
    }

    a {
      color: ${theme.contentLink};
    }

    a:visited {
      color: ${theme.contentLink};
    }

    hr {
      border: 0;
      border-top: 1px solid color-mix(in oklab, ${theme.contentMuted} 34%, transparent);
    }

    pre,
    code,
    samp,
    kbd {
      font-family: "SF Mono", "JetBrains Mono", "Fira Code", ui-monospace, monospace;
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

  renderer.setStyles?.(buildReaderStyles(theme, preferences, appearance))
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
