import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtempSync } from "node:fs"
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
