import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { loadConfigFile, loadConfigText } from "../../src/config/contract/document"
import {
  CONFIG_SECRET_REDACTED,
  preserveConfigSecrets,
  projectWebSafeConfig,
} from "../../src/config/contract/web-safe"
import {
  deleteSecrets,
  readSecrets,
  secretReference,
  storeSecret,
} from "../../src/config/secrets/secret-store"
import { Global } from "../../src/storage/global"
import { buildNotebookRuntimePlan } from "../../src/config/runtime/notebook-runtime-plan"
import { deleteUnusedMcpSecrets, projectMcpSettingsConfig } from "../../src/config/secrets/mcp-secrets"
import { resolveGlobalConfigFile } from "../../src/config/store/config-paths"
import { updateProjectConfig } from "../../src/config/store/write-config"
import { listOpenProjects, setOpenProjectRegistryEntries } from "../../src/project/open-project-registry"
import { InvalidError } from "../../src/config/contract/errors"
import { Config } from "../../src/config/config"
import { patchProjectConfig } from "../../src/config/orchestration/project-config-service"
import { syncNotebookRuntimeConfig } from "../../src/config/runtime/opencode-sync"
import { resetSkillCatalogStoreForTests } from "../../src/learning/skill-management/service/library"
import { readInstalledSkillLock, writeInstalledSkillLock } from "../../src/learning/skill-management/service/lock"
import { installedSkillLockPath, managedLibraryRoot } from "../../src/learning/skill-management/service/paths"
import { closeAgentRuntime, getAgentRuntime } from "../../src/runtime/agent-runtime"
import { BUDDY_ENV } from "../../src/storage/constants"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"

const storePath = path.join(Global.Path.data, "secrets.json")

beforeEach(async () => {
  await fs.rm(storePath, { force: true })
})

afterEach(async () => {
  await fs.rm(storePath, { force: true })
})

describe("config secret store", () => {
  test.each(["duplicate keys", "invalid schema"])("cleanup retains secrets and warns when global config has %s", async (invalidity) => {
    const id = await storeSecret("still-needed-credential")
    const globalFile = resolveGlobalConfigFile()
    const previousGlobal = await fs.readFile(globalFile, "utf8").catch((error) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    const server = { type: "remote", url: "https://example.test/mcp", enabled: false, headers: { Authorization: secretReference(id) } }
    const before = JSON.stringify({ mcp: { removed: server } })
    const directory = await fs.mkdtemp(path.join(Global.Path.data, "invalid-cleanup-"))
    const filepath = path.join(directory, "buddy.jsonc")
    await fs.writeFile(filepath, "{}")
    await fs.mkdir(path.dirname(globalFile), { recursive: true })
    const invalid = invalidity === "duplicate keys"
      ? `{"mcp":${JSON.stringify({ kept: server })},"mcp":{}}`
      : '{"mcp":{"bad":{"type":"remote","url":42}}}'
    await fs.writeFile(globalFile, invalid)
    const warnings = spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await expect(loadConfigFile(globalFile, { resolveSubstitutions: false })).rejects.toBeInstanceOf(InvalidError)
      await deleteUnusedMcpSecrets({ filepath, before })
      expect((await readSecrets())[id]).toBe("still-needed-credential")
      expect(warnings.mock.calls.some((call) => call[0] === "Failed to clean up unused MCP secrets after saving config")).toBe(true)
    } finally {
      warnings.mockRestore()
      if (previousGlobal === undefined) await fs.rm(globalFile, { force: true })
      else await fs.writeFile(globalFile, previousGlobal)
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("a queued save keeps its missing reference, flags the server, and omits it from OpenCode", async () => {
    const id = await storeSecret("concurrent-credential")
    const before = JSON.stringify({ mcp: { removed: { type: "remote", url: "https://example.test/mcp", enabled: false, headers: { Authorization: secretReference(id) } } } })
    const directory = await fs.mkdtemp(path.join(Global.Path.data, "concurrent-cleanup-"))
    const savedFile = path.join(directory, "saved.jsonc")
    await fs.writeFile(savedFile, "{}")
    const notebookB = path.join(directory, "b")
    const notebookC = path.join(directory, "c")
    for (const notebook of [notebookB, notebookC]) {
      await fs.mkdir(path.join(notebook, ".buddy"), { recursive: true })
      await fs.writeFile(path.join(notebook, ".buddy", "buddy.jsonc"), "{}")
    }
    const previousRegistry = await listOpenProjects()
    await fs.writeFile(path.join(Global.Path.state, "desktop-notebooks.json"), JSON.stringify([notebookB, notebookC]))
    const blockedFile = await fs.realpath(path.join(notebookC, ".buddy", "buddy.jsonc"))
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const readFile = fs.readFile.bind(fs)
    type TReadPath = Parameters<typeof fs.readFile>[0]
    type TReadOptions = Parameters<typeof fs.readFile>[1]
    type TReadObjectOptions = Exclude<TReadOptions, string | null | undefined>
    function pausedReadFile(filepath: TReadPath, options?: (TReadObjectOptions & { encoding?: null }) | null): Promise<Buffer<ArrayBuffer>>
    function pausedReadFile(filepath: TReadPath, options: BufferEncoding | (TReadObjectOptions & { encoding: BufferEncoding })): Promise<string>
    function pausedReadFile(filepath: TReadPath, options?: TReadOptions): ReturnType<typeof fs.readFile>
    async function pausedReadFile(filepath: TReadPath, options?: TReadOptions) {
      if (filepath === blockedFile) {
        entered.resolve()
        await release.promise
      }
      return readFile(filepath, options)
    }
    const reads = spyOn(fs, "readFile").mockImplementation(pausedReadFile)
    const cleanup = deleteUnusedMcpSecrets({ filepath: savedFile, before })
    let addition: Promise<void> | undefined
    try {
      await entered.promise
      addition = updateProjectConfig(notebookB, { mcp: { shared: { type: "remote", url: "https://example.test/mcp", enabled: false, headers: { Authorization: secretReference(id) } } } })
      release.resolve()
      await Promise.all([cleanup, addition])
      const savedNotebook = path.join(notebookB, ".buddy", "buddy.jsonc")
      expect(await fs.readFile(savedNotebook, "utf8")).toContain(secretReference(id))
      expect(await readSecrets()).not.toHaveProperty(id)
      const raw = await loadConfigFile(savedNotebook, { resolveSubstitutions: false })
      expect(await projectMcpSettingsConfig(raw)).toMatchObject({ mcp: { shared: { missingSecret: true } } })
      const config = await loadConfigFile(savedNotebook)
      expect((await buildNotebookRuntimePlan({ config, directory: notebookB })).mcp).toEqual([])
    } finally {
      release.resolve()
      await Promise.allSettled([cleanup, addition])
      reads.mockRestore()
      await setOpenProjectRegistryEntries(previousRegistry.directories)
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  test("a notebook save finishes while a withdrawn library skill's clean-up writes its global permission", async () => {
    await getAgentRuntime()
    await using runtime = { [Symbol.asyncDispose]: closeAgentRuntime }
    void runtime
    await using resources = await temporaryDirectory({ prefix: "withdrawn-skill-catalog-" })
    using environment = temporaryEnvironment({ [BUDDY_ENV.BACKEND_RESOURCES_DIR]: resources.path })
    void environment
    const catalogId = "withdrawn-sample"
    const source = { type: "github", repo: "example/skills", path: `skills/${catalogId}`, ref: "b".repeat(40) } as const
    const integrity = { algorithm: "tree-sha256-v1", sha256: "a".repeat(64), sizeBytes: 100, fileCount: 1 } as const
    await fs.writeFile(path.join(resources.path, "catalog.json"), JSON.stringify({ schemaVersion: 1, revision: 2, entries: [{
      id: catalogId, displayName: "Withdrawn Sample", summary: "A withdrawn sample skill.", categories: ["test"], tags: ["test"],
      source, integrity, review: { approvedAt: "2026-07-11T00:00:00.000Z", policyVersion: 1 }, status: "withdrawn",
    }] }))
    resetSkillCatalogStoreForTests()
    const installedPath = path.join(managedLibraryRoot(), catalogId)
    await fs.mkdir(installedPath, { recursive: true })
    await fs.writeFile(path.join(installedPath, "SKILL.md"), "withdraw me\n")
    await writeInstalledSkillLock({ schemaVersion: 1, installed: { [catalogId]: {
      catalogId, displayName: "Withdrawn Sample", skillName: catalogId, source, integrity,
      installedAt: "2026-06-29T00:00:00.000Z", scannerPolicyVersion: 1, state: "active", installedPath,
    } } })
    const globalFile = resolveGlobalConfigFile()
    const previousGlobal = await fs.readFile(globalFile, "utf8").catch((error) => {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
      throw error
    })
    const directory = await fs.realpath(await fs.mkdtemp(path.join(Global.Path.data, "withdrawn-skill-save-")))
    const notebookA = path.join(directory, "a")
    const notebookB = path.join(directory, "b")
    for (const notebook of [notebookA, notebookB]) {
      await fs.mkdir(path.join(notebook, ".buddy"), { recursive: true })
      await fs.writeFile(path.join(notebook, ".buddy", "buddy.jsonc"), "{}")
    }
    const savedFile = path.join(notebookB, ".buddy", "buddy.jsonc")
    const moving = Promise.withResolvers<void>()
    const releaseMove = Promise.withResolvers<void>()
    const saved = Promise.withResolvers<void>()
    const rename = fs.rename.bind(fs)
    const writeFile = fs.writeFile.bind(fs)
    const renames = spyOn(fs, "rename").mockImplementation(async (from, to) => {
      if (from === installedPath) {
        moving.resolve()
        await releaseMove.promise
      }
      return rename(from, to)
    })
    const writes = spyOn(fs, "writeFile").mockImplementation(async (file, data, options) => {
      await writeFile(file, data, options)
      if (file === savedFile) saved.resolve()
    })
    try {
      const sync = syncNotebookRuntimeConfig(notebookA)
      await moving.promise
      const save = patchProjectConfig({ directory: notebookB, payload: { mcp: { docs: { type: "remote", url: "https://example.test/mcp", enabled: false } } } })
      await Promise.race([saved.promise, save])
      releaseMove.resolve()
      const outcome = await Promise.race([Promise.all([sync, save]).then(() => "finished"), Bun.sleep(10_000).then(() => "deadlocked")])
      expect(outcome).toBe("finished")
      expect((await readInstalledSkillLock()).installed[catalogId]).toMatchObject({ state: "withdrawn", permissionDisposition: "denied" })
      expect((await Config.getGlobal()).permission).toMatchObject({ skill: { [catalogId]: "deny" } })
      expect(await fs.readFile(savedFile, "utf8")).toContain("https://example.test/mcp")
    } finally {
      releaseMove.resolve()
      renames.mockRestore()
      writes.mockRestore()
      resetSkillCatalogStoreForTests()
      const lock = await readInstalledSkillLock()
      const entry = lock.installed[catalogId]
      if (entry?.state === "withdrawn") await fs.rm(entry.withdrawnPath, { recursive: true, force: true })
      await fs.rm(installedPath, { recursive: true, force: true })
      await fs.rm(installedSkillLockPath(), { force: true })
      if (previousGlobal === undefined) await fs.rm(globalFile, { force: true })
      else await fs.writeFile(globalFile, previousGlobal)
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 30_000)

  test("stores and deletes a secret in an owner-only file", async () => {
    expect(await readSecrets()).toEqual({})

    const id = await storeSecret("test-client-secret")

    expect(id).toMatch(/^sec_[a-f0-9]{32}$/)
    expect(await readSecrets()).toEqual({ [id]: "test-client-secret" })
    if (process.platform !== "win32") {
      expect((await fs.stat(storePath)).mode & 0o777).toBe(0o600)
    }

    await deleteSecrets([id])

    expect(await readSecrets()).toEqual({})
    if (process.platform !== "win32") {
      expect((await fs.stat(storePath)).mode & 0o777).toBe(0o600)
    }
  })

  test.each(["test-client-secret", '  quoted "secret" with \\ and\na newline  '])(
    "resolves stored client secrets and disables the server after deletion: %s",
    async (value) => {
      const id = await storeSecret(value)
      const text = JSON.stringify({
        mcp: {
          s: {
            type: "remote",
            url: "https://mcp.example.test",
            oauth: { clientSecret: secretReference(id) },
          },
        },
      })
      const options = { path: path.join(Global.Path.data, "notebook", ".buddy", "buddy.jsonc") }

      expect(await loadConfigText(text, options)).toMatchObject({
        mcp: { s: { oauth: { clientSecret: value } } },
      })

      await deleteSecrets([id])

      const missing = await loadConfigText(text, options)
      expect(missing).toMatchObject({ mcp: { s: { oauth: { clientSecret: secretReference(id) } } } })
      expect((await buildNotebookRuntimePlan({ config: missing, directory: Global.Path.data })).mcp).toEqual([])
    },
  )

  test("omits a server with a missing header secret from the OpenCode plan", async () => {
    const config = await loadConfigText(JSON.stringify({ mcp: {
      missing: { type: "remote", url: "https://mcp.example.test", headers: { Authorization: "Bearer {secret:sec_other_machine}" } },
      ready: { type: "remote", url: "https://ready.example.test" },
    } }), { path: path.join(Global.Path.data, "notebook", ".buddy", "buddy.jsonc") })

    expect(config.mcp?.missing).toMatchObject({ headers: { Authorization: "Bearer {secret:sec_other_machine}" } })
    const plan = await buildNotebookRuntimePlan({ config, directory: Global.Path.data })
    expect(plan.mcp.map((server) => server.name)).toEqual(["ready"])
    expect(JSON.stringify(config)).not.toContain('"Authorization":""')
    expect(JSON.stringify(plan)).not.toContain("Authorization")
  })

  test("loads config with a corrupt store and preserves the broken bytes before the next write", async () => {
    const broken = '{"version":1,"secrets":broken'
    await fs.mkdir(path.dirname(storePath), { recursive: true })
    await fs.writeFile(storePath, broken)
    const config = await loadConfigText(JSON.stringify({ mcp: {
      missing: { type: "remote", url: "https://mcp.example.test", headers: { Authorization: "{secret:sec_elsewhere}" } },
    } }), { path: path.join(Global.Path.data, "notebook", ".buddy", "buddy.jsonc") })

    expect(config.mcp?.missing).toMatchObject({ headers: { Authorization: "{secret:sec_elsewhere}" } })
    expect((await buildNotebookRuntimePlan({ config, directory: Global.Path.data })).mcp).toEqual([])
    expect(await projectMcpSettingsConfig({ mcp: {
      missing: { type: "remote", url: "https://mcp.example.test", headers: { Authorization: "{secret:sec_elsewhere}" } },
    } })).toMatchObject({ mcp: { missing: { missingSecret: true } } })
    expect(await readSecrets()).toEqual({})
    expect(await fs.readFile(storePath, "utf8")).toBe(broken)
    const before = new Set(await fs.readdir(Global.Path.data))
    const id = await storeSecret("reentered-secret")
    const backups = (await fs.readdir(Global.Path.data)).filter((name) => !before.has(name) && /^secrets\.json\.broken-\d+$/u.test(name))
    expect(backups).toHaveLength(1)
    expect(await fs.readFile(path.join(Global.Path.data, backups[0]), "utf8")).toBe(broken)
    expect(await readSecrets()).toEqual({ [id]: "reentered-secret" })
    await fs.rm(path.join(Global.Path.data, backups[0]))
  })

  test("recovering a corrupt store never overwrites an existing timestamped backup", async () => {
    const backupPath = `${storePath}.broken-1700000000000`
    const collisionPath = `${backupPath}-1`
    const broken = '{"unrecoverable":'
    await fs.mkdir(path.dirname(storePath), { recursive: true })
    await fs.writeFile(backupPath, "earlier recoverable credentials")
    await fs.writeFile(collisionPath, "another earlier backup")
    await fs.writeFile(storePath, broken)
    const before = new Set(await fs.readdir(Global.Path.data))
    const clock = spyOn(Date, "now").mockReturnValue(1700000000000)
    try {
      const id = await storeSecret("new-credential")
      expect(await fs.readFile(backupPath, "utf8")).toBe("earlier recoverable credentials")
      expect(await fs.readFile(collisionPath, "utf8")).toBe("another earlier backup")
      const added = (await fs.readdir(Global.Path.data)).filter((name) => !before.has(name) && name.startsWith(path.basename(backupPath)))
      expect(added).toHaveLength(1)
      expect(await fs.readFile(path.join(Global.Path.data, added[0]), "utf8")).toBe(broken)
      expect(await readSecrets()).toEqual({ [id]: "new-credential" })
    } finally {
      clock.mockRestore()
      for (const name of await fs.readdir(Global.Path.data)) {
        if (name.startsWith(path.basename(backupPath))) await fs.rm(path.join(Global.Path.data, name))
      }
    }
  })

  test("redacts secret references for the web and preserves their raw value on updates", () => {
    const config = { mcp: { s: { oauth: { clientSecret: "{secret:sec_x}" } } } }
    const projected = projectWebSafeConfig(config)

    expect(projected).toEqual({
      mcp: { s: { oauth: { clientSecret: CONFIG_SECRET_REDACTED } } },
    })
    expect(preserveConfigSecrets(projected, config)).toEqual(config)
  })
})
