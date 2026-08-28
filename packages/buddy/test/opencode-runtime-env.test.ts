import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import {
  configureOpenCodeEnvironment,
  resolveOpenCodeEnvironmentPlan,
  type OpenCodeEnvironmentPlan,
} from "../src/opencode-runtime/env"
import {
  BUDDY_APP_NAME,
  BUDDY_ENV,
  BUDDY_HOME_DIRECTORY_NAME,
  BUDDY_OPENCODE_DB_FILENAME,
  BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
  OPENCODE_ENV,
  RUNTIME_ROOT_SEGMENTS,
  XDG_DEFAULT_SEGMENTS,
  XDG_ENV,
} from "../src/storage/constants"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { parseJsonText, requireJsonObject } from "./helpers/parse"
import { temporaryDirectory } from "./helpers/temporary-directory"

const originalCwd = process.cwd()
const originalBuddyMigrationDir = process.env[BUDDY_ENV.MIGRATION_DIR]
const bunExecutable = process.execPath
const DEFAULT_OPENCODE_CLIENT = "web"
const OPENCODE_ENABLE_FLAG = "1"
const OPENCODE_BINARY_DIRECTORY_NAME = "bin"
const OPENCODE_LOG_DIRECTORY_NAME = "log"
const OPENCODE_REPOSITORIES_DIRECTORY_NAME = "repos"
const sanitizedEnvKeys = new Set<string>([
  ...Object.values(BUDDY_ENV),
  ...Object.values(OPENCODE_ENV),
  ...Object.values(XDG_ENV),
])

function restoreEnv(name: typeof BUDDY_ENV.MIGRATION_DIR, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = value
}

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

function planFor(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
  temporaryDirectory: string,
): OpenCodeEnvironmentPlan {
  return resolveOpenCodeEnvironmentPlan({
    environment,
    homeDirectory,
    temporaryDirectory,
    workingDirectory: originalCwd,
  })
}

beforeEach(() => {
  process.chdir(originalCwd)
  restoreEnv(BUDDY_ENV.MIGRATION_DIR, originalBuddyMigrationDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  restoreEnv(BUDDY_ENV.MIGRATION_DIR, originalBuddyMigrationDir)
})

describe("opencode runtime env", () => {
  test("derives runtime-root paths and defaults from the environment plan", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })

    const plan = planFor(
      {
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
      },
      testHome.path,
      os.tmpdir(),
    )
    const expectedConfigDirectory = path.join(testHome.path, BUDDY_HOME_DIRECTORY_NAME)
    const expectedBuddyData = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.data,
      BUDDY_APP_NAME,
    )
    const expectedBuddyCache = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.cache,
      BUDDY_APP_NAME,
    )
    const expectedBuddyState = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.state,
      BUDDY_APP_NAME,
    )
    const expectedTmp = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.tmp,
      BUDDY_APP_NAME,
      BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
    )

    expect(plan.runtimeRoot).toBe(runtimeRoot.path)
    expect(plan.xdg).toEqual({
      data: path.join(runtimeRoot.path, RUNTIME_ROOT_SEGMENTS.data),
      cache: path.join(runtimeRoot.path, RUNTIME_ROOT_SEGMENTS.cache),
      config: path.join(runtimeRoot.path, RUNTIME_ROOT_SEGMENTS.config),
      state: path.join(runtimeRoot.path, RUNTIME_ROOT_SEGMENTS.state),
    })
    expect(plan.buddy).toEqual({
      data: expectedBuddyData,
      cache: expectedBuddyCache,
      state: expectedBuddyState,
      tmpParent: path.join(runtimeRoot.path, RUNTIME_ROOT_SEGMENTS.tmp, BUDDY_APP_NAME),
      tmp: expectedTmp,
      defaultGlobalConfig: expectedConfigDirectory,
    })
    expect(plan.openCode).toEqual({
      data: path.join(expectedBuddyData, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
      cache: path.join(expectedBuddyCache, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
      config: expectedConfigDirectory,
      state: path.join(expectedBuddyState, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
      tmp: expectedTmp,
      bin: path.join(
        expectedBuddyCache,
        BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
        OPENCODE_BINARY_DIRECTORY_NAME,
      ),
      log: path.join(
        expectedBuddyData,
        BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
        OPENCODE_LOG_DIRECTORY_NAME,
      ),
      repos: path.join(
        expectedBuddyData,
        BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
        OPENCODE_REPOSITORIES_DIRECTORY_NAME,
      ),
    })
    expect(plan.defaults).toEqual({
      configDirectory: expectedConfigDirectory,
      database: BUDDY_OPENCODE_DB_FILENAME,
      disableExternalSkills: OPENCODE_ENABLE_FLAG,
      client: DEFAULT_OPENCODE_CLIENT,
      enableQuestionTool: OPENCODE_ENABLE_FLAG,
      enableExa: OPENCODE_ENABLE_FLAG,
    })
  })

  test("preserves configured XDG roots and temporary fallback without a runtime root", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const xdg = {
      data: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.data),
      cache: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.cache),
      config: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.config),
      state: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.state),
    }

    for (const nodeEnvironment of ["test", "development"] as const) {
      const plan = planFor(
        {
          [BUDDY_ENV.TEST_HOME]: testHome.path,
          NODE_ENV: nodeEnvironment,
          [XDG_ENV.DATA_HOME]: xdg.data,
          [XDG_ENV.CACHE_HOME]: xdg.cache,
          [XDG_ENV.CONFIG_HOME]: xdg.config,
          [XDG_ENV.STATE_HOME]: xdg.state,
        },
        testHome.path,
        os.tmpdir(),
      )

      expect(plan.runtimeRoot).toBeUndefined()
      expect(plan.xdg).toEqual(xdg)
      expect(plan.buddy.data).toBe(path.join(xdg.data, BUDDY_APP_NAME))
      expect(plan.buddy.cache).toBe(path.join(xdg.cache, BUDDY_APP_NAME))
      expect(plan.buddy.state).toBe(path.join(xdg.state, BUDDY_APP_NAME))
      expect(plan.buddy.tmp).toBe(
        path.join(os.tmpdir(), BUDDY_APP_NAME, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
      )
    }
  })

  test("uses HOME defaults and gives Buddy category overrides precedence", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using dataDir = await temporaryDirectory({ prefix: "buddy-data-dir-" })
    await using cacheDir = await temporaryDirectory({ prefix: "buddy-cache-dir-" })
    await using stateDir = await temporaryDirectory({ prefix: "buddy-state-dir-" })
    await using configDir = await temporaryDirectory({ prefix: "buddy-config-dir-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })

    const defaults = planFor({ [BUDDY_ENV.TEST_HOME]: testHome.path }, testHome.path, os.tmpdir())
    expect(defaults.xdg).toEqual({
      data: path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.data),
      cache: path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.cache),
      config: path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.config),
      state: path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.state),
    })
    expect(defaults.buddy.data).toBe(
      path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.data, BUDDY_APP_NAME),
    )
    expect(defaults.buddy.cache).toBe(
      path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.cache, BUDDY_APP_NAME),
    )
    expect(defaults.buddy.state).toBe(
      path.join(testHome.path, ...XDG_DEFAULT_SEGMENTS.state, BUDDY_APP_NAME),
    )
    expect(defaults.defaults.configDirectory).toBe(
      path.join(testHome.path, BUDDY_HOME_DIRECTORY_NAME),
    )

    const overridden = planFor(
      {
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.DATA_DIR]: dataDir.path,
        [BUDDY_ENV.CACHE_DIR]: cacheDir.path,
        [BUDDY_ENV.STATE_DIR]: stateDir.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: configDir.path,
        [XDG_ENV.DATA_HOME]: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.data),
        [XDG_ENV.CACHE_HOME]: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.cache),
        [XDG_ENV.STATE_HOME]: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.state),
      },
      testHome.path,
      os.tmpdir(),
    )
    expect(overridden.buddy.data).toBe(dataDir.path)
    expect(overridden.buddy.cache).toBe(cacheDir.path)
    expect(overridden.buddy.state).toBe(stateDir.path)
    expect(overridden.defaults.configDirectory).toBe(
      path.join(testHome.path, BUDDY_HOME_DIRECTORY_NAME),
    )
    expect(overridden.openCode.config).toBe(configDir.path)
    expect(overridden.openCode.data).toBe(
      path.join(dataDir.path, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(overridden.openCode.cache).toBe(
      path.join(cacheDir.path, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(overridden.openCode.state).toBe(
      path.join(stateDir.path, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
  })

  test("plans OpenCode database and feature defaults", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    const plan = planFor({ [BUDDY_ENV.TEST_HOME]: testHome.path }, testHome.path, os.tmpdir())

    expect(plan.defaults.database).toBe(BUDDY_OPENCODE_DB_FILENAME)
    expect(plan.defaults.client).toBe(DEFAULT_OPENCODE_CLIENT)
    expect(plan.defaults.enableQuestionTool).toBe(OPENCODE_ENABLE_FLAG)
    expect(plan.defaults.disableExternalSkills).toBe(OPENCODE_ENABLE_FLAG)
    expect(plan.defaults.enableExa).toBe(OPENCODE_ENABLE_FLAG)
  })

  test("aligns imported Global and OpenCode paths during explicit runtime-root bootstrap", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const openCodeGlobalMod = await import("@buddy/opencode-adapter/global");
      const buddyGlobalMod = await import(${JSON.stringify(globalModulePath)});
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        openCodeData: openCodeGlobalMod.Global.Path.data,
        openCodeCache: openCodeGlobalMod.Global.Path.cache,
        openCodeConfig: openCodeGlobalMod.Global.Path.config,
        openCodeState: openCodeGlobalMod.Global.Path.state,
        openCodeTmp: openCodeGlobalMod.Global.Path.tmp,
        buddyData: buddyGlobalMod.Global.Path.data,
        buddyCache: buddyGlobalMod.Global.Path.cache,
        buddyConfig: buddyGlobalMod.Global.Path.config,
        buddyState: buddyGlobalMod.Global.Path.state,
        db: storageDbMod.DatabasePath(),
        buddyGlobalConfigDir: process.env[${JSON.stringify(BUDDY_ENV.GLOBAL_CONFIG_DIR)}],
        opencodeConfigDir: process.env[${JSON.stringify(OPENCODE_ENV.CONFIG_DIR)}],
        opencodeDb: process.env[${JSON.stringify(OPENCODE_ENV.DB)}],
        opencodeClient: process.env[${JSON.stringify(OPENCODE_ENV.CLIENT)}],
        questionTool: process.env[${JSON.stringify(OPENCODE_ENV.ENABLE_QUESTION_TOOL)}],
        disableExternalSkills: process.env[${JSON.stringify(OPENCODE_ENV.DISABLE_EXTERNAL_SKILLS)}],
        exa: process.env[${JSON.stringify(OPENCODE_ENV.ENABLE_EXA)}],
        channelDbDisable: process.env[${JSON.stringify(OPENCODE_ENV.DISABLE_CHANNEL_DB)}]
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.TEST_XDG_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))
    const expectedBuddyData = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.data,
      BUDDY_APP_NAME,
    )
    const expectedBuddyCache = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.cache,
      BUDDY_APP_NAME,
    )
    const expectedBuddyState = path.join(
      runtimeRoot.path,
      RUNTIME_ROOT_SEGMENTS.state,
      BUDDY_APP_NAME,
    )
    const expectedConfig = path.join(testHome.path, BUDDY_HOME_DIRECTORY_NAME)
    const expectedOpenCodeData = path.join(expectedBuddyData, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)

    expect(parsed.openCodeData).toBe(expectedOpenCodeData)
    expect(parsed.openCodeCache).toBe(
      path.join(expectedBuddyCache, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(parsed.openCodeConfig).toBe(expectedConfig)
    expect(parsed.openCodeState).toBe(
      path.join(expectedBuddyState, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(parsed.openCodeTmp).toBe(
      path.join(
        runtimeRoot.path,
        RUNTIME_ROOT_SEGMENTS.tmp,
        BUDDY_APP_NAME,
        BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME,
      ),
    )
    expect(parsed.buddyData).toBe(expectedBuddyData)
    expect(parsed.buddyCache).toBe(expectedBuddyCache)
    expect(parsed.buddyConfig).toBe(expectedConfig)
    expect(parsed.buddyState).toBe(expectedBuddyState)
    expect(parsed.db).toBe(path.join(expectedOpenCodeData, BUDDY_OPENCODE_DB_FILENAME))
    expect(parsed.buddyGlobalConfigDir).toBe(expectedConfig)
    expect(parsed.opencodeConfigDir).toBe(expectedConfig)
    expect(parsed.opencodeDb).toBe(BUDDY_OPENCODE_DB_FILENAME)
    expect(parsed.opencodeClient).toBe(DEFAULT_OPENCODE_CLIENT)
    expect(parsed.questionTool).toBe(OPENCODE_ENABLE_FLAG)
    expect(parsed.disableExternalSkills).toBe(OPENCODE_ENABLE_FLAG)
    expect(parsed.exa).toBe(OPENCODE_ENABLE_FLAG)
    expect(parsed.channelDbDisable).toBeUndefined()
  })

  test("aligns imported Global and OpenCode paths with existing XDG roots", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")
    const xdg = {
      data: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.data),
      cache: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.cache),
      state: path.join(xdgRoot.path, RUNTIME_ROOT_SEGMENTS.state),
    }

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const openCodeGlobalMod = await import("@buddy/opencode-adapter/global");
      const buddyGlobalMod = await import(${JSON.stringify(globalModulePath)});
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        openCodeData: openCodeGlobalMod.Global.Path.data,
        openCodeCache: openCodeGlobalMod.Global.Path.cache,
        openCodeConfig: openCodeGlobalMod.Global.Path.config,
        openCodeState: openCodeGlobalMod.Global.Path.state,
        openCodeTmp: openCodeGlobalMod.Global.Path.tmp,
        buddyData: buddyGlobalMod.Global.Path.data,
        buddyCache: buddyGlobalMod.Global.Path.cache,
        buddyConfig: buddyGlobalMod.Global.Path.config,
        buddyState: buddyGlobalMod.Global.Path.state,
        db: storageDbMod.DatabasePath()
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.TEST_XDG_ROOT]: xdgRoot.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
        [XDG_ENV.DATA_HOME]: xdg.data,
        [XDG_ENV.CACHE_HOME]: xdg.cache,
        [XDG_ENV.STATE_HOME]: xdg.state,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)
    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))
    const expectedBuddyData = path.join(xdg.data, BUDDY_APP_NAME)
    const expectedBuddyCache = path.join(xdg.cache, BUDDY_APP_NAME)
    const expectedBuddyState = path.join(xdg.state, BUDDY_APP_NAME)
    const expectedConfig = path.join(testHome.path, BUDDY_HOME_DIRECTORY_NAME)
    const expectedOpenCodeData = path.join(expectedBuddyData, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME)

    expect(parsed.openCodeData).toBe(expectedOpenCodeData)
    expect(parsed.openCodeCache).toBe(
      path.join(expectedBuddyCache, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(parsed.openCodeConfig).toBe(expectedConfig)
    expect(parsed.openCodeState).toBe(
      path.join(expectedBuddyState, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(parsed.openCodeTmp).toBe(
      path.join(os.tmpdir(), BUDDY_APP_NAME, BUDDY_OPENCODE_RUNTIME_DIRECTORY_NAME),
    )
    expect(parsed.buddyData).toBe(expectedBuddyData)
    expect(parsed.buddyCache).toBe(expectedBuddyCache)
    expect(parsed.buddyConfig).toBe(expectedConfig)
    expect(parsed.buddyState).toBe(expectedBuddyState)
    expect(parsed.db).toBe(path.join(expectedOpenCodeData, BUDDY_OPENCODE_DB_FILENAME))
  })

  test("keeps migration env vars unset when repo paths cannot be resolved", async () => {
    await using outsideRepo = await temporaryDirectory({ prefix: "buddy-env-outside-repo-" })

    try {
      delete process.env[BUDDY_ENV.MIGRATION_DIR]
      process.chdir(outsideRepo.path)

      configureOpenCodeEnvironment()

      expect(process.env[BUDDY_ENV.MIGRATION_DIR]).toBeUndefined()
    } finally {
      process.chdir(originalCwd)
    }
  })

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
