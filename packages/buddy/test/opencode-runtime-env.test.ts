import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import {
  BUDDY_ENV,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "../src/storage/constants"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { temporaryDirectory } from "./helpers/temporary-directory"

const bunExecutable = process.execPath
const sanitizedEnvKeys = new Set<string>([
  ...Object.values(BUDDY_ENV),
  ...Object.values(OPENCODE_ENV),
  ...Object.values(XDG_ENV),
])

function childEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (sanitizedEnvKeys.has(key) || value === undefined) continue
    env[key] = value
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
      continue
    }
    env[key] = value
  }

  return env
}

describe("opencode runtime env", () => {
  test("fails closed when test storage is initialized without BUDDY_TEST_HOME", () => {
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")

    const script = `
      try {
        const mod = await import(${JSON.stringify(globalModulePath)});
        mod.Global.ensure();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        NODE_ENV: "test",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("BUDDY_TEST_HOME")
  })

  test("fails closed when test storage resolves under the real home", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using testXdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-root-" })
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")

    const script = `
      try {
        const mod = await import(${JSON.stringify(globalModulePath)});
        mod.Global.ensure();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        HOME: TEST_SANDBOX.originalHome,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.TEST_XDG_ROOT]: testXdgRoot.path,
        NODE_ENV: "test",
        [XDG_ENV.DATA_HOME]: path.join(TEST_SANDBOX.originalHome, ...XDG_DEFAULT_SEGMENTS.data),
        [XDG_ENV.CACHE_HOME]: path.join(TEST_SANDBOX.originalHome, ...XDG_DEFAULT_SEGMENTS.cache),
        [XDG_ENV.STATE_HOME]: path.join(TEST_SANDBOX.originalHome, ...XDG_DEFAULT_SEGMENTS.state),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("real home directory")
  })

  test("fails closed when test storage resolves outside isolated test roots", async () => {
    await using testRoot = await temporaryDirectory({ prefix: "buddy-test-root-" })
    await using outsideDataDir = await temporaryDirectory({ prefix: "buddy-outside-test-root-" })
    const testHome = path.join(testRoot.path, "home")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")

    const script = `
      try {
        const mod = await import(${JSON.stringify(globalModulePath)});
        mod.Global.ensure();
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.DATA_DIR]: outsideDataDir.path,
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.TEST_XDG_ROOT]: testRoot.path,
        NODE_ENV: "test",
        [XDG_ENV.CACHE_HOME]: path.join(testRoot.path, RUNTIME_ROOT_SEGMENTS.cache),
        [XDG_ENV.DATA_HOME]: path.join(testRoot.path, RUNTIME_ROOT_SEGMENTS.data),
        [XDG_ENV.STATE_HOME]: path.join(testRoot.path, RUNTIME_ROOT_SEGMENTS.state),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("outside isolated test roots")
  })
})
