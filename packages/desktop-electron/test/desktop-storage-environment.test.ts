import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import { mergeShellEnv } from "../src/main/shell-env"
import { createDesktopStoreRegistry } from "../src/main/store-registry"
import {
  applyDesktopStorageEnvironment,
  pinBackendChannel,
  resolveDesktopStoragePlan,
} from "../src/main/storage-paths"

const input = {
  home: "/sandbox/home",
  readDocumentsPath: () => "/sandbox/documents",
  userDataPath: "/sandbox/beta",
  pathApi: path.posix,
}
const injectionKeys = [
  "BUDDY_CONFIG",
  "BUDDY_CONFIG_CONTENT",
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_AUTH_CONTENT",
  "OPENCODE_MODELS_PATH",
  "OPENCODE_TEST_MANAGED_CONFIG_DIR",
  "OPENCODE_TUI_CONFIG",
  "OPENCODE_PLUGIN_META_FILE",
  "OPENCODE_ZED_DB",
  "BUDDY_ADVANCED_MATH_ASSET_BASE_URL",
  "BUDDY_STANDARDS_ASSET_BASE_URL",
  "BUDDY_RUNTIME_ROOT",
  "OPENCODE_DISABLE_CHANNEL_DB",
  "BUDDY_TEST_HOME",
  "BUDDY_TEST_XDG_ROOT",
  "OPENCODE_TEST_HOME",
  "BUDDY_OPENAI_AUTH_TRACE_FILE",
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_SIGNAL",
  "BUDDY_ELECTRON_DEV_BACKEND_RELOAD_ACKNOWLEDGEMENT",
]

describe("desktop storage environment", () => {
  test.each(["darwin", "win32"] as const)(
    "Beta overrides shell/app storage injection on %s",
    (platform) => {
      const plan = resolveDesktopStoragePlan({ ...input, channel: "beta", isPackaged: true })
      const shell = Object.fromEntries(
        [...Object.keys(plan.environmentOverrides), ...injectionKeys].map((key) => [
          key,
          "/sandbox/stable/injected",
        ]),
      )
      const app = {
        BUDDY_DATA_DIR: "/sandbox/stable/app-data",
        HOME: "/sandbox/os-home",
        USERPROFILE: "/sandbox/os-profile",
        APPDATA: "/sandbox/appdata",
        LOCALAPPDATA: "/sandbox/localappdata",
        OPENCODE_DISABLE_MODELS_FETCH: "true",
        OPENCODE_DISABLE_PROJECT_CONFIG: "true",
        OPENCODE_GIT_BASH_PATH: "/sandbox/git/bin/bash.exe",
      }
      if (platform === "win32") {
        for (const key of Object.keys(shell)) {
          shell[key.toLowerCase()] = "/sandbox/stable/lowercase"
        }
        shell.Buddy_Config_Content = "/sandbox/stable/mixed-case"
      }
      const environment = applyDesktopStorageEnvironment(mergeShellEnv(shell, app), plan, platform)
      for (const [key, value] of Object.entries(plan.environmentOverrides)) {
        expect(environment[key]).toBe(value)
        expect(
          Object.keys(environment).filter((candidate) => candidate.toUpperCase() === key),
        ).toEqual([key])
      }
      for (const key of injectionKeys) {
        expect(
          Object.keys(environment).some((candidate) => candidate.toUpperCase() === key),
        ).toBe(false)
      }
      for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"] as const) {
        expect(environment[key]).toBe(app[key])
      }
      expect(environment[BUDDY_ENV.DIRECTORY_BASE]).toBe("/sandbox/documents/Buddy Beta")
      expect(environment.BUDDY_RELEASE_REPO).toBe("prashantbhudwal/buddy-beta-releases")
      expect(environment.OPENCODE_DISABLE_MODELS_FETCH).toBe("true")
      expect(environment.OPENCODE_DISABLE_PROJECT_CONFIG).toBe("true")
      expect(environment.OPENCODE_GIT_BASH_PATH).toBe("/sandbox/git/bin/bash.exe")
    },
  )

  test("Stable and dev retain existing env injection/precedence", () => {
    const environment = {
      ...Object.fromEntries(injectionKeys.map((key) => [key, "/sandbox/configured"])),
      BUDDY_CONFIG: "/sandbox/config.json",
      BUDDY_CONFIG_CONTENT: "{}",
      BUDDY_DATA_DIR: "/sandbox/custom-data",
      BUDDY_OPENAI_AUTH_TRACE_FILE: "/sandbox/trace",
      buddy_data_dir: "/sandbox/lowercase",
      TMPDIR: "/sandbox/tmp",
      BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-releases",
    }
    const stable = resolveDesktopStoragePlan({ ...input, channel: "prod", isPackaged: true })
    expect(applyDesktopStorageEnvironment(environment, stable, "win32")).toEqual(environment)
    const dev = resolveDesktopStoragePlan({ ...input, channel: "dev", isPackaged: false })
    expect(applyDesktopStorageEnvironment(environment, dev, "win32")).toEqual({
      ...environment,
      ...dev.environmentOverrides,
    })
  })

  test.each(["prod", "beta", "dev"] as const)(
    "the %s backend ignores an inherited BUDDY_CHANNEL",
    (channel) => {
      const inherited = { BUDDY_CHANNEL: "beta", Buddy_Channel: "beta", OTHER: "kept" }
      expect(pinBackendChannel(inherited, channel, "win32")).toEqual({
        BUDDY_CHANNEL: channel,
        OTHER: "kept",
      })
      expect(pinBackendChannel(inherited, channel, "darwin")).toEqual({
        ...inherited,
        BUDDY_CHANNEL: channel,
      })
    },
  )
})

describe("desktop named stores", () => {
  test("every Beta store writes under its explicit cwd before Electron's userData is set", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-beta-stores-"))
    try {
      const plan = resolveDesktopStoragePlan({
        channel: "beta",
        isPackaged: true,
        home: path.join(root, "home"),
        readDocumentsPath: () => path.join(root, "documents"),
        userDataPath: root,
      })
      const registry = createDesktopStoreRegistry({
        storagePlan: plan,
        createStore: (options) => {
          // A filesystem-backed constructor at the Electron-store boundary.
          if (!options.cwd) throw new Error("Beta store must have an explicit cwd")
          const filepath = path.join(options.cwd, options.name + options.fileExtension)
          writeFileSync(filepath, options.name)
          return { filepath }
        },
      })
      for (const name of ["buddy.settings", "other-store"]) {
        const store = registry(name)
        expect(store.filepath).toBe(path.join(root, name))
        expect(readFileSync(store.filepath, "utf8")).toBe(name)
        expect(registry(name)).toBe(store)
      }
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test.each([
    { channel: "prod", isPackaged: true },
    { channel: "dev", isPackaged: true },
    { channel: "beta", isPackaged: false },
  ] as const)(
    "$channel packaged=$isPackaged leaves store construction unchanged",
    ({ channel, isPackaged }) => {
      const registry = createDesktopStoreRegistry({
        storagePlan: resolveDesktopStoragePlan({ ...input, channel, isPackaged }),
        createStore: (options) => options,
      })
      expect(registry("buddy.settings")).toEqual({ name: "buddy.settings", fileExtension: "" })
    },
  )
})
