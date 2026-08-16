import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { configureOpenCodeEnvironment } from "../src/opencode-runtime"
import { BUDDY_ENV, OPENCODE_ENV, XDG_ENV } from "../src/storage/constants"
import z from "zod"
import { parseJsonText, parseWithSchema, requireJsonObject } from "./helpers/parse"

const xdgPathsSchema = z.object({
  data: z.string(),
  cache: z.string(),
  config: z.string(),
  state: z.string(),
  tmp: z.string(),
})
type TXdgPaths = z.infer<typeof xdgPathsSchema>

function parseXdgPaths(text: string): TXdgPaths {
  return parseWithSchema(xdgPathsSchema, parseJsonText(text), "xdg paths")
}

const originalCwd = process.cwd()
const originalBuddyMigrationDir = process.env[BUDDY_ENV.MIGRATION_DIR]
const bunExecutable = process.execPath
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

beforeEach(() => {
  process.chdir(originalCwd)
  restoreEnv(BUDDY_ENV.MIGRATION_DIR, originalBuddyMigrationDir)
})

afterEach(() => {
  process.chdir(originalCwd)
  restoreEnv(BUDDY_ENV.MIGRATION_DIR, originalBuddyMigrationDir)
})

describe("opencode runtime env", () => {
  test("uses BUDDY_RUNTIME_ROOT to derive XDG paths at process startup", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        data: process.env.XDG_DATA_HOME,
        cache: process.env.XDG_CACHE_HOME,
        config: process.env.XDG_CONFIG_HOME,
        state: process.env.XDG_STATE_HOME,
        tmp: mod.BUDDY_TMP_DIR
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot,
        [BUDDY_ENV.TEST_HOME]: testHome,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = parseXdgPaths(result.stdout.trim())

    expect(parsed.data).toBe(path.join(runtimeRoot, "data"))
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache"))
    expect(parsed.config).toBe(path.join(runtimeRoot, "config"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot, "tmp", "buddy", "opencode"))
  })

  test("aligns the shared OpenCode config and temp paths during bootstrap", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      const { Global } = await import("@buddy/opencode-adapter/global");
      console.log(JSON.stringify({
        config: Global.Path.config,
        tmp: Global.Path.tmp
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot,
        [BUDDY_ENV.TEST_HOME]: testHome,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot, "tmp", "buddy", "opencode"))
  })

  test("preserves existing XDG roots when BUDDY_RUNTIME_ROOT is absent", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot, "data"),
      cache: path.join(xdgRoot, "cache"),
      config: path.join(xdgRoot, "config"),
      state: path.join(xdgRoot, "state"),
    }

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        data: process.env.XDG_DATA_HOME,
        cache: process.env.XDG_CACHE_HOME,
        config: process.env.XDG_CONFIG_HOME,
        state: process.env.XDG_STATE_HOME,
        tmp: mod.BUDDY_TMP_DIR
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [XDG_ENV.DATA_HOME]: xdg.data,
        [XDG_ENV.CACHE_HOME]: xdg.cache,
        [XDG_ENV.CONFIG_HOME]: xdg.config,
        [XDG_ENV.STATE_HOME]: xdg.state,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = parseXdgPaths(result.stdout.trim())

    expect(parsed.data).toBe(xdg.data)
    expect(parsed.cache).toBe(xdg.cache)
    expect(parsed.config).toBe(xdg.config)
    expect(parsed.state).toBe(xdg.state)
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
  })

  test("does not synthesize a repo-local runtime root when BUDDY_RUNTIME_ROOT is absent outside tests", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot, "data"),
      cache: path.join(xdgRoot, "cache"),
      config: path.join(xdgRoot, "config"),
      state: path.join(xdgRoot, "state"),
    }

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        data: process.env.XDG_DATA_HOME,
        cache: process.env.XDG_CACHE_HOME,
        config: process.env.XDG_CONFIG_HOME,
        state: process.env.XDG_STATE_HOME,
        tmp: mod.BUDDY_TMP_DIR
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        NODE_ENV: "development",
        [XDG_ENV.DATA_HOME]: xdg.data,
        [XDG_ENV.CACHE_HOME]: xdg.cache,
        [XDG_ENV.CONFIG_HOME]: xdg.config,
        [XDG_ENV.STATE_HOME]: xdg.state,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = parseXdgPaths(result.stdout.trim())

    expect(parsed.data).toBe(xdg.data)
    expect(parsed.cache).toBe(xdg.cache)
    expect(parsed.config).toBe(xdg.config)
    expect(parsed.state).toBe(xdg.state)
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
  })

  test("keeps Global storage data/cache/state under explicit runtime root after env bootstrap", () => {
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

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot,
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.TEST_XDG_ROOT]: runtimeRoot,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.data).toBe(path.join(runtimeRoot, "data", "buddy"))
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache", "buddy"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state", "buddy"))
  })

  test("keeps Global storage data/cache/state under existing XDG roots without runtime root", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")
    const xdg = {
      data: path.join(xdgRoot, "data"),
      cache: path.join(xdgRoot, "cache"),
      state: path.join(xdgRoot, "state"),
    }

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import(${JSON.stringify(globalModulePath)});
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        config: globalMod.Global.Path.config,
        state: globalMod.Global.Path.state
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.TEST_XDG_ROOT]: xdgRoot,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
        [XDG_ENV.DATA_HOME]: xdg.data,
        [XDG_ENV.CACHE_HOME]: xdg.cache,
        [XDG_ENV.STATE_HOME]: xdg.state,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.data).toBe(path.join(xdg.data, "buddy"))
    expect(parsed.cache).toBe(path.join(xdg.cache, "buddy"))
    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.state).toBe(path.join(xdg.state, "buddy"))
  })

  test("places vendored OpenCode paths under Buddy-owned XDG parents without runtime root", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot, "data"),
      cache: path.join(xdgRoot, "cache"),
      config: path.join(xdgRoot, "config"),
      state: path.join(xdgRoot, "state"),
    }

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import("@buddy/opencode-adapter/global");
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        config: globalMod.Global.Path.config,
        state: globalMod.Global.Path.state,
        tmp: globalMod.Global.Path.tmp,
        db: storageDbMod.DatabasePath(),
        opencodeDb: process.env.OPENCODE_DB,
        channelDbDisable: process.env.OPENCODE_DISABLE_CHANNEL_DB
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [XDG_ENV.DATA_HOME]: xdg.data,
        [XDG_ENV.CACHE_HOME]: xdg.cache,
        [XDG_ENV.CONFIG_HOME]: xdg.config,
        [XDG_ENV.STATE_HOME]: xdg.state,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(xdg.data, "buddy", "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(xdg.cache, "buddy", "opencode"))
    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.state).toBe(path.join(xdg.state, "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.opencodeDb).toBe("opencode.db")
    expect(parsed.channelDbDisable).toBeUndefined()
  })

  test("defaults vendored OpenCode paths to Buddy-owned XDG parents without runtime root", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      process.env.HOME = ${JSON.stringify(testHome)};
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import("@buddy/opencode-adapter/global");
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        config: globalMod.Global.Path.config,
        state: globalMod.Global.Path.state,
        tmp: globalMod.Global.Path.tmp,
        db: storageDbMod.DatabasePath(),
        opencodeDb: process.env.OPENCODE_DB,
        channelDbDisable: process.env.OPENCODE_DISABLE_CHANNEL_DB
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        HOME: testHome,
        [BUDDY_ENV.TEST_HOME]: testHome,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(testHome, ".local", "share", "buddy", "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(testHome, ".cache", "buddy", "opencode"))
    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.state).toBe(path.join(testHome, ".local", "state", "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.opencodeDb).toBe("opencode.db")
    expect(parsed.channelDbDisable).toBeUndefined()
  })

  test("uses Buddy category overrides before XDG defaults for vendored OpenCode paths", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "buddy-data-dir-"))
    const cacheDir = mkdtempSync(path.join(os.tmpdir(), "buddy-cache-dir-"))
    const stateDir = mkdtempSync(path.join(os.tmpdir(), "buddy-state-dir-"))
    const configDir = mkdtempSync(path.join(os.tmpdir(), "buddy-config-dir-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import("@buddy/opencode-adapter/global");
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        config: globalMod.Global.Path.config,
        state: globalMod.Global.Path.state,
        db: storageDbMod.DatabasePath(),
        buddyConfigDir: process.env.BUDDY_GLOBAL_CONFIG_DIR,
        opencodeConfigDir: process.env.OPENCODE_CONFIG_DIR
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.DATA_DIR]: dataDir,
        [BUDDY_ENV.CACHE_DIR]: cacheDir,
        [BUDDY_ENV.STATE_DIR]: stateDir,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: configDir,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(dataDir, "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(cacheDir, "opencode"))
    expect(parsed.config).toBe(configDir)
    expect(parsed.state).toBe(path.join(stateDir, "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.buddyConfigDir).toBe(configDir)
    expect(parsed.opencodeConfigDir).toBe(configDir)
  })

  test("places vendored OpenCode paths under explicit runtime root Buddy parents", () => {
    const runtimeRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-runtime-root-"))
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const envMod = await import(${JSON.stringify(envModulePath)});
      envMod.configureOpenCodeEnvironment();
      const globalMod = await import("@buddy/opencode-adapter/global");
      const storageDbMod = await import("@buddy/opencode-adapter/storage-db");
      console.log(JSON.stringify({
        data: globalMod.Global.Path.data,
        cache: globalMod.Global.Path.cache,
        state: globalMod.Global.Path.state,
        tmp: globalMod.Global.Path.tmp,
        db: storageDbMod.DatabasePath()
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot,
        [BUDDY_ENV.TEST_HOME]: testHome,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(runtimeRoot, "data", "buddy", "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache", "buddy", "opencode"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state", "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot, "tmp", "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
  })

  test("keeps migration env vars unset when repo paths cannot be resolved", () => {
    const outsideRepo = mkdtempSync(path.join(os.tmpdir(), "buddy-env-outside-repo-"))

    delete process.env[BUDDY_ENV.MIGRATION_DIR]
    process.chdir(outsideRepo)

    configureOpenCodeEnvironment()

    expect(process.env[BUDDY_ENV.MIGRATION_DIR]).toBeUndefined()
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

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot,
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
        [OPENCODE_ENV.CONFIG_DIR]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expected = path.join(testHome, ".buddy")
    expect(parsed.buddyGlobalConfigDir).toBe(expected)
    expect(parsed.opencodeConfigDir).toBe(expected)
  })

  test("sets OPENCODE_DB without setting OPENCODE_DISABLE_CHANNEL_DB by default", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      delete process.env.OPENCODE_DISABLE_CHANNEL_DB;
      delete process.env.OPENCODE_DB;
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        opencodeDb: process.env.OPENCODE_DB,
        channelDbDisable: process.env.OPENCODE_DISABLE_CHANNEL_DB
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [XDG_ENV.DATA_HOME]: path.join(xdgRoot, "data"),
        [XDG_ENV.CACHE_HOME]: path.join(xdgRoot, "cache"),
        [XDG_ENV.CONFIG_HOME]: path.join(xdgRoot, "config"),
        [XDG_ENV.STATE_HOME]: path.join(xdgRoot, "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.opencodeDb).toBe("opencode.db")
    expect(parsed.channelDbDisable).toBeUndefined()
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

  test("fails closed when test storage resolves under the real home", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const testXdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-root-"))
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
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.TEST_XDG_ROOT]: testXdgRoot,
        NODE_ENV: "test",
        [XDG_ENV.DATA_HOME]: path.join(os.homedir(), ".local", "share"),
        [XDG_ENV.CACHE_HOME]: path.join(os.homedir(), ".cache"),
        [XDG_ENV.STATE_HOME]: path.join(os.homedir(), ".local", "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("real home directory")
  })

  test("fails closed when test storage resolves outside isolated test roots", () => {
    const testRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-test-root-"))
    const testHome = path.join(testRoot, "home")
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
        [BUDDY_ENV.DATA_DIR]: mkdtempSync(path.join(os.tmpdir(), "buddy-outside-test-root-")),
        [BUDDY_ENV.TEST_HOME]: testHome,
        [BUDDY_ENV.TEST_XDG_ROOT]: testRoot,
        NODE_ENV: "test",
        [XDG_ENV.CACHE_HOME]: path.join(testRoot, "cache"),
        [XDG_ENV.DATA_HOME]: path.join(testRoot, "data"),
        [XDG_ENV.STATE_HOME]: path.join(testRoot, "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("outside isolated test roots")
  })

  test("enables OpenCode question tool support for Buddy web sessions by default", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const xdgRoot = mkdtempSync(path.join(os.tmpdir(), "buddy-xdg-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        client: process.env.OPENCODE_CLIENT,
        questionTool: process.env.OPENCODE_ENABLE_QUESTION_TOOL
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
        [OPENCODE_ENV.CLIENT]: "",
        [OPENCODE_ENV.ENABLE_QUESTION_TOOL]: "",
        [XDG_ENV.DATA_HOME]: path.join(xdgRoot, "data"),
        [XDG_ENV.CACHE_HOME]: path.join(xdgRoot, "cache"),
        [XDG_ENV.CONFIG_HOME]: path.join(xdgRoot, "config"),
        [XDG_ENV.STATE_HOME]: path.join(xdgRoot, "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.client).toBe("web")
    expect(parsed.questionTool).toBe("1")
  })
})
