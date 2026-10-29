import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { Database } from "#sqlite"
import { BUDDY_ENV, BUDDY_OPENCODE_DB_FILENAME } from "../../src/storage/constants"
import { parseJsonText, requireJsonObject, requireString } from "../helpers/parse"
import { temporaryDirectory } from "../helpers/temporary-directory"

test("packaged Beta bootstraps only sandbox roots and preserves Stable files", async () => {
  await using root = await temporaryDirectory({ prefix: "buddy-beta-sandbox-" })
  const home = path.join(root.path, "os-home")
  const userData = path.join(root.path, "Buddy Beta")
  const documents = path.join(root.path, "redirected-documents")
  const stableData = path.join(home, ".local", "share", "buddy")
  const stableTmp = path.join(root.path, "stable-temp")
  const stableRuntimeData = path.join(stableData, "opencode")
  const stableDatabases = [
    path.join(stableRuntimeData, "opencode-v2.db"),
    path.join(stableRuntimeData, "opencode.db"),
  ]
  await fs.mkdir(stableRuntimeData, { recursive: true })
  for (const filename of stableDatabases) {
    const database = new Database(filename)
    try {
      database.exec("CREATE TABLE stable_chats (message TEXT NOT NULL)")
      database.prepare("INSERT INTO stable_chats VALUES (?)").run("Stable chat survives")
    } finally {
      database.close()
    }
  }
  const stableFiles = new Map([
    [
      path.join(stableRuntimeData, "auth.json"),
      Buffer.from('{"stable":{"type":"api","key":"sandbox-stable-key"}}\n'),
    ],
    [
      path.join(stableData, "secrets.json"),
      Buffer.from('{"version":1,"secrets":{"sec_stable":"sandbox-stable-secret"}}\n'),
    ],
    [
      path.join(stableTmp, "buddy", "opencode", "bench-captures", "stable.png"),
      Buffer.from("Stable capture survives"),
    ],
    [
      path.join(home, ".opencode", "opencode.json"),
      Buffer.from('{"model":"stable/user-model"}\n'),
    ],
  ])
  for (const [filename, bytes] of stableFiles) {
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, bytes)
  }
  for (const filename of stableDatabases) {
    stableFiles.set(filename, await fs.readFile(filename))
  }

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
    [BUDDY_ENV.RELEASE_REPO]: "prashantbhudwal/buddy-releases",
  }
  for (const directory of [notebookHome, xdg("tmp"), xdg("state", "buddy")]) {
    await fs.mkdir(directory, { recursive: true })
  }
  const betaCaptureRoot = path.join(userData, "xdg", "tmp", "buddy", "opencode", "bench-captures")
  const staleBetaCapture = path.join(betaCaptureRoot, "stale.png")
  await fs.mkdir(betaCaptureRoot, { recursive: true })
  await fs.writeFile(staleBetaCapture, "Beta's old capture should be removed")

  const ambientEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^(?:BUDDY_|OPENCODE_|XDG_)/u.test(entry[0].toUpperCase()),
    ),
  )
  const strippedKeys = new Set<string>([
    BUDDY_ENV.TEST_HOME,
    BUDDY_ENV.TEST_XDG_ROOT,
    BUDDY_ENV.RUNTIME_ROOT,
    "OPENCODE_TEST_HOME",
    "OPENCODE_AUTH_CONTENT",
  ])
  const inheritedEnvironment = {
    ...ambientEnvironment,
    HOME: home,
    USERPROFILE: home,
    NODE_ENV: "production",
    TMPDIR: stableTmp,
    TMP: stableTmp,
    TEMP: stableTmp,
    [BUDDY_ENV.DATA_DIR]: stableData,
    [BUDDY_ENV.TEST_HOME]: path.join(root.path, "inherited-stable-home"),
    [BUDDY_ENV.RUNTIME_ROOT]: path.join(root.path, "inherited-stable-runtime"),
    OPENCODE_TEST_HOME: path.join(root.path, "inherited-opencode-home"),
    OPENCODE_AUTH_CONTENT: '{"stable":{"type":"api","key":"sandbox-inherited-key"}}',
  }
  const environment = Object.fromEntries(
    Object.entries({ ...inheritedEnvironment, ...betaEnvironment })
      .filter(([key]) => !strippedKeys.has(key)),
  )
  const runtimeModule = path.resolve(import.meta.dir, "../../src/runtime/runtime-paths.ts")
  const globalModule = path.resolve(import.meta.dir, "../../src/storage/global.ts")
  const skillsModule = path.resolve(
    import.meta.dir,
    "../../src/learning/skill-management/service/paths.ts",
  )
  const secretsModule = path.resolve(import.meta.dir, "../../src/config/secrets/secret-store.ts")
  const capturesModule = path.resolve(import.meta.dir, "../../src/learning/features/bench/captures.ts")
  const script = `
    const assert = (await import("node:assert/strict")).default;
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const runtime = await import(${JSON.stringify(runtimeModule)});
    const { Global } = await import(${JSON.stringify(globalModule)});
    const skills = await import(${JSON.stringify(skillsModule)});
    const secrets = await import(${JSON.stringify(secretsModule)});
    const captures = await import(${JSON.stringify(capturesModule)});
    const plan = runtime.resolveOpenCodeEnvironmentPlan({
      environment: process.env, homeDirectory: os.homedir(),
      temporaryDirectory: os.tmpdir(), workingDirectory: process.cwd(),
    });
    const mutablePaths = (paths) => Object.fromEntries(
      Object.entries(paths).filter(([name]) => name !== "home"));
    const roots = {
      buddy: mutablePaths(Global.Path),
      runtime: runtime.openCodeRuntimePaths(),
      xdg: plan.xdg,
      buddyPlan: plan.buddy,
      defaults: plan.defaults,
      plan: plan.openCode,
      storage: {
        secretStore: path.join(Global.Path.data, "secrets.json"),
        skillCache: skills.OPENCODE_SKILL_CACHE_ROOT,
        managedHome: skills.buddyHomeRoot(),
        benchCaptures: path.join(runtime.BUDDY_TMP_DIR, "bench-captures"),
        tmp: os.tmpdir(),
      },
    };
    for (const [group, paths] of Object.entries(roots)) {
      for (const [name, directory] of Object.entries(paths)) {
        const relative = path.relative(${JSON.stringify(userData)}, directory);
        assert.ok(relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative),
          group + "." + name + " escaped the Beta sandbox: " + directory);
      }
    }
    const initialSecrets = await secrets.readSecrets();
    const secretID = await secrets.storeSecret("sandbox-beta-secret");
    await skills.ensureManagedSkillPathReady();
    await captures.initializeBenchCaptureStorage();
    const capture = await captures.writeTemporaryBenchCapture({
      sessionID: "beta-session", messageID: "beta-turn",
      pngBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    });
    console.log(JSON.stringify({ roots, initialSecrets, secretID, capture,
      home: Global.Path.home,
      storedSecrets: await secrets.readSecrets(),
      captureBytes: (await fs.readFile(capture)).toString("base64"),
    }));
  `
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(import.meta.dir, "../../../opencode-adapter"),
    env: environment,
    encoding: "utf8",
    timeout: 30_000,
  })
  expect(result.stderr).toBe("")
  expect(result.status).toBe(0)
  const parsed = requireJsonObject(parseJsonText(result.stdout.trim()))
  const roots = requireJsonObject(parsed.roots)
  const expectedBuddy = {
    data: path.join(userData, "xdg", "data", "buddy"),
    cache: path.join(userData, "xdg", "cache", "buddy"),
    config: path.join(userData, "xdg", "config", "buddy"),
    state: path.join(userData, "xdg", "state", "buddy"),
    log: path.join(userData, "xdg", "data", "buddy", "log"),
    bin: path.join(userData, "xdg", "data", "buddy", "bin"),
  }
  const expectedRuntime = {
    data: path.join(userData, "xdg", "data", "buddy", "opencode"),
    cache: path.join(userData, "xdg", "cache", "buddy", "opencode"),
    config: path.join(userData, "xdg", "config", "buddy"),
    state: path.join(userData, "xdg", "state", "buddy", "opencode"),
    tmp: path.join(userData, "xdg", "tmp", "buddy", "opencode"),
    database: path.join(userData, "xdg", "data", "buddy", "opencode", "opencode-v2.db"),
    v1Database: path.join(userData, "xdg", "data", "buddy", "opencode", "opencode.db"),
  }
  expect(parsed.home).toBe(home)
  expect(roots.buddy).toEqual(expectedBuddy)
  expect(roots.runtime).toEqual(expectedRuntime)
  expect(roots.plan).toEqual(expectedRuntime)
  const secretStore = path.join(expectedBuddy.data, "secrets.json")
  expect(roots.storage).toEqual({
    secretStore,
    skillCache: path.join(userData, "xdg", "cache", "buddy", "opencode", "skills"),
    managedHome: expectedBuddy.config,
    benchCaptures: betaCaptureRoot,
    tmp: path.join(userData, "xdg", "tmp"),
  })
  expect(parsed.initialSecrets).toEqual({})
  const expectedSecrets = { [requireString(parsed.secretID)]: "sandbox-beta-secret" }
  expect(parsed.storedSecrets).toEqual(expectedSecrets)
  expect(parseJsonText(await fs.readFile(secretStore, "utf8"))).toEqual({
    version: 1,
    secrets: expectedSecrets,
  })
  if (process.platform !== "win32") {
    expect((await fs.stat(secretStore)).mode & 0o777).toBe(0o600)
  }
  expect(path.dirname(requireString(parsed.capture))).toBe(path.join(betaCaptureRoot, "beta-turn"))
  expect(parsed.captureBytes).toBe(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  )
  expect(await Bun.file(staleBetaCapture).exists()).toBe(false)
  expect((await fs.stat(path.join(expectedBuddy.config, "skills", "custom"))).isDirectory()).toBe(true)
  for (const [filename, bytes] of stableFiles) {
    expect(await fs.readFile(filename)).toEqual(bytes)
  }
})
