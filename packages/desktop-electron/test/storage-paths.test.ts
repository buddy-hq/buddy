import { describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import {
  DESKTOP_XDG_ENV,
  prepareDesktopStorageDirectories,
  resolveDesktopStoragePlan,
  resolveAllowedDirectoryRoots,
  resolveBuddyDataDir,
  resolveDevRuntimeEnvironment,
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
    expect(
      shouldUseDevRuntimeIsolation({
        channel: "beta",
        isPackaged: true,
      }),
    ).toBe(false)
  })

  test("pins every mutable Buddy Dev root under Electron userData", () => {
    const userData = path.join("/tmp", "Buddy Dev")

    expect(resolveDevRuntimeEnvironment(userData)).toEqual({
      [DESKTOP_XDG_ENV.DATA_HOME]: path.join(userData, "xdg", "data"),
      [DESKTOP_XDG_ENV.CACHE_HOME]: path.join(userData, "xdg", "cache"),
      [DESKTOP_XDG_ENV.CONFIG_HOME]: path.join(userData, "xdg", "config"),
      [DESKTOP_XDG_ENV.STATE_HOME]: path.join(userData, "xdg", "state"),
      [BUDDY_ENV.DATA_DIR]: path.join(userData, "xdg", "data", "buddy"),
      [BUDDY_ENV.CACHE_DIR]: path.join(userData, "xdg", "cache", "buddy"),
      [BUDDY_ENV.GLOBAL_CONFIG_DIR]: path.join(userData, "xdg", "config", "buddy"),
      [BUDDY_ENV.STATE_DIR]: path.join(userData, "xdg", "state", "buddy"),
    })
  })

  test("authorizes notebook home without authorizing runtime storage", () => {
    const home = path.join("/Users", "buddy")
    const expectedNotebookHome = path.join(home, "Documents", "Buddy")

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
    ).toBe(path.join(userData, "xdg", "data", "buddy", "opencode", "opencode.db"))

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

const legacyDevEnvironment = {
  XDG_DATA_HOME: "/sandbox/user-data/xdg/data",
  XDG_CACHE_HOME: "/sandbox/user-data/xdg/cache",
  XDG_CONFIG_HOME: "/sandbox/user-data/xdg/config",
  XDG_STATE_HOME: "/sandbox/user-data/xdg/state",
  BUDDY_DATA_DIR: "/sandbox/user-data/xdg/data/buddy",
  BUDDY_CACHE_DIR: "/sandbox/user-data/xdg/cache/buddy",
  BUDDY_GLOBAL_CONFIG_DIR: "/sandbox/user-data/xdg/config/buddy",
  BUDDY_STATE_DIR: "/sandbox/user-data/xdg/state/buddy",
}

describe("desktop storage plan", () => {
  for (const channel of ["dev", "beta", "prod"] as const) {
    for (const isPackaged of [false, true]) {
      test(`${channel}, packaged=${isPackaged}: preserves legacy behavior outside packaged Beta`, () => {
        const input = {
          channel,
          isPackaged,
          home: "/sandbox/home",
          userDataPath: "/sandbox/user-data",
          documentsPath: "/sandbox/redirected-documents",
          pathApi: path.posix,
        }
        const plan = resolveDesktopStoragePlan(input)
        const beta = channel === "beta" && isPackaged
        const production = channel === "prod" && isPackaged
        expect(plan.kind).toBe(beta ? "beta" : production ? "production" : "development")
        expect(plan.notebookHome).toBe(
          beta ? "/sandbox/redirected-documents/Buddy Beta" : "/sandbox/home/Documents/Buddy",
        )
        expect(plan.openCodeSqlitePath).toBe(
          production
            ? "/sandbox/home/.local/share/buddy/opencode/opencode.db"
            : "/sandbox/user-data/xdg/data/buddy/opencode/opencode.db",
        )
        if (!beta) {
          // Captured from the pre-change implementation using these sandbox inputs.
          expect(plan.environmentOverrides).toEqual(production ? {} : legacyDevEnvironment)
          expect(plan.electronPaths).toBeUndefined()
          expect(plan.storeCwd).toBeUndefined()
          const overridden = resolveDesktopStoragePlan({
            ...input,
            envBuddyDataDir: "/sandbox/custom-data",
            envXdgDataHome: "/sandbox/custom-xdg",
          })
          expect(overridden.openCodeSqlitePath).toBe("/sandbox/custom-data/opencode/opencode.db")
        }
      })
    }
  }

  test.each([
    {
      pathApi: path.posix,
      userData: "/sandbox/beta",
      documents: "/sandbox/cloud/Documents",
      separator: "/",
    },
    {
      pathApi: path.win32,
      userData: "C:\\sandbox\\beta",
      documents: "D:\\Cloud\\Documents",
      separator: "\\",
    },
  ])(
    "pins exact Beta layout using $separator paths and redirected Documents",
    ({ pathApi, userData, documents, separator }) => {
      const plan = resolveDesktopStoragePlan({
        channel: "beta",
        isPackaged: true,
        home: "/sandbox/home",
        documentsPath: documents,
        userDataPath: userData,
        pathApi,
        envBuddyDataDir: "/sandbox/stable/data",
        envXdgDataHome: "/sandbox/stable/xdg",
      })
      const u = userData
      const n = `${documents}${separator}Buddy Beta`
      const at = (suffix: string) => `${u}${separator}${suffix.replaceAll("/", separator)}`
      expect(plan.environmentOverrides).toEqual({
        XDG_DATA_HOME: at("xdg/data"),
        XDG_CACHE_HOME: at("xdg/cache"),
        XDG_CONFIG_HOME: at("xdg/config"),
        XDG_STATE_HOME: at("xdg/state"),
        BUDDY_DATA_DIR: at("xdg/data/buddy"),
        BUDDY_CACHE_DIR: at("xdg/cache/buddy"),
        BUDDY_GLOBAL_CONFIG_DIR: at("xdg/config/buddy"),
        BUDDY_STATE_DIR: at("xdg/state/buddy"),
        BUDDY_MANAGED_HOME_DIR: at("xdg/config/buddy"),
        BUDDY_DEFAULT_NOTEBOOK_HOME: n,
        BUDDY_OPENCODE_SKILL_CACHE_DIR: at("xdg/cache/buddy/opencode/skills"),
        BUDDY_DIRECTORY_BASE: n,
        BUDDY_ALLOWED_DIRECTORY_ROOTS: n,
        TMPDIR: at("xdg/tmp"),
        TMP: at("xdg/tmp"),
        TEMP: at("xdg/tmp"),
        OPENCODE_CONFIG_DIR: at("xdg/config/buddy"),
        OPENCODE_DB: "opencode.db",
        BUDDY_CHANNEL: "beta",
      })
      expect(plan.electronPaths).toEqual({
        sessionData: u,
        temp: at("xdg/tmp"),
        logs: at("logs"),
        crashDumps: at("crash-dumps"),
      })
      expect(plan.storeCwd).toBe(u)
      expect(plan.openCodeSqlitePath).toBe(at("xdg/data/buddy/opencode/opencode.db"))
      expect(
        resolveBuddyDataDir({
          channel: "beta",
          isPackaged: true,
          home: "/sandbox/home",
          userDataPath: u,
          pathApi,
          envBuddyDataDir: "/sandbox/stable/data",
          envXdgDataHome: "/sandbox/stable/xdg",
        }),
      ).toBe(at("xdg/data/buddy"))
      for (const directory of [
        u,
        n,
        at("xdg/tmp"),
        at("logs"),
        at("crash-dumps"),
        at("xdg/data/buddy"),
        at("xdg/cache/buddy/opencode/skills"),
        at("xdg/config/buddy"),
        at("xdg/state/buddy"),
      ]) {
        expect(plan.directoriesToCreate).toContain(directory)
      }
    },
  )

  test("fails closed when a Beta root cannot be created", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-beta-storage-"))
    try {
      const blocked = path.join(root, "blocked")
      writeFileSync(blocked, "a file prevents creating the storage directory")
      const plan = resolveDesktopStoragePlan({
        channel: "beta",
        isPackaged: true,
        home: path.join(root, "home"),
        documentsPath: path.join(root, "documents"),
        userDataPath: blocked,
      })
      const result = prepareDesktopStorageDirectories(plan)
      expect(result.type).toBe("err")
      if (result.type !== "err") throw new Error("Expected storage preparation failure")
      expect(result.error.directory).toBe(blocked)
      expect(result.error.message).toContain("not writable")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
