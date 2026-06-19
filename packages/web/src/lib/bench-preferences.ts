import {
  benchModePreferenceKey,
  readBenchChatLayoutMode,
  type BenchMode,
  type BenchModePreferenceKey,
  type BenchTarget,
} from "./bench-targets"

type BenchPresentationPreferences = {
  modeBySurface: Partial<Record<BenchModePreferenceKey, BenchMode>>
}

const BENCH_PRESENTATION_PREFERENCE_STORAGE_PREFIX = "buddy.bench.presentation.mode"

const BENCH_MODE_PREFERENCE_KEYS = [
  "reading",
  "whiteboard",
  "markdown",
  "file",
  "artifact:mermaid",
  "artifact:html-widget",
  "artifact:figure",
  "artifact:freeform-figure",
  "artifact:media-presentation",
  "artifact:question-set",
  "artifact:flashcard-deck",
] satisfies BenchModePreferenceKey[]

function storageKeyForBenchModePreference(key: BenchModePreferenceKey): string {
  return `${BENCH_PRESENTATION_PREFERENCE_STORAGE_PREFIX}:${key}`
}

function readBenchPresentationPreferences(): BenchPresentationPreferences {
  const modeBySurface: Partial<Record<BenchModePreferenceKey, BenchMode>> = {}

  if (typeof window === "undefined") {
    return { modeBySurface }
  }

  for (const key of BENCH_MODE_PREFERENCE_KEYS) {
    const mode = readBenchChatLayoutMode(
      window.localStorage.getItem(storageKeyForBenchModePreference(key)),
    )
    if (mode) {
      modeBySurface[key] = mode
    }
  }

  return { modeBySurface }
}

function setBenchPresentationModePreference(input: { target: BenchTarget; mode: BenchMode }): void {
  if (typeof window === "undefined") return
  const key = benchModePreferenceKey(input.target)
  window.localStorage.setItem(storageKeyForBenchModePreference(key), input.mode)
}

export { readBenchPresentationPreferences, setBenchPresentationModePreference }
export type { BenchPresentationPreferences }
