import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { configureOpenCodeEnvironment } from "../src/opencode-runtime/env.js"

const originalCwd = process.cwd()
const originalBuddyMigrationDir = process.env.BUDDY_MIGRATION_DIR
const originalOpenCodeMigrationDir = process.env.OPENCODE_MIGRATION_DIR

function restoreEnv(name: "BUDDY_MIGRATION_DIR" | "OPENCODE_MIGRATION_DIR", value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

beforeEach(() => {
  process.chdir(originalCwd)
  restoreEnv("BUDDY_MIGRATION_DIR", originalBuddyMigrationDir)
  restoreEnv("OPENCODE_MIGRATION_DIR", originalOpenCodeMigrationDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  restoreEnv("BUDDY_MIGRATION_DIR", originalBuddyMigrationDir)
  restoreEnv("OPENCODE_MIGRATION_DIR", originalOpenCodeMigrationDir)
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

  test("keeps migration env vars unset when repo paths cannot be resolved", () => {
    const outsideRepo = mkdtempSync(path.join(os.tmpdir(), "buddy-env-outside-repo-"))

    delete process.env.BUDDY_MIGRATION_DIR
    delete process.env.OPENCODE_MIGRATION_DIR
    process.chdir(outsideRepo)

    configureOpenCodeEnvironment()

    expect(process.env.BUDDY_MIGRATION_DIR).toBeUndefined()
    expect(process.env.OPENCODE_MIGRATION_DIR).toBeUndefined()
  })
})
