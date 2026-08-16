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
        <ThemeProvider defaultTheme="dracula">
          <ThemeCapture />
        </ThemeProvider>,
      )
      await flushEffects()
    })

    if (!themeApi) {
      throw new Error("Theme context was not captured")
    }

    return themeApi
  }

  test("migrates legacy oc-1 state and refreshes cached css", async () => {
    localStorage.setItem("opencode-theme-id", "oc-1")
    localStorage.setItem("opencode-color-scheme", "dark")
    localStorage.setItem("opencode-theme-css-light", "stale-light")
    localStorage.setItem("opencode-theme-css-dark", "stale-dark")

    await renderThemeProvider()

    expect(localStorage.getItem("opencode-theme-id")).toBe("dracula")
    expect(document.documentElement.dataset.theme).toBe("dracula")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("opencode-theme-css-light")).not.toBe("stale-light")
    expect(localStorage.getItem("opencode-theme-css-dark")).not.toBe("stale-dark")
    expect(localStorage.getItem("opencode-theme-css-light")).toContain("--background-base:")
    expect(localStorage.getItem("opencode-theme-css-dark")).toContain("--background-base:")
  })

  test("migrates brand-hidden theme ids to the default", async () => {
    for (const retiredId of ["oc-2", "opencode"] as const) {
      localStorage.clear()
      localStorage.setItem("opencode-theme-id", retiredId)

      await act(async () => {
        root.unmount()
        await flushEffects()
      })
      root = createRoot(container)
      themeApi = null

      const api = await renderThemeProvider()

      expect(localStorage.getItem("opencode-theme-id")).toBe("dracula")
      expect(document.documentElement.dataset.theme).toBe("dracula")
      expect(api.themes[retiredId]).toBeUndefined()
      expect(api.themeId).toBe("dracula")
    }
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
