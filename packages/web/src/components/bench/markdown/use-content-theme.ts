import { useMemo } from "react"
import {
  resolveMarkdownBenchContentTheme,
  type MarkdownBenchContentTheme,
} from "@/components/bench/markdown/document-theme"
import { useMarkdownBenchPreferences } from "@/state/markdown-bench-preferences"
import { useTheme } from "@/theme"

export function useMarkdownBenchContentTheme(): MarkdownBenchContentTheme | undefined {
  const { lightThemeId, darkThemeId } = useTheme()
  const mode = useMarkdownBenchPreferences((state) => state.contentThemeMode)

  return useMemo(
    () => resolveMarkdownBenchContentTheme({ mode, lightThemeId, darkThemeId }),
    [darkThemeId, lightThemeId, mode],
  )
}
