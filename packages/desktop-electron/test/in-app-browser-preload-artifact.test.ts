import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  IN_APP_BROWSER_PRELOAD_ENTRY_NAME,
  IN_APP_BROWSER_PRELOAD_FILE_NAME,
  IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY,
  createElectronPreloadViteBuild,
  resolveInAppBrowserPreloadPathFromMainDirectory,
} from "../scripts/in-app-browser-preload-artifact"

describe("in-app browser preload artifact", () => {
  test("emits CommonJS in-app-browser.cjs for session registration", () => {
    const build = createElectronPreloadViteBuild()

    expect(IN_APP_BROWSER_PRELOAD_FILE_NAME).toBe("in-app-browser.cjs")
    expect(IN_APP_BROWSER_PRELOAD_FROM_MAIN_DIRECTORY).toBe(
      path.join("..", "preload", "in-app-browser.cjs"),
    )
    expect(build.externalizeDeps).toBe(false)
    expect(build.rollupOptions.output).toEqual({
      format: "cjs",
      entryFileNames: "[name].cjs",
    })
    expect(build.rollupOptions.input[IN_APP_BROWSER_PRELOAD_ENTRY_NAME]).toBe(
      "src/preload/in-app-browser.ts",
    )
  })

  test("resolves the same guest preload from development and packaged out/main", () => {
    const developmentMain = path.join("/repo", "packages", "desktop-electron", "out", "main")
    const packagedMain = path.join(
      "/Applications",
      "Buddy.app",
      "Contents",
      "Resources",
      "app.asar",
      "out",
      "main",
    )

    expect(resolveInAppBrowserPreloadPathFromMainDirectory(developmentMain)).toBe(
      path.join("/repo", "packages", "desktop-electron", "out", "preload", "in-app-browser.cjs"),
    )
    expect(resolveInAppBrowserPreloadPathFromMainDirectory(packagedMain)).toBe(
      path.join(
        "/Applications",
        "Buddy.app",
        "Contents",
        "Resources",
        "app.asar",
        "out",
        "preload",
        "in-app-browser.cjs",
      ),
    )
  })
})
