/**
 * Official shadcn/ui Hugeicons defaults.
 *
 * Source: shadcn CLI `iconLibraries.hugeicons.usage`:
 *   `<HugeiconsIcon icon={ICON} strokeWidth={2} />`
 *
 * Packages: `@hugeicons/react` + `@hugeicons/core-free-icons`
 * Registry: `https://ui.shadcn.com/r/styles/radix-nova/<component>.json`
 * (IconPlaceholder hugeicons="..." attrs)
 */
export const SHADCN_HUGEICONS_STROKE_WIDTH = 2 as const

/**
 * Hugeicons React package defaults we rely on (do not override unless product requires it):
 * - color: currentColor
 * - size: 24 (CSS size-* / parent [&_svg] rules usually override)
 * - absoluteStrokeWidth: false
 */
export const SHADCN_HUGEICONS_DEFAULT_COLOR = "currentColor" as const
