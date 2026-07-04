import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { configureOpenCodeEnvironment } from "../src/opencode-runtime"
import { BUDDY_ENV, OPENCODE_ENV, XDG_ENV } from "../src/storage/constants"

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
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      config: string
      state: string
      tmp: string
    }

    expect(parsed.data).toBe(path.join(runtimeRoot, "data"))
    expect(parsed.cache).toBe(path.join(runtimeRoot, "cache"))
    expect(parsed.config).toBe(path.join(runtimeRoot, "config"))
    expect(parsed.state).toBe(path.join(runtimeRoot, "state"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot, "tmp"))
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

    const parsed = JSON.parse(result.stdout.trim()) as {
      config: string
      tmp: string
    }

    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.tmp).toBe(path.join(runtimeRoot, "tmp"))
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

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      config: string
      state: string
      tmp: string
    }

    expect(parsed.data).toBe(xdg.data)
    expect(parsed.cache).toBe(xdg.cache)
    expect(parsed.config).toBe(xdg.config)
    expect(parsed.state).toBe(xdg.state)
    expect(parsed.tmp).toBe(path.join(os.tmpdir(), "buddy"))
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

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      state: string
    }

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

    const parsed = JSON.parse(result.stdout.trim()) as {
      data: string
      cache: string
      config: string
      state: string
    }

    expect(parsed.data).toBe(path.join(xdg.data, "buddy"))
    expect(parsed.cache).toBe(path.join(xdg.cache, "buddy"))
    expect(parsed.config).toBe(path.join(testHome, ".buddy"))
    expect(parsed.state).toBe(path.join(xdg.state, "buddy"))
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

    const parsed = JSON.parse(result.stdout.trim()) as {
      buddyGlobalConfigDir: string
      opencodeConfigDir: string
    }

    const expected = path.join(testHome, ".buddy")
    expect(parsed.buddyGlobalConfigDir).toBe(expected)
    expect(parsed.opencodeConfigDir).toBe(expected)
  })

  test("does not set OPENCODE_DISABLE_CHANNEL_DB by default", () => {
    const testHome = mkdtempSync(path.join(os.tmpdir(), "buddy-home-"))
    const modulePath = path.resolve(import.meta.dir, "../src/opencode-runtime/env.ts")

    const script = `
      delete process.env.OPENCODE_DISABLE_CHANNEL_DB;
      const mod = await import(${JSON.stringify(modulePath)});
      mod.configureOpenCodeEnvironment();
      console.log(JSON.stringify({
        hasChannelDbDisable: Object.hasOwn(process.env, "OPENCODE_DISABLE_CHANNEL_DB")
      }));
    `

    const result = spawnSync(bunExecutable, ["-e", script], {
      env: childEnv({
        [BUDDY_ENV.TEST_HOME]: testHome,
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      hasChannelDbDisable: boolean
    }

    expect(parsed.hasChannelDbDisable).toBe(false)
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
        [OPENCODE_ENV.CLIENT]: "",
        [OPENCODE_ENV.ENABLE_QUESTION_TOOL]: "",
      }),
      encoding: "utf8",
    })

    expect(result.status).toBe(0)

    const parsed = JSON.parse(result.stdout.trim()) as {
      client: string
      questionTool: string
    }

    expect(parsed.client).toBe("web")
    expect(parsed.questionTool).toBe("1")
  })
})
