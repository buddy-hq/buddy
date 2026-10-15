import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import os from "node:os"
import fs from "node:fs/promises"
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

  test("packaged Beta bootstraps only sandbox roots and preserves Stable captures", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-beta-bootstrap-" })
    const home = path.join(root.path, "os-home")
    const userData = path.join(root.path, "beta")
    const documents = path.join(root.path, "redirected-documents")
    const stableTmp = path.join(root.path, "stable-temp")
    const stableCapture = path.join(stableTmp, "buddy", "opencode", "bench-captures", "stable.png")
    const stableAuth = path.join(home, ".local", "share", "buddy", "opencode", "auth.json")
    await fs.mkdir(path.dirname(stableCapture), { recursive: true })
    await fs.mkdir(path.dirname(stableAuth), { recursive: true })
    await fs.writeFile(stableCapture, "stable capture survives")
    await fs.writeFile(
      stableAuth,
      JSON.stringify({ stable: { type: "api", key: "sandbox-stable-key" } }),
    )
    // User-authored OpenCode config is shared on purpose, like ~/.claude and ~/.agents.
    const userOpenCodeConfig = path.join(home, ".opencode")
    await fs.mkdir(userOpenCodeConfig, { recursive: true })
    // The environment packaged Beta's desktop shell hands the backend (see desktop storage-paths).
    const notebookHome = path.join(documents, "Buddy Beta")
    const xdg = (category: string, ...rest: string[]) =>
      path.join(userData, "xdg", category, ...rest)
    const betaEnvironment = {
      XDG_DATA_HOME: xdg("data"),
      XDG_CACHE_HOME: xdg("cache"),
      XDG_CONFIG_HOME: xdg("config"),
      XDG_STATE_HOME: xdg("state"),
      [BUDDY_ENV.DATA_DIR]: xdg("data", "buddy"),
      [BUDDY_ENV.CACHE_DIR]: xdg("cache", "buddy"),
      [BUDDY_ENV.GLOBAL_CONFIG_DIR]: xdg("config", "buddy"),
      [BUDDY_ENV.STATE_DIR]: xdg("state", "buddy"),
      [BUDDY_ENV.MANAGED_HOME_DIR]: xdg("config", "buddy"),
      [BUDDY_ENV.DEFAULT_NOTEBOOK_HOME]: notebookHome,
      [BUDDY_ENV.OPENCODE_SKILL_CACHE_DIR]: xdg("cache", "buddy", "opencode", "skills"),
      [BUDDY_ENV.DIRECTORY_BASE]: notebookHome,
      [BUDDY_ENV.ALLOWED_DIRECTORY_ROOTS]: notebookHome,
      TMPDIR: xdg("tmp"),
      TMP: xdg("tmp"),
      TEMP: xdg("tmp"),
      OPENCODE_CONFIG_DIR: xdg("config", "buddy"),
      OPENCODE_DB: BUDDY_OPENCODE_DB_FILENAME,
      BUDDY_CHANNEL: "beta",
    }
    for (const directory of [notebookHome, xdg("tmp"), xdg("state", "buddy")]) {
      await fs.mkdir(directory, { recursive: true })
    }
    const betaCapture = path.join(
      userData,
      "xdg",
      "tmp",
      "buddy",
      "opencode",
      "bench-captures",
      "stale.png",
    )
    await fs.mkdir(path.dirname(betaCapture), { recursive: true })
    await fs.writeFile(betaCapture, "Beta's old capture should be removed")
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const storageModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")
    const skillsModulePath = path.resolve(
      import.meta.dir,
      "../src/learning/skill-management/service/paths.ts",
    )
    const captureModulePath = path.resolve(
      import.meta.dir,
      "../src/learning/features/bench/captures.ts",
    )
    const flockModulePath = path.resolve(
      import.meta.dir,
      "../../../vendor/opencode/packages/core/src/util/flock.ts",
    )
    const locks = path.join(userData, "xdg", "state", "buddy", "opencode", "locks")
    const script = `
      await import(${JSON.stringify(envModulePath)});
      const { Global: opencode } = await import("@buddy/opencode-adapter/global");
      const { Global: buddy } = await import(${JSON.stringify(storageModulePath)});
      const { DatabasePath } = await import("@buddy/opencode-adapter/storage-db");
      const skills = await import(${JSON.stringify(skillsModulePath)});
      const { Auth } = await import("@buddy/opencode-adapter/auth");
      const { McpAuth } = await import("opencode/mcp/auth");
      const { EffectFlock } = await import("@opencode-ai/core/util/effect-flock");
      const { AppNodeBuilderV1 } = await import("opencode/effect/app-node-builder-v1");
      const { makeRuntime } = await import("opencode/effect/run-service");
      const { Effect } = await import("effect");
      const { ConfigPaths } = await import("opencode/config/paths");
      const { FSUtil } = await import("@opencode-ai/core/fs-util");
      const discoveredConfigDirectories = await Effect.runPromise(
        ConfigPaths.directories(${JSON.stringify(notebookHome)}).pipe(
          Effect.provide(AppNodeBuilderV1.build(FSUtil.node))));
      const fs = await import("node:fs/promises");
      const { Flock } = await import(${JSON.stringify(flockModulePath)});
      const initialAuth = await Auth.all();
      await Auth.set("beta", { type: "api", key: "sandbox-beta-key" });
      const mcp = makeRuntime(McpAuth.Service, AppNodeBuilderV1.build(McpAuth.node));
      await mcp.runPromise((svc) => svc.set("beta", { tokens: { accessToken: "sandbox-beta-token" } }));
      const lease = await Flock.acquire("beta-bootstrap-classic");
      const classicLocks = await fs.readdir(${JSON.stringify(locks)});
      await lease.release();
      const flock = makeRuntime(EffectFlock.Service, AppNodeBuilderV1.build(EffectFlock.node));
      const effectLocks = await flock.runPromise((svc) => svc.withLock(
        Effect.promise(() => fs.readdir(${JSON.stringify(locks)})), "beta-bootstrap-effect"));
      const { initializeBenchCaptureStorage } = await import(${JSON.stringify(captureModulePath)});
      await initializeBenchCaptureStorage();
      console.log(JSON.stringify({
        buddy: { data: buddy.Path.data, cache: buddy.Path.cache, config: buddy.Path.config, state: buddy.Path.state },
        opencode: { home: opencode.Path.home, data: opencode.Path.data, cache: opencode.Path.cache,
          config: opencode.Path.config, state: opencode.Path.state, tmp: opencode.Path.tmp },
        db: DatabasePath(), initialAuth, classicLocks, effectLocks, discoveredConfigDirectories,
        skillCache: skills.OPENCODE_SKILL_CACHE_ROOT, managedHome: skills.buddyHomeRoot(),
        tmp: (await import("node:os")).tmpdir()
      }));
      process.exit(0);
    `
    const inheritedEnvironment = childEnv({
      HOME: home,
      USERPROFILE: home,
      NODE_ENV: "production",
      TMPDIR: stableTmp,
      TMP: stableTmp,
      TEMP: stableTmp,
      [BUDDY_ENV.TEST_HOME]: path.join(root.path, "inherited-stable-home"),
      [BUDDY_ENV.RUNTIME_ROOT]: path.join(root.path, "inherited-stable-runtime"),
      OPENCODE_TEST_HOME: path.join(root.path, "inherited-opencode-home"),
      OPENCODE_AUTH_CONTENT: JSON.stringify({
        stable: { type: "api", key: "sandbox-inherited-key" },
      }),
    })
    const environment = Object.fromEntries(
      Object.entries(inheritedEnvironment).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    )
    const result = spawnSync(bunExecutable, ["-e", script], {
      // Resolve OpenCode-only dependencies at the adapter package boundary.
      cwd: path.resolve(import.meta.dir, "../../opencode-adapter"),
      env: betaBackendEnvironment(environment, betaEnvironment),
      encoding: "utf8",
      timeout: 3_000,
    })
    expect(result.stderr).toBe("")
    expect(result.status).toBe(0)
    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))
    expect(parsed.buddy).toEqual({
      data: path.join(userData, "xdg", "data", "buddy"),
      cache: path.join(userData, "xdg", "cache", "buddy"),
      config: path.join(userData, "xdg", "config", "buddy"),
      state: path.join(userData, "xdg", "state", "buddy"),
    })
    expect(parsed.opencode).toEqual({
      home,
      data: path.join(userData, "xdg", "data", "buddy", "opencode"),
      cache: path.join(userData, "xdg", "cache", "buddy", "opencode"),
      config: path.join(userData, "xdg", "config", "buddy"),
      state: path.join(userData, "xdg", "state", "buddy", "opencode"),
      tmp: path.join(userData, "xdg", "tmp", "buddy", "opencode"),
    })
    expect(parsed.db).toBe(path.join(userData, "xdg", "data", "buddy", "opencode", "opencode.db"))
    expect(parsed.skillCache).toBe(
      path.join(userData, "xdg", "cache", "buddy", "opencode", "skills"),
    )
    expect(parsed.managedHome).toBe(path.join(userData, "xdg", "config", "buddy"))
    expect(parsed.tmp).toBe(path.join(userData, "xdg", "tmp"))
    expect(parsed.initialAuth).toEqual({})
    expect(parsed.discoveredConfigDirectories).toContain(userOpenCodeConfig)
    expect(parsed.classicLocks).toEqual([expect.stringMatching(/\.lock$/)])
    expect(parsed.effectLocks).toEqual([expect.stringMatching(/\.lock$/)])
    const betaAuth = path.join(userData, "xdg", "data", "buddy", "opencode", "auth.json")
    const betaMcpAuth = path.join(userData, "xdg", "data", "buddy", "opencode", "mcp-auth.json")
    expect(JSON.parse(await fs.readFile(betaAuth, "utf8"))).toEqual({
      beta: { type: "api", key: "sandbox-beta-key" },
    })
    expect(JSON.parse(await fs.readFile(betaMcpAuth, "utf8"))).toEqual({
      beta: { tokens: { accessToken: "sandbox-beta-token" } },
    })
    expect(await fs.readFile(stableCapture, "utf8")).toBe("stable capture survives")
    expect(JSON.parse(await fs.readFile(stableAuth, "utf8"))).toEqual({
      stable: { type: "api", key: "sandbox-stable-key" },
    })
    expect(await Bun.file(betaCapture).exists()).toBe(false)
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

/** Mirror the desktop shell: strip inherited storage injection, then apply Beta's roots. */
function betaBackendEnvironment(inherited: Record<string, string>, beta: Record<string, string>) {
  const environment = { ...inherited }
  for (const key of [
    BUDDY_ENV.TEST_HOME,
    BUDDY_ENV.TEST_XDG_ROOT,
    BUDDY_ENV.RUNTIME_ROOT,
    "OPENCODE_TEST_HOME",
    "OPENCODE_AUTH_CONTENT",
  ]) {
    delete environment[key]
  }
  return { ...environment, ...beta }
}
