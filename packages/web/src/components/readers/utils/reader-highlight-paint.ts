import type { CSSProperties } from "react"
import type { FoliateReaderThemeDefinition } from "../foliate-reader-types"

type ReaderPageAppearance = FoliateReaderThemeDefinition["appearance"]

/**
 * Reader marks sit on the page, so their strength follows the reader theme's
 * appearance, not the app theme. Light paper multiplies ink in, which keeps the
 * glyphs under an overlay dark; dark pages lay a thinner wash over them.
 */
const READER_HIGHLIGHT_PAINT = {
  light: { strength: 0.35, blend: "multiply" },
  dark: { strength: 0.3, blend: "normal" },
} satisfies Record<ReaderPageAppearance, { strength: number; blend: string }>

type ReaderHighlightVariablesStyle = CSSProperties & {
  "--buddy-reader-highlight-opacity": string
  "--buddy-reader-highlight-blend": string
}

function inkWash(ink: string, strength: number): string {
  return `color-mix(in srgb, ${ink} ${Math.round(strength * 100)}%, transparent)`
}

/** Custom properties for a reader surface; overlay marks beneath it inherit them. */
export function readerHighlightVariables(
  appearance: ReaderPageAppearance,
): ReaderHighlightVariablesStyle {
  const paint = READER_HIGHLIGHT_PAINT[appearance]
  return {
    "--buddy-reader-highlight-opacity": String(paint.strength),
    "--buddy-reader-highlight-blend": paint.blend,
  }
}

/** Group style for opaque ink marks laid over the page's glyphs. */
export const READER_HIGHLIGHT_OVERLAY_STYLE = {
  opacity: "var(--buddy-reader-highlight-opacity)",
  mixBlendMode: "var(--buddy-reader-highlight-blend)",
}

/** An ink wash painted behind glyphs, such as `::selection` and `::highlight`. */
export function readerInkWash(ink: string, appearance: ReaderPageAppearance): string {
  return inkWash(ink, READER_HIGHLIGHT_PAINT[appearance].strength)
}

/** A mark list or popover previews an ink on an app surface at the light-page strength. */
export function readerInkSwatchWash(ink: string): string {
  return inkWash(ink, READER_HIGHLIGHT_PAINT.light.strength)
}
