import { language } from "@/context/language"
import type { AdvancedMathRuntimeState } from "@/state/advanced-math-runtime"
import type { StandardsRuntimeState } from "@/state/standards-runtime"

/** Both installable packages report the same lifecycle. */
export type PackageRuntimeState = AdvancedMathRuntimeState | StandardsRuntimeState

const ACTIVITY_LABEL_KEYS = {
  downloading: "settings.packages.activityDownloading",
  installing: "settings.packages.activityInstalling",
  repairing: "settings.packages.activityRepairing",
  removing: "settings.packages.activityRemoving",
  error: "settings.packages.activityFailed",
} as const satisfies Partial<Record<PackageRuntimeState, string>>

function isActivityState(state: PackageRuntimeState): state is keyof typeof ACTIVITY_LABEL_KEYS {
  return state in ACTIVITY_LABEL_KEYS
}

/**
 * Label for what a package is *doing*, or undefined when it is simply on or off.
 *
 * The switch beside each row already answers "is this installed?", so echoing "Installed" /
 * "Not installed" next to it is noise. Only the states the switch cannot express — a download in
 * flight, a failure — earn a line of their own.
 */
export function packageActivityLabel(input: {
  state: PackageRuntimeState | undefined
  loading: boolean
}): string | undefined {
  if (input.state === undefined) {
    return input.loading ? language.t("settings.packages.activityLoading") : undefined
  }

  return isActivityState(input.state) ? language.t(ACTIVITY_LABEL_KEYS[input.state]) : undefined
}
