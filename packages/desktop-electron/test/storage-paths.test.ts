import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  DESKTOP_XDG_ENV,
  resolveAllowedDirectoryRoots,
  resolveDefaultNotebookHome,
  resolveDevXdgEnvironment,
  resolveOpenCodeSqlitePath,
  shouldUseDevRuntimeIsolation,
} from "../src/main/storage-paths"

describe("desktop storage paths", () => {
  test("uses dev runtime isolation for unpackaged or dev-channel desktop", () => {
    expect(
      shouldUseDevRuntimeIsolation({
        channel: "prod",
        isPackaged: false,
      }),
    ).toBe(true)
    expect(
      shouldUseDevRuntimeIsolation({
        channel: "dev",
        isPackaged: true,
      }),
    ).toBe(true)
    expect(
      shouldUseDevRuntimeIsolation({
        channel: "prod",
        isPackaged: true,
      }),
    ).toBe(false)
  })

  test("builds dev XDG data/cache/state under Electron userData only", () => {
    const userData = path.join("/tmp", "Buddy Dev")

    expect(resolveDevXdgEnvironment(userData)).toEqual({
      [DESKTOP_XDG_ENV.DATA_HOME]: path.join(userData, "xdg", "data"),
      [DESKTOP_XDG_ENV.CACHE_HOME]: path.join(userData, "xdg", "cache"),
      [DESKTOP_XDG_ENV.STATE_HOME]: path.join(userData, "xdg", "state"),
    })
    expect(resolveDevXdgEnvironment(userData)).not.toHaveProperty("XDG_CONFIG_HOME")
  })

  test("authorizes notebook home without authorizing runtime storage", () => {
    const home = path.join("/Users", "buddy")
    const expectedNotebookHome = resolveDefaultNotebookHome(home)

    expect(resolveAllowedDirectoryRoots({ home })).toBe(expectedNotebookHome)
  })

  test("resolves the OpenCode sqlite path from the effective XDG data home", () => {
    const configuredDataHome = path.join("/tmp", "configured-xdg-data")

    expect(
      resolveOpenCodeSqlitePath({
        channel: "prod",
        envXdgDataHome: configuredDataHome,
        home: path.join("/Users", "buddy"),
        isPackaged: true,
        userDataPath: path.join("/tmp", "Buddy"),
      }),
    ).toBe(path.join(configuredDataHome, "opencode", "opencode.db"))

    expect(
      resolveOpenCodeSqlitePath({
        channel: "dev",
        envXdgDataHome: configuredDataHome,
        home: path.join("/Users", "buddy"),
        isPackaged: false,
        userDataPath: path.join("/tmp", "Buddy"),
      }),
    ).toBe(path.join(configuredDataHome, "opencode", "opencode-dev.db"))
  })

  test("resolves dev and non-dev OpenCode sqlite defaults", () => {
    const home = path.join("/Users", "buddy")
    const userData = path.join("/tmp", "Buddy Dev")

    expect(
      resolveOpenCodeSqlitePath({
        channel: "dev",
        envXdgDataHome: undefined,
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(userData, "xdg", "data", "opencode", "opencode-dev.db"))

    expect(
      resolveOpenCodeSqlitePath({
        channel: "prod",
        envXdgDataHome: undefined,
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(home, ".local", "share", "opencode", "opencode.db"))
  })
})
