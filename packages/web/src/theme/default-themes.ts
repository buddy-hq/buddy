import { defaultThemes as vendorThemes } from "@buddy/opencode-adapter/theme"
import type { DesktopTheme } from "./types"

/** Vendor themes kept out of Buddy’s selectable catalog (branding). */
const HIDDEN_THEME_IDS = new Set(["oc-2", "opencode"])

export const defaultThemes: Record<string, DesktopTheme> = Object.fromEntries(
  Object.entries(vendorThemes).filter(([id]) => !HIDDEN_THEME_IDS.has(id)),
)
