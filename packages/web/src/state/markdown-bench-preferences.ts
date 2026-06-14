import { create } from "zustand"
import { persist } from "zustand/middleware"
import { createPlatformJsonStorage } from "@/context/platform"
import type { MarkdownBenchContentThemeMode } from "@/components/bench/markdown-bench-document-theme"

export const MARKDOWN_BENCH_PREFERENCES_STORAGE_KEY = "buddy.markdown-bench.v1"
export const MARKDOWN_BENCH_PREFERENCES_STORAGE_FILE = "buddy.markdown-bench.dat"
export const DEFAULT_MARKDOWN_BENCH_CONTENT_THEME_MODE: MarkdownBenchContentThemeMode = "light"
export const DEFAULT_MARKDOWN_BENCH_CONTENT_FONT_SCALE = 1
export const MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE = 0.85
export const MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE = 1.35
export const MARKDOWN_BENCH_CONTENT_FONT_SCALE_STEP = 0.05

type MarkdownBenchPreferencesState = {
  contentFontScale: number
  contentThemeMode: MarkdownBenchContentThemeMode
  decreaseContentFontScale: () => void
  increaseContentFontScale: () => void
  resetContentFontScale: () => void
  setContentFontScale: (scale: number) => void
  setContentThemeMode: (mode: MarkdownBenchContentThemeMode) => void
}

export function clampMarkdownBenchContentFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_MARKDOWN_BENCH_CONTENT_FONT_SCALE
  const stepped = Math.round(scale / MARKDOWN_BENCH_CONTENT_FONT_SCALE_STEP)
  const normalized = stepped * MARKDOWN_BENCH_CONTENT_FONT_SCALE_STEP
  return Math.min(
    MAX_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
    Math.max(MIN_MARKDOWN_BENCH_CONTENT_FONT_SCALE, Number(normalized.toFixed(2))),
  )
}

export const useMarkdownBenchPreferences = create<MarkdownBenchPreferencesState>()(
  persist(
    (set) => ({
      contentFontScale: DEFAULT_MARKDOWN_BENCH_CONTENT_FONT_SCALE,
      contentThemeMode: DEFAULT_MARKDOWN_BENCH_CONTENT_THEME_MODE,
      decreaseContentFontScale() {
        set((state) => ({
          contentFontScale: clampMarkdownBenchContentFontScale(
            state.contentFontScale - MARKDOWN_BENCH_CONTENT_FONT_SCALE_STEP,
          ),
        }))
      },
      increaseContentFontScale() {
        set((state) => ({
          contentFontScale: clampMarkdownBenchContentFontScale(
            state.contentFontScale + MARKDOWN_BENCH_CONTENT_FONT_SCALE_STEP,
          ),
        }))
      },
      resetContentFontScale() {
        set({ contentFontScale: DEFAULT_MARKDOWN_BENCH_CONTENT_FONT_SCALE })
      },
      setContentFontScale(scale) {
        set({ contentFontScale: clampMarkdownBenchContentFontScale(scale) })
      },
      setContentThemeMode(mode) {
        set({ contentThemeMode: mode })
      },
    }),
    {
      name: MARKDOWN_BENCH_PREFERENCES_STORAGE_KEY,
      storage: createPlatformJsonStorage(MARKDOWN_BENCH_PREFERENCES_STORAGE_FILE),
      partialize(state) {
        return {
          contentFontScale: state.contentFontScale,
          contentThemeMode: state.contentThemeMode,
        }
      },
    },
  ),
)
