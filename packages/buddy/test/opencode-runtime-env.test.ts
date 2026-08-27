import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import os from "node:os"
import path from "node:path"
import { configureOpenCodeEnvironment } from "../src/opencode-runtime"
import { BUDDY_ENV, OPENCODE_ENV, XDG_ENV } from "../src/storage/constants"
import z from "zod"
import { TEST_SANDBOX } from "../../../script/test-preload"
import { parseJsonText, parseWithSchema, requireJsonObject } from "./helpers/parse"
import { temporaryDirectory } from "./helpers/temporary-directory"

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
  test("uses BUDDY_RUNTIME_ROOT to derive XDG paths at process startup", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
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
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = parseXdgPaths(result.stdout.trim())

    expect(parsed.data).toBe(path.join(runtimeRoot.path, "data"))
    expect(parsed.cache).toBe(path.join(runtimeRoot.path, "cache"))
    expect(parsed.config).toBe(path.join(runtimeRoot.path, "config"))
    expect(parsed.state).toBe(path.join(runtimeRoot.path, "state"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot.path, "tmp", "buddy", "opencode"))
  })

  test("aligns the shared OpenCode config and temp paths during bootstrap", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
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
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.config).toBe(path.join(testHome.path, ".buddy"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot.path, "tmp", "buddy", "opencode"))
  })

  test("preserves existing XDG roots when BUDDY_RUNTIME_ROOT is absent", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot.path, "data"),
      cache: path.join(xdgRoot.path, "cache"),
      config: path.join(xdgRoot.path, "config"),
      state: path.join(xdgRoot.path, "state"),
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
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

  test("does not synthesize a repo-local runtime root when BUDDY_RUNTIME_ROOT is absent outside tests", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot.path, "data"),
      cache: path.join(xdgRoot.path, "cache"),
      config: path.join(xdgRoot.path, "config"),
      state: path.join(xdgRoot.path, "state"),
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
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

  test("keeps Global storage data/cache/state under explicit runtime root after env bootstrap", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
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
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.TEST_XDG_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.data).toBe(path.join(runtimeRoot.path, "data", "buddy"))
    expect(parsed.cache).toBe(path.join(runtimeRoot.path, "cache", "buddy"))
    expect(parsed.state).toBe(path.join(runtimeRoot.path, "state", "buddy"))
  })

  test("keeps Global storage data/cache/state under existing XDG roots without runtime root", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const globalModulePath = path.resolve(import.meta.dir, "../src/storage/global.ts")
    const xdg = {
      data: path.join(xdgRoot.path, "data"),
      cache: path.join(xdgRoot.path, "cache"),
      state: path.join(xdgRoot.path, "state"),
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

    expect(parsed.data).toBe(path.join(xdg.data, "buddy"))
    expect(parsed.cache).toBe(path.join(xdg.cache, "buddy"))
    expect(parsed.config).toBe(path.join(testHome.path, ".buddy"))
    expect(parsed.state).toBe(path.join(xdg.state, "buddy"))
  })

  test("places vendored OpenCode paths under Buddy-owned XDG parents without runtime root", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")
    const xdg = {
      data: path.join(xdgRoot.path, "data"),
      cache: path.join(xdgRoot.path, "cache"),
      config: path.join(xdgRoot.path, "config"),
      state: path.join(xdgRoot.path, "state"),
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
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
    expect(parsed.config).toBe(path.join(testHome.path, ".buddy"))
    expect(parsed.state).toBe(path.join(xdg.state, "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.opencodeDb).toBe("opencode.db")
    expect(parsed.channelDbDisable).toBeUndefined()
  })

  test("defaults vendored OpenCode paths to Buddy-owned XDG parents without runtime root", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    const envModulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      process.env.HOME = ${JSON.stringify(testHome.path)};
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
        HOME: testHome.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(testHome.path, ".local", "share", "buddy", "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(testHome.path, ".cache", "buddy", "opencode"))
    expect(parsed.config).toBe(path.join(testHome.path, ".buddy"))
    expect(parsed.state).toBe(path.join(testHome.path, ".local", "state", "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.opencodeDb).toBe("opencode.db")
    expect(parsed.channelDbDisable).toBeUndefined()
  })

  test("uses Buddy category overrides before XDG defaults for vendored OpenCode paths", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using dataDir = await temporaryDirectory({ prefix: "buddy-data-dir-" })
    await using cacheDir = await temporaryDirectory({ prefix: "buddy-cache-dir-" })
    await using stateDir = await temporaryDirectory({ prefix: "buddy-state-dir-" })
    await using configDir = await temporaryDirectory({ prefix: "buddy-config-dir-" })
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.DATA_DIR]: dataDir.path,
        [BUDDY_ENV.CACHE_DIR]: cacheDir.path,
        [BUDDY_ENV.STATE_DIR]: stateDir.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: configDir.path,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(dataDir.path, "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(cacheDir.path, "opencode"))
    expect(parsed.config).toBe(configDir.path)
    expect(parsed.state).toBe(path.join(stateDir.path, "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
    expect(parsed.buddyConfigDir).toBe(configDir.path)
    expect(parsed.opencodeConfigDir).toBe(configDir.path)
  })

  test("places vendored OpenCode paths under explicit runtime root Buddy parents", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
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
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expectedData = path.join(runtimeRoot.path, "data", "buddy", "opencode")
    expect(parsed.data).toBe(expectedData)
    expect(parsed.cache).toBe(path.join(runtimeRoot.path, "cache", "buddy", "opencode"))
    expect(parsed.state).toBe(path.join(runtimeRoot.path, "state", "buddy", "opencode"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot.path, "tmp", "buddy", "opencode"))
    expect(parsed.db).toBe(path.join(expectedData, "opencode.db"))
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

  test("defaults global Buddy config and OPENCODE config dir to ~/.buddy", async () => {
    await using runtimeRoot = await temporaryDirectory({ prefix: "buddy-runtime-root-" })
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
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
        [BUDDY_ENV.RUNTIME_ROOT]: runtimeRoot.path,
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [BUDDY_ENV.GLOBAL_CONFIG_DIR]: "",
        [OPENCODE_ENV.CONFIG_DIR]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    const expected = path.join(testHome.path, ".buddy")
    expect(parsed.buddyGlobalConfigDir).toBe(expected)
    expect(parsed.opencodeConfigDir).toBe(expected)
  })

  test("sets OPENCODE_DB without setting OPENCODE_DISABLE_CHANNEL_DB by default", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [XDG_ENV.DATA_HOME]: path.join(xdgRoot.path, "data"),
        [XDG_ENV.CACHE_HOME]: path.join(xdgRoot.path, "cache"),
        [XDG_ENV.CONFIG_HOME]: path.join(xdgRoot.path, "config"),
        [XDG_ENV.STATE_HOME]: path.join(xdgRoot.path, "state"),
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
        [XDG_ENV.DATA_HOME]: path.join(TEST_SANDBOX.originalHome, ".local", "share"),
        [XDG_ENV.CACHE_HOME]: path.join(TEST_SANDBOX.originalHome, ".cache"),
        [XDG_ENV.STATE_HOME]: path.join(TEST_SANDBOX.originalHome, ".local", "state"),
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
        [XDG_ENV.CACHE_HOME]: path.join(testRoot.path, "cache"),
        [XDG_ENV.DATA_HOME]: path.join(testRoot.path, "data"),
        [XDG_ENV.STATE_HOME]: path.join(testRoot.path, "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("outside isolated test roots")
  })

  test("enables OpenCode question tool support for Buddy web sessions by default", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-home-" })
    await using xdgRoot = await temporaryDirectory({ prefix: "buddy-xdg-" })
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
        [BUDDY_ENV.TEST_HOME]: testHome.path,
        [OPENCODE_ENV.CLIENT]: "",
        [OPENCODE_ENV.ENABLE_QUESTION_TOOL]: "",
        [XDG_ENV.DATA_HOME]: path.join(xdgRoot.path, "data"),
        [XDG_ENV.CACHE_HOME]: path.join(xdgRoot.path, "cache"),
        [XDG_ENV.CONFIG_HOME]: path.join(xdgRoot.path, "config"),
        [XDG_ENV.STATE_HOME]: path.join(xdgRoot.path, "state"),
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))

    expect(parsed.client).toBe("web")
    expect(parsed.questionTool).toBe("1")
  })
})
