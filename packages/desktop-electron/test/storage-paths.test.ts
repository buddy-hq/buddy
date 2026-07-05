import { describe, expect, test } from "bun:test"
import path from "node:path"
import {
  DESKTOP_XDG_ENV,
  resolveAllowedDirectoryRoots,
  resolveBuddyDataDir,
  resolveDefaultNotebookHome,
  resolveDevXdgEnvironment,
  resolveOpenCodeSqlitePath,
  resolveRuntimeXdgEnvironment,
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
    expect(
      shouldUseDevRuntimeIsolation({
        channel: "beta",
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

  test("builds XDG roots from an explicit runtime root", () => {
    const runtimeRoot = path.join("/tmp", "buddy-runtime")

    expect(resolveRuntimeXdgEnvironment(runtimeRoot)).toEqual({
      [DESKTOP_XDG_ENV.DATA_HOME]: path.join(runtimeRoot, "data"),
      [DESKTOP_XDG_ENV.CACHE_HOME]: path.join(runtimeRoot, "cache"),
      [DESKTOP_XDG_ENV.STATE_HOME]: path.join(runtimeRoot, "state"),
    })
  })

  test("authorizes notebook home without authorizing runtime storage", () => {
    const home = path.join("/Users", "buddy")
    const expectedNotebookHome = resolveDefaultNotebookHome(home)

    expect(resolveAllowedDirectoryRoots({ home })).toBe(expectedNotebookHome)
  })

  test("resolves OpenCode sqlite paths inside Buddy-owned XDG data roots", () => {
    const home = path.join("/Users", "buddy")
    const userData = path.join("/tmp", "Buddy Dev")

    expect(
      resolveOpenCodeSqlitePath({
        channel: "prod",
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(home, ".local", "share", "buddy", "opencode", "opencode.db"))

    expect(
      resolveOpenCodeSqlitePath({
        channel: "beta",
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(home, ".local", "share", "buddy", "opencode", "opencode.db"))

    expect(
      resolveOpenCodeSqlitePath({
        channel: "dev",
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(userData, "xdg", "data", "buddy", "opencode", "opencode.db"))
  })

  test("resolves OpenCode sqlite paths from configured XDG and Buddy data roots", () => {
    const home = path.join("/Users", "buddy")
    const userData = path.join("/tmp", "Buddy Dev")
    const xdgDataHome = path.join("/Volumes", "State", "data")
    const buddyDataDir = path.join("/Volumes", "Buddy", "data")

    expect(
      resolveBuddyDataDir({
        channel: "prod",
        envXdgDataHome: xdgDataHome,
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(xdgDataHome, "buddy"))

    expect(
      resolveOpenCodeSqlitePath({
        channel: "prod",
        envBuddyDataDir: buddyDataDir,
        envXdgDataHome: xdgDataHome,
        home,
        isPackaged: true,
        userDataPath: userData,
      }),
    ).toBe(path.join(buddyDataDir, "opencode", "opencode.db"))
  })
})
