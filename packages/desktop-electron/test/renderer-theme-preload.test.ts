import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  DEFAULT_COLOR_SCHEME,
  PRELOAD_STYLE_ID,
  STORAGE_KEYS,
  THEME_CACHE_VERSION,
} from "@buddy/web/theme/storage"

const RENDERER_ROOT = path.resolve(import.meta.dir, "../src/renderer")
const INLINE_SCRIPT_PATTERN = /<script>([\s\S]*?)<\/script>/u

function inlineThemePreload(fileName: string): string {
  const html = readFileSync(path.join(RENDERER_ROOT, fileName), "utf8")
  const script = html.match(INLINE_SCRIPT_PATTERN)?.[1]
  if (!script) throw new Error(`${fileName} has no inline theme preload script`)
  return script
}

describe("renderer theme preload", () => {
  test("the app page and the loading page share one preload script", () => {
    expect(inlineThemePreload("loading.html")).toBe(inlineThemePreload("index.html"))
  })

  test("follows the web theme storage contract", () => {
    const script = inlineThemePreload("index.html")
    const contract = [
      STORAGE_KEYS.LIGHT_THEME_ID,
      STORAGE_KEYS.DARK_THEME_ID,
      STORAGE_KEYS.COLOR_SCHEME,
      STORAGE_KEYS.CACHE_VERSION,
      STORAGE_KEYS.THEME_CSS_LIGHT,
      STORAGE_KEYS.THEME_CSS_DARK,
      PRELOAD_STYLE_ID,
    ]

    for (const value of contract) {
      expect(script).toContain(`"${value}"`)
    }
    expect(script).toContain(`var cacheVersion = "${THEME_CACHE_VERSION}"`)
    expect(script).toContain(`var defaultColorScheme = "${DEFAULT_COLOR_SCHEME}"`)
    expect(script).not.toContain(`"${STORAGE_KEYS.LEGACY_THEME_ID}"`)
  })
})
