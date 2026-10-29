import { describe, expect, test } from "bun:test"
import path from "node:path"
import { buildElectronLaunchArgs } from "../e2e/fixtures/launch-args"

describe("Electron E2E launch arguments", () => {
  test("removes the directory URL's trailing Windows backslash before Playwright quotes it", () => {
    const directory = path.win32.normalize(
      "C:/Users/anush/code/buddy-v2/packages/desktop-electron/",
    )

    expect(buildElectronLaunchArgs("C:\\e2e\\launch-preload.cjs", directory, path.win32)).toEqual([
      "--require",
      "C:\\e2e\\launch-preload.cjs",
      "C:\\Users\\anush\\code\\buddy-v2\\packages\\desktop-electron",
    ])
  })

  test("passes Windows paths with spaces and Unicode as individual unquoted arguments", () => {
    const directory = path.win32.normalize(
      "C:/Users/Test User/code/Buddy é/packages/desktop-electron/",
    )
    const preload = "C:\\Test Home é\\launch-preload.cjs"

    expect(buildElectronLaunchArgs(preload, directory, path.win32)).toEqual([
      "--require",
      "C:\\Test Home é\\launch-preload.cjs",
      "C:\\Users\\Test User\\code\\Buddy é\\packages\\desktop-electron",
    ])
  })

  test("preserves a Windows UNC app directory without its trailing backslash", () => {
    const directory = path.win32.normalize(
      "//server/Buddy Projects/packages/desktop-electron/",
    )

    expect(buildElectronLaunchArgs("C:\\e2e\\launch-preload.cjs", directory, path.win32)).toEqual([
      "--require",
      "C:\\e2e\\launch-preload.cjs",
      "\\\\server\\Buddy Projects\\packages\\desktop-electron",
    ])
  })

  test("passes macOS paths unquoted and retains the preload argument", () => {
    expect(
      buildElectronLaunchArgs(
        "/tmp/Buddy E2E/launch-preload.cjs",
        "/Users/Test User/Buddy/packages/desktop-electron/",
        path.posix,
      ),
    ).toEqual([
      "--require",
      "/tmp/Buddy E2E/launch-preload.cjs",
      "/Users/Test User/Buddy/packages/desktop-electron",
    ])
  })
})
