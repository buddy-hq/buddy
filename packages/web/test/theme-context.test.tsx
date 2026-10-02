import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ThemeProvider, useTheme } from "../src/theme"

import { createThemeMediaQueryList } from "./parse-test-values"

type ThemeApi = ReturnType<typeof useTheme>

async function flushEffects() {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("ThemeProvider", () => {
  let container: HTMLDivElement
  let root: Root
  let themeApi: ThemeApi | null

  function ThemeCapture() {
    themeApi = useTheme()
    return null
  }

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    themeApi = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    document.head.innerHTML = ""
    document.documentElement.className = ""
    document.documentElement.removeAttribute("data-theme")
    document.documentElement.removeAttribute("data-color-scheme")
    document.documentElement.style.colorScheme = ""
    localStorage.clear()

    Object.defineProperty(window, "matchMedia", {
      value: () => createThemeMediaQueryList(false),
      configurable: true,
    })
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
      await flushEffects()
    })
    container.remove()
    document.getElementById("oc-theme")?.remove()
    document.getElementById("oc-theme-preload")?.remove()
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", undefined)
  })

  async function renderThemeProvider(): Promise<ThemeApi> {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ThemeCapture />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    return currentThemeApi()
  }

  function currentThemeApi(): ThemeApi {
    if (!themeApi) {
      throw new Error("Theme context was not captured")
    }

    return themeApi
  }

  test("migrates a legacy theme into both slots and refreshes cached css", async () => {
    localStorage.setItem("opencode-theme-id", "nord")
    localStorage.setItem("opencode-color-scheme", "dark")
    localStorage.setItem("opencode-theme-css-light", "stale-light")
    localStorage.setItem("opencode-theme-css-dark", "stale-dark")

    const api = await renderThemeProvider()

    expect(api.lightThemeId).toBe("nord")
    expect(api.darkThemeId).toBe("nord")
    expect(localStorage.getItem("opencode-theme-id")).toBeNull()
    expect(localStorage.getItem("opencode-theme-id-light")).toBe("nord")
    expect(localStorage.getItem("opencode-theme-id-dark")).toBe("nord")
    expect(document.documentElement.dataset.theme).toBe("nord")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("opencode-theme-css-light")).toContain("--background-base:")
    expect(localStorage.getItem("opencode-theme-css-dark")).toContain("--background-base:")
  })

  test("replaces retired theme ids with the defaults", async () => {
    for (const retiredId of ["oc-1", "oc-2", "opencode"] as const) {
      localStorage.clear()
      localStorage.setItem("opencode-theme-id", retiredId)

      await act(async () => {
        root.unmount()
        await flushEffects()
      })
      root = createRoot(container)
      themeApi = null

      const api = await renderThemeProvider()

      expect(localStorage.getItem("opencode-theme-id")).toBeNull()
      expect(localStorage.getItem("opencode-theme-id-dark")).toBe("dracula")
      expect(localStorage.getItem("opencode-theme-id-light")).toBe("github")
      expect(document.documentElement.dataset.theme).toBe("dracula")
      expect(api.themes[retiredId]).toBeUndefined()
      expect(api.themeId).toBe("dracula")
    }
  })

  test("uses the light slot's theme in light and the dark slot's theme in dark", async () => {
    localStorage.setItem("opencode-theme-id", "catppuccin-macchiato")

    const api = await renderThemeProvider()

    expect(api.darkThemeId).toBe("catppuccin-macchiato")
    expect(api.lightThemeId).toBe("catppuccin")
    expect(api.themeId).toBe("catppuccin-macchiato")

    await act(async () => {
      api.setColorScheme("light")
      await flushEffects()
    })

    expect(currentThemeApi().mode).toBe("light")
    expect(currentThemeApi().themeId).toBe("catppuccin")
    expect(document.documentElement.dataset.theme).toBe("catppuccin")
  })

  test("sets each slot on its own and refuses a dark-only theme for light", async () => {
    const api = await renderThemeProvider()

    await act(async () => {
      api.setThemeForMode("light", "solarized")
      api.setThemeForMode("dark", "catppuccin-macchiato")
      await flushEffects()
    })

    expect(currentThemeApi().lightThemeId).toBe("solarized")
    expect(currentThemeApi().darkThemeId).toBe("catppuccin-macchiato")
    expect(localStorage.getItem("opencode-theme-id-light")).toBe("solarized")
    expect(localStorage.getItem("opencode-theme-id-dark")).toBe("catppuccin-macchiato")
    expect(document.documentElement.dataset.theme).toBe("catppuccin-macchiato")

    const warn = console.warn
    console.warn = () => {}
    try {
      await act(async () => {
        api.setThemeForMode("light", "catppuccin-macchiato")
        await flushEffects()
      })
    } finally {
      console.warn = warn
    }

    expect(currentThemeApi().lightThemeId).toBe("solarized")
    expect(localStorage.getItem("opencode-theme-id-light")).toBe("solarized")
  })

  test("caches the default theme and keeps the dark class in sync with scheme changes", async () => {
    const api = await renderThemeProvider()

    expect(localStorage.getItem("opencode-theme-css-light")).toContain("--background-base:")
    expect(localStorage.getItem("opencode-theme-css-dark")).toContain("--background-base:")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    await act(async () => {
      api.setColorScheme("dark")
      await flushEffects()
    })

    expect(localStorage.getItem("opencode-color-scheme")).toBe("dark")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)

    await act(async () => {
      api.setColorScheme("light")
      await flushEffects()
    })

    expect(localStorage.getItem("opencode-color-scheme")).toBe("light")
    expect(document.documentElement.dataset.colorScheme).toBe("light")
    expect(document.documentElement.classList.contains("dark")).toBe(false)
  })
})
