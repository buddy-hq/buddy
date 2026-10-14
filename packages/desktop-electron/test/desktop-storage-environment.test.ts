import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { BUDDY_ENV } from "@buddy/script/storage-env"
import { mergeShellEnv } from "../src/main/shell-env"
import { createDesktopStoreRegistry } from "../src/main/store-registry"
import {
  applyDesktopStorageEnvironment,
  resolveDesktopStoragePlan,
} from "../src/main/storage-paths"

const input = {
  home: "/sandbox/home",
  documentsPath: "/sandbox/documents",
  userDataPath: "/sandbox/beta",
  pathApi: path.posix,
}
const injectionKeys = [
  "BUDDY_CONFIG",
  "BUDDY_CONFIG_CONTENT",
  "OPENCODE_CONFIG",
  "OPENCODE_CONFIG_CONTENT",
  "OPENCODE_AUTH_CONTENT",
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
    },
  )

  test("Stable and dev retain existing env injection/precedence", () => {
    const environment = {
      BUDDY_CONFIG: "/sandbox/config.json",
      BUDDY_CONFIG_CONTENT: "{}",
      BUDDY_DATA_DIR: "/sandbox/custom-data",
      BUDDY_OPENAI_AUTH_TRACE_FILE: "/sandbox/trace",
      buddy_data_dir: "/sandbox/lowercase",
      TMPDIR: "/sandbox/tmp",
    }
    const stable = resolveDesktopStoragePlan({ ...input, channel: "prod", isPackaged: true })
    expect(applyDesktopStorageEnvironment(environment, stable, "win32")).toEqual(environment)
    const dev = resolveDesktopStoragePlan({ ...input, channel: "dev", isPackaged: false })
    expect(applyDesktopStorageEnvironment(environment, dev, "win32")).toEqual({
      ...environment,
      ...dev.environmentOverrides,
    })
  })
})

describe("desktop named stores", () => {
  test("every Beta store writes under its explicit cwd before Electron's userData is set", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-beta-stores-"))
    try {
      const plan = resolveDesktopStoragePlan({
        channel: "beta",
        isPackaged: true,
        home: path.join(root, "home"),
        documentsPath: path.join(root, "documents"),
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
