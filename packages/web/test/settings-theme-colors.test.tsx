import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ThemeColorsSection } from "../src/components/settings/settings-theme-colors"
import { ThemeProvider } from "../src/theme"

import { createThemeMediaQueryList } from "./parse-test-values"

describe("theme colors settings", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true)
    localStorage.clear()
    Object.defineProperty(window, "matchMedia", {
      value: () => createThemeMediaQueryList(false),
      configurable: true,
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT")
    container.remove()
    document.getElementById("oc-theme")?.remove()
  })

  async function renderSection() {
    await act(async () => {
      root.render(
        <ThemeProvider>
          <ThemeColorsSection controlClassName="w-56" />
        </ThemeProvider>,
      )
    })
  }

  function sample(mode: "light" | "dark"): HTMLElement {
    const element = container.querySelector<HTMLElement>(
      `[data-component="settings-theme-sample"][data-mode="${mode}"]`,
    )
    if (!element) throw new Error(`Missing ${mode} theme sample`)
    return element
  }

  test("shows a sample of each slot's theme and marks the one in use", async () => {
    localStorage.setItem("opencode-theme-id-light", "solarized")
    localStorage.setItem("opencode-theme-id-dark", "catppuccin-macchiato")
    localStorage.setItem("opencode-color-scheme", "dark")

    await renderSection()

    expect(sample("light").textContent).toContain("Solarized")
    expect(sample("light").textContent).not.toContain("In use")
    expect(sample("dark").textContent).toContain("Catppuccin Macchiato")
    expect(sample("dark").textContent).toContain("In use")
    expect(container.querySelector('[data-action="settings-light-theme"]')).not.toBeNull()
    expect(container.querySelector('[data-action="settings-dark-theme"]')).not.toBeNull()
  })

  test("marks the light sample when Buddy is light", async () => {
    localStorage.setItem("opencode-color-scheme", "light")

    await renderSection()

    expect(sample("light").textContent).toContain("GitHub")
    expect(sample("light").textContent).toContain("In use")
    expect(sample("dark").textContent).not.toContain("In use")
  })
})
