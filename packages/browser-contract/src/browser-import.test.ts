import { describe, expect, test } from "bun:test"
import { BROWSER_IMPORT_SOURCE_IDS, parseBrowserImportSourceID } from "./browser-import"

describe("browser import source IDs", () => {
  test("accepts only supported browser IDs from external input", () => {
    expect(BROWSER_IMPORT_SOURCE_IDS).toEqual(["chrome", "edge", "safari"])
    expect(parseBrowserImportSourceID("chrome")).toBe("chrome")
    expect(parseBrowserImportSourceID("edge")).toBe("edge")
    expect(parseBrowserImportSourceID("safari")).toBe("safari")
    for (const value of [
      "brave",
      "firefox",
      "helium",
      "Safari",
      "chrome ",
      "__proto__",
      "",
      1,
      null,
      undefined,
      ["chrome"],
    ]) {
      expect(parseBrowserImportSourceID(value)).toBeUndefined()
    }
  })
})
