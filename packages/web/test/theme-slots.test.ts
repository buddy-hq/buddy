import { beforeEach, describe, expect, test } from "bun:test"
import { defaultThemes } from "../src/theme/default-themes"
import { DEFAULT_DARK_THEME_ID, DEFAULT_LIGHT_THEME_ID, STORAGE_KEYS } from "../src/theme/storage"
import { isSelectableTheme, lightThemeIDFor, selectableThemeIDs } from "../src/theme/theme-catalog"
import { migrateThemeSlots, readThemeSlots } from "../src/theme/theme-slots"

beforeEach(() => {
  localStorage.clear()
})

describe("theme catalog", () => {
  test("offers every theme for dark and only readable themes for light", () => {
    const darkIds = selectableThemeIDs("dark")
    const lightIds = selectableThemeIDs("light")

    expect([...darkIds].toSorted()).toEqual(Object.keys(defaultThemes).toSorted())
    expect(lightIds.length).toBeGreaterThan(0)
    expect(lightIds.length).toBeLessThan(darkIds.length)
    expect(lightIds).toContain("github")
    expect(lightIds).not.toContain("catppuccin-macchiato")
    expect(lightIds).not.toContain("catppuccin-frappe")
  })

  test("keeps both defaults selectable", () => {
    expect(isSelectableTheme(DEFAULT_LIGHT_THEME_ID, "light")).toBe(true)
    expect(isSelectableTheme(DEFAULT_DARK_THEME_ID, "dark")).toBe(true)
    expect(isSelectableTheme("oc-2", "dark")).toBe(false)
    expect(isSelectableTheme("not-a-theme", "light")).toBe(false)
  })

  test("pairs a dark-only theme with a light theme from its family, else the default", () => {
    expect(lightThemeIDFor("nord")).toBe("nord")
    expect(lightThemeIDFor("catppuccin-macchiato")).toBe("catppuccin")
    expect(lightThemeIDFor("catppuccin-frappe")).toBe("catppuccin")
    expect(lightThemeIDFor("one-dark")).toBe("onedarkpro")
    expect(lightThemeIDFor("matrix")).toBe(DEFAULT_LIGHT_THEME_ID)
  })
})

describe("theme slots", () => {
  test("uses the defaults when nothing is stored", () => {
    expect(readThemeSlots(localStorage)).toEqual({
      light: DEFAULT_LIGHT_THEME_ID,
      dark: DEFAULT_DARK_THEME_ID,
    })
  })

  test("reading does not write", () => {
    localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, "nord")

    readThemeSlots(localStorage)

    expect(localStorage.getItem(STORAGE_KEYS.LEGACY_THEME_ID)).toBe("nord")
    expect(localStorage.getItem(STORAGE_KEYS.LIGHT_THEME_ID)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.DARK_THEME_ID)).toBeNull()
  })

  test("migrates a legacy theme that works in light into both slots", () => {
    localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, "nord")
    localStorage.setItem(STORAGE_KEYS.THEME_CSS_LIGHT, "stale-light")
    localStorage.setItem(STORAGE_KEYS.THEME_CSS_DARK, "stale-dark")

    expect(migrateThemeSlots(localStorage)).toEqual({ light: "nord", dark: "nord" })
    expect(localStorage.getItem(STORAGE_KEYS.LEGACY_THEME_ID)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.LIGHT_THEME_ID)).toBe("nord")
    expect(localStorage.getItem(STORAGE_KEYS.DARK_THEME_ID)).toBe("nord")
    expect(localStorage.getItem(STORAGE_KEYS.THEME_CSS_LIGHT)).toBeNull()
    expect(localStorage.getItem(STORAGE_KEYS.THEME_CSS_DARK)).toBeNull()
  })

  test("migrates a dark-only legacy theme to its light counterpart", () => {
    localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, "catppuccin-macchiato")

    expect(migrateThemeSlots(localStorage)).toEqual({
      light: "catppuccin",
      dark: "catppuccin-macchiato",
    })
  })

  test("gives the old default theme the default light theme when light was never used", () => {
    for (const storedScheme of [null, "dark"]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, DEFAULT_DARK_THEME_ID)
      if (storedScheme) localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, storedScheme)

      expect(migrateThemeSlots(localStorage)).toEqual({
        light: DEFAULT_LIGHT_THEME_ID,
        dark: DEFAULT_DARK_THEME_ID,
      })
    }
  })

  test("keeps the old default theme for light when light was in use", () => {
    for (const storedScheme of ["light", "system"]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, DEFAULT_DARK_THEME_ID)
      localStorage.setItem(STORAGE_KEYS.COLOR_SCHEME, storedScheme)

      expect(migrateThemeSlots(localStorage)).toEqual({
        light: DEFAULT_DARK_THEME_ID,
        dark: DEFAULT_DARK_THEME_ID,
      })
    }
  })

  test("replaces retired and unknown theme ids with the defaults", () => {
    for (const retiredId of ["oc-1", "oc-2", "opencode", "not-a-theme"]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEYS.LEGACY_THEME_ID, retiredId)

      expect(migrateThemeSlots(localStorage)).toEqual({
        light: DEFAULT_LIGHT_THEME_ID,
        dark: DEFAULT_DARK_THEME_ID,
      })
    }
  })

  test("keeps chosen slots and their cached css once migrated", () => {
    localStorage.setItem(STORAGE_KEYS.LIGHT_THEME_ID, "solarized")
    localStorage.setItem(STORAGE_KEYS.DARK_THEME_ID, "catppuccin-macchiato")
    localStorage.setItem(STORAGE_KEYS.THEME_CSS_LIGHT, "cached-light")
    localStorage.setItem(STORAGE_KEYS.THEME_CSS_DARK, "cached-dark")

    expect(migrateThemeSlots(localStorage)).toEqual({
      light: "solarized",
      dark: "catppuccin-macchiato",
    })
    expect(localStorage.getItem(STORAGE_KEYS.THEME_CSS_LIGHT)).toBe("cached-light")
    expect(localStorage.getItem(STORAGE_KEYS.THEME_CSS_DARK)).toBe("cached-dark")
  })

  test("repairs a stored light theme that is not readable in light from its family", () => {
    localStorage.setItem(STORAGE_KEYS.LIGHT_THEME_ID, "catppuccin-macchiato")
    localStorage.setItem(STORAGE_KEYS.DARK_THEME_ID, "nord")

    expect(migrateThemeSlots(localStorage)).toEqual({
      light: "catppuccin",
      dark: "nord",
    })
    expect(localStorage.getItem(STORAGE_KEYS.LIGHT_THEME_ID)).toBe("catppuccin")
  })

  test("repairs a stored light theme with no readable family member to the default", () => {
    for (const storedLight of ["matrix", "not-a-theme"]) {
      localStorage.clear()
      localStorage.setItem(STORAGE_KEYS.LIGHT_THEME_ID, storedLight)
      localStorage.setItem(STORAGE_KEYS.DARK_THEME_ID, "nord")

      expect(migrateThemeSlots(localStorage)).toEqual({
        light: DEFAULT_LIGHT_THEME_ID,
        dark: "nord",
      })
    }
  })
})
