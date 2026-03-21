import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { configureOpenCodeEnvironment } from "../src/opencode-runtime"

const originalCwd = process.cwd()
const originalBuddyMigrationDir = process.env.BUDDY_MIGRATION_DIR

function restoreEnv(name: "BUDDY_MIGRATION_DIR", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

beforeEach(() => {
  process.chdir(originalCwd)
  restoreEnv("BUDDY_MIGRATION_DIR", originalBuddyMigrationDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  restoreEnv("BUDDY_MIGRATION_DIR", originalBuddyMigrationDir)
})

describe("opencode runtime env", () => {
  test("uses BUDDY_RUNTIME_ROOT to derive XDG paths at process startup", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        data: process.env.XDG_DATA_HOME,
        cache: process.env.XDG_CACHE_HOME,
        config: process.env.XDG_CONFIG_HOME,
        state: process.env.XDG_STATE_HOME
      }));
    `

    const result = spawnSync("bun", ["-e", script], {
      env: {
        ...process.env,
        BUDDY_RUNTIME_ROOT: runtimeRoot,
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      config: string
      state: string
    }

    expect(parsed.data).toBe(path.join(runtimeRoot, "data"))
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache"))
    expect(parsed.config).toBe(path.join(runtimeRoot, "config"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state"))
  })

  test("keeps Global storage data/cache/state under runtime root after env bootstrap", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import(${JSON.stringify(globalModulePath)});
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        state: globalMod.Global.Path.state
      }));
    `

    const result = spawnSync("bun", ["-e", script], {
      env: {
        ...process.env,
        BUDDY_RUNTIME_ROOT: runtimeRoot,
        BUDDY_TEST_HOME: testHome,
        BUDDY_GLOBAL_CONFIG_DIR: "",
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      state: string
    }

    expect(parsed.data).toBe(path.join(runtimeRoot, "data", "buddy"))
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache", "buddy"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state", "buddy"))
  })

  test("keeps migration env vars unset when repo paths cannot be resolved", () => {
    const outsideRepo = mkdtempSync(path.join(os.tmpdir(), "buddy-env-outside-repo-"))

    delete process.env.BUDDY_MIGRATION_DIR
    process.chdir(outsideRepo)

    configureOpenCodeEnvironment()

    expect(process.env.BUDDY_MIGRATION_DIR).toBeUndefined()
  })

  test("defaults global Buddy config and OPENCODE config dir to ~/.buddy", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        buddyGlobalConfigDir: process.env.BUDDY_GLOBAL_CONFIG_DIR,
        opencodeConfigDir: process.env.OPENCODE_CONFIG_DIR
      }));
    `

    const result = spawnSync("bun", ["-e", script], {
      env: {
        ...process.env,
        BUDDY_RUNTIME_ROOT: runtimeRoot,
        BUDDY_TEST_HOME: testHome,
        BUDDY_GLOBAL_CONFIG_DIR: "",
        OPENCODE_CONFIG_DIR: "",
      },
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      buddyGlobalConfigDir: string
      opencodeConfigDir: string
    }

    const expected = path.join(testHome, ".buddy")
    expect(parsed.buddyGlobalConfigDir).toBe(expected)
    expect(parsed.opencodeConfigDir).toBe(expected)
  })
})
