import "@buddy/ui/styles"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TooltipProvider } from "@buddy/ui"
import { defaultThemes, resolveThemeVariant, themeToCss } from "@buddy/opencode-adapter/theme"

const queryClient = new QueryClient()

type StoryRenderer = () => React.ReactNode
type StoryContext = {
  globals?: Record<string, unknown>
  parameters?: {
    themes?: {
      themeOverride?: unknown
    }
  }
}

function resolveTheme(value: unknown): "light" | "dark" {
  return value === "dark" ? "dark" : "light"
}

const STORYBOOK_THEME_STYLE_ID = "buddy-storybook-theme-style"
const DEFAULT_THEME_ID = "oc-2"

function resolveThemeDefinition() {
  const defaultTheme = defaultThemes[DEFAULT_THEME_ID]
  if (defaultTheme) return { themeId: DEFAULT_THEME_ID, theme: defaultTheme }
  const [fallbackThemeId, fallbackTheme] = Object.entries(defaultThemes)[0] ?? []
  if (fallbackThemeId && fallbackTheme) {
    return { themeId: fallbackThemeId, theme: fallbackTheme }
  }
  return null
}

function ensureThemeStyleElement() {
  const existing = document.getElementById(STORYBOOK_THEME_STYLE_ID) as HTMLStyleElement | null
  if (existing) return existing
  const style = document.createElement("style")
  style.id = STORYBOOK_THEME_STYLE_ID
  document.head.appendChild(style)
  return style
}

function ThemeVariables(props: { mode: "light" | "dark" }) {
  React.useEffect(() => {
    const themeDefinition = resolveThemeDefinition()
    if (!themeDefinition) return

    const isDark = props.mode === "dark"
    const variant = isDark ? themeDefinition.theme.dark : themeDefinition.theme.light
    const tokens = resolveThemeVariant(variant, isDark)
    const css = themeToCss(tokens)

    const root = document.documentElement
    root.dataset.theme = themeDefinition.themeId
    root.dataset.colorScheme = props.mode
    root.classList.toggle("dark", isDark)
    root.classList.toggle("light", !isDark)
    root.style.colorScheme = props.mode

    ensureThemeStyleElement().textContent = `:root {
  color-scheme: ${props.mode};
  --text-mix-blend-mode: ${isDark ? "plus-lighter" : "multiply"};
  ${css}
}`
  }, [props.mode])

  return null
}

const withTheme = (Story: StoryRenderer, context: StoryContext) => {
  const override = context.parameters?.themes?.themeOverride
  const selected = context.globals?.theme
  const pick = override === "light" || override === "dark" ? override : selected
  const theme = resolveTheme(pick)

  return (
    <>
      <ThemeVariables mode={theme} />
      <TooltipProvider delayDuration={300}>
        <QueryClientProvider client={queryClient}>
          <div className={theme} data-theme={theme}>
            <div className="min-h-screen bg-background-base p-6 text-text-base">
              <Story />
            </div>
          </div>
        </QueryClientProvider>
      </TooltipProvider>
    </>
  )
}

export default {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      name: "Theme",
      description: "Global theme",
      defaultValue: "light",
    },
  },
  parameters: {
    docs: {
      disable: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
}
