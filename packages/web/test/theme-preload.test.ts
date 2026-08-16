import { beforeEach, describe, expect, test } from "bun:test"
import { applyThemePreload } from "../src/theme/preload-runtime"
import { THEME_CACHE_VERSION } from "../src/theme/storage"

import { createThemeMediaQueryList } from "./parse-test-values"

const run = () =>
  applyThemePreload({
    document,
    storage: localStorage,
    matchMedia: window.matchMedia.bind(window),
  })

beforeEach(() => {
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

describe("theme preload", () => {
  test("migrates legacy oc-1 settings before the app mounts", () => {
    localStorage.setItem("opencode-theme-id", "oc-1")
    localStorage.setItem("opencode-theme-css-light", "stale-light")
    localStorage.setItem("opencode-theme-css-dark", "stale-dark")

    run()

    expect(document.documentElement.dataset.theme).toBe("dracula")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(localStorage.getItem("opencode-theme-id")).toBe("dracula")
    expect(localStorage.getItem("opencode-theme-css-light")).toContain("--background-base:")
    expect(localStorage.getItem("opencode-theme-css-dark")).toContain("--background-base:")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:")
  })

  test("applies the cached dark theme when system mode resolves dark", () => {
    Object.defineProperty(window, "matchMedia", {
      value: () => createThemeMediaQueryList(true),
      configurable: true,
    })

    localStorage.setItem("opencode-theme-id", "nightowl")
    localStorage.setItem("opencode-color-scheme", "system")
    localStorage.setItem("opencode-theme-cache-version", THEME_CACHE_VERSION)
    localStorage.setItem("opencode-theme-css-dark", "--background:#000;")

    run()

    expect(document.documentElement.dataset.theme).toBe("nightowl")
    expect(document.documentElement.dataset.colorScheme).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe("dark")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background:#000;")
  })

  test("drops stale cached css when the cache version changes", () => {
    localStorage.setItem("opencode-theme-cache-version", "1")
    localStorage.setItem("opencode-theme-css-light", "stale-light")
    localStorage.setItem("opencode-theme-css-dark", "stale-dark")

    run()

    expect(localStorage.getItem("opencode-theme-cache-version")).toBe(THEME_CACHE_VERSION)
    expect(localStorage.getItem("opencode-theme-css-light")).toContain("--background-base:")
    expect(localStorage.getItem("opencode-theme-css-dark")).toContain("--background-base:")
    expect(document.getElementById("oc-theme-preload")?.textContent).toContain("--background-base:")
  })
})
