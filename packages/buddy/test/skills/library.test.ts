import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  catalogPathCandidates,
  parseSkillCatalogDocument,
  reconcileWithdrawnLibrarySkills,
  resolveCatalogSkillState,
  resolveCatalogPathFromCandidates,
  skillCatalogPayloadBytes,
  listCatalogLibraryItems,
} from "../../src/learning/skill-management/service/library"
import type { InstalledSkillLockEntry } from "../../src/learning/skill-management/service/lock"
import {
  readInstalledSkillLock,
  writeInstalledSkillLock,
} from "../../src/learning/skill-management/service/lock"
import { managedLibraryRoot } from "../../src/learning/skill-management/service/paths"
import { BUDDY_ENV } from "../../src/storage/constants"
import { temporaryDirectory } from "../helpers/temporary-directory"
import { temporaryEnvironment } from "../helpers/temporary-environment"

const CATALOG_SHA = "a".repeat(64)
const SKILL_SIZE_BYTES = 100
const SKILL_FILE_COUNT = 1
const SCANNER_POLICY_VERSION = 1

function activeLockEntry(sha256: string): Extract<InstalledSkillLockEntry, { state: "active" }> {
  return {
    catalogId: "sample-skill",
    displayName: "Sample Skill",
    skillName: "sample-skill",
    source: {
      type: "github",
      repo: "example/skills",
      path: "skills/sample-skill",
      ref: "b".repeat(40),
    },
    integrity: {
      algorithm: "tree-sha256-v1",
      sha256,
      sizeBytes: SKILL_SIZE_BYTES,
      fileCount: SKILL_FILE_COUNT,
    },
    installedAt: "2026-06-29T00:00:00.000Z",
    scannerPolicyVersion: SCANNER_POLICY_VERSION,
    state: "active",
    installedPath: "/tmp/sample-skill",
  }
}

describe("skill catalog library", () => {
  test("serializes signed catalog payloads independently of source formatting", () => {
    const compact = '{"schemaVersion":1,"revision":4,"entries":[]}'
    const expanded = `{
      "schemaVersion": 1,
      "revision": 4,
      "entries": []
    }`

    const compactPayload = skillCatalogPayloadBytes(parseSkillCatalogDocument(JSON.parse(compact)))
    const expandedPayload = skillCatalogPayloadBytes(
      parseSkillCatalogDocument(JSON.parse(expanded)),
    )

    expect(compactPayload).toEqual(expandedPayload)
    expect(Buffer.from(compactPayload).toString("utf8")).toBe(
      `${JSON.stringify({ schemaVersion: 1, revision: 4, entries: [] }, null, 2)}\n`,
    )
  })

  test("resolves catalog candidates from source and bundled runtime entrypoints", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-skill-catalog-paths-" })
    const sourceModule = path.join(root.path, "source", "library.js")
    const runtimeIndex = path.join(root.path, "runtime", "index.js")
    const runtimeEntrypoint = path.join(root.path, "packaged", "index.js")

    const candidates = catalogPathCandidates({
      argv: ["node", runtimeIndex, "run", runtimeEntrypoint],
      moduleUrl: pathToFileURL(sourceModule).href,
    })

    expect(candidates).toEqual([
      path.join(root.path, "source", "catalog.json"),
      path.join(root.path, "runtime", "catalog.json"),
      path.join(root.path, "packaged", "catalog.json"),
    ])
  })

  test("resolves the catalog directly from a development backend source root", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-source-skill-catalog-paths-" })
    const sourceModule = path.join(root.path, "runtime", "library.js")
    const resourcesRoot = path.join(root.path, "packages", "buddy", "src")

    const candidates = catalogPathCandidates({
      argv: ["node"],
      moduleUrl: pathToFileURL(sourceModule).href,
      resourcesRoot,
    })

    expect(candidates).toEqual([
      path.join(resourcesRoot, "catalog.json"),
      path.join(resourcesRoot, "learning", "skill-management", "service", "catalog.json"),
      path.join(root.path, "runtime", "catalog.json"),
    ])
  })

  test("skips missing catalog candidates until a readable asset exists", async () => {
    await using root = await temporaryDirectory({ prefix: "buddy-skill-catalog-resolve-" })
    const missingCatalog = path.join(root.path, "missing", "catalog.json")
    const existingCatalog = path.join(root.path, "runtime", "catalog.json")

    mkdirSync(path.dirname(existingCatalog), { recursive: true })
    writeFileSync(existingCatalog, "{}\n", "utf8")

    await expect(resolveCatalogPathFromCandidates([missingCatalog, existingCatalog])).resolves.toBe(
      existingCatalog,
    )
  })

  test("reports an update when the installed and catalog hashes differ", () => {
    const entry = {
      status: "approved" as const,
      integrity: {
        algorithm: "tree-sha256-v1" as const,
        sha256: CATALOG_SHA,
        sizeBytes: SKILL_SIZE_BYTES,
        fileCount: SKILL_FILE_COUNT,
      },
    }

    expect(resolveCatalogSkillState({ entry, lockEntry: activeLockEntry(CATALOG_SHA) })).toBe(
      "installed",
    )
    expect(
      resolveCatalogSkillState({
        entry: {
          ...entry,
          integrity: {
            ...entry.integrity,
            sha256: CATALOG_SHA.toUpperCase(),
          },
        },
        lockEntry: activeLockEntry(CATALOG_SHA),
      }),
    ).toBe("installed")
    expect(resolveCatalogSkillState({ entry, lockEntry: activeLockEntry("c".repeat(64)) })).toBe(
      "update_available",
    )
  })

  test("exposes catalog icons through a content-addressed Buddy endpoint", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-skill-icon-view-" })
    using environment = temporaryEnvironment({ [BUDDY_ENV.TEST_HOME]: testHome.path })
    void environment
    const iconSha256 = "d".repeat(64)
    const catalog = parseSkillCatalogDocument({
      schemaVersion: 1,
      revision: 5,
      entries: [
        {
          id: "sample-skill",
          displayName: "Sample Skill",
          icon: {
            filename: `buddy-skill-sample-skill-${iconSha256.slice(0, 16)}.webp`,
            sha256: iconSha256,
          },
          summary: "Sample skill with a release-hosted icon.",
          categories: ["test"],
          tags: ["test"],
          source: {
            type: "github",
            repo: "example/skills",
            path: "skills/sample",
            ref: "e".repeat(40),
          },
          integrity: {
            algorithm: "tree-sha256-v1",
            sha256: CATALOG_SHA,
            sizeBytes: SKILL_SIZE_BYTES,
            fileCount: SKILL_FILE_COUNT,
          },
          review: {
            approvedAt: "2026-07-31T00:00:00.000Z",
            policyVersion: 1,
          },
          status: "approved",
        },
      ],
    })

    const items = await listCatalogLibraryItems(catalog)
    expect(items[0]?.icon).toBe(`/api/skills/library/sample-skill/icon?sha256=${iconSha256}`)
  })

  test("denies and moves installed skills withdrawn by a catalog revision", async () => {
    await using testHome = await temporaryDirectory({ prefix: "buddy-skill-withdrawal-" })
    using environment = temporaryEnvironment({ [BUDDY_ENV.TEST_HOME]: testHome.path })
    void environment
    const installedPath = path.join(managedLibraryRoot(), "sample-skill")
    const lockEntry = activeLockEntry(CATALOG_SHA)
    const denied: string[] = []
    let refreshAttempts = 0

    await fsp.mkdir(installedPath, { recursive: true })
    await fsp.writeFile(path.join(installedPath, "SKILL.md"), "withdraw me\n", "utf8")
    await writeInstalledSkillLock({
      schemaVersion: 1,
      installed: {
        "sample-skill": {
          ...lockEntry,
          installedPath,
        },
      },
    })
    const catalog = parseSkillCatalogDocument({
      schemaVersion: 1,
      revision: 2,
      entries: [
        {
          id: "sample-skill",
          displayName: "Sample Skill",
          summary: "A withdrawn sample skill.",
          categories: ["test"],
          tags: ["test"],
          source: lockEntry.source,
          integrity: lockEntry.integrity,
          review: {
            approvedAt: "2026-07-11T00:00:00.000Z",
            policyVersion: 1,
          },
          status: "withdrawn",
        },
      ],
    })

    await expect(
      reconcileWithdrawnLibrarySkills(catalog, {
        setSkillPermission: async (name, action) => {
          denied.push(`${name}:${action}`)
        },
        refreshSkillRuntime: async () => {
          refreshAttempts += 1
          throw new Error("runtime refresh failed")
        },
      }),
    ).rejects.toThrow("runtime refresh failed")

    expect(denied).toEqual(["sample-skill:deny"])
    const failedLock = await readInstalledSkillLock()
    const withdrawn = failedLock.installed["sample-skill"]
    expect(withdrawn?.state).toBe("withdrawn")
    if (withdrawn?.state !== "withdrawn") {
      throw new Error("Expected a withdrawn lock entry")
    }
    expect(withdrawn.runtimeRefreshPending).toBe(true)
    expect(await fsp.stat(withdrawn.withdrawnPath).then((stat) => stat.isDirectory())).toBe(true)
    await expect(fsp.stat(installedPath)).rejects.toThrow()

    denied.length = 0
    await reconcileWithdrawnLibrarySkills(catalog, {
      setSkillPermission: async (name, action) => {
        denied.push(`${name}:${action}`)
      },
      refreshSkillRuntime: async () => {
        refreshAttempts += 1
      },
    })
    expect(denied).toEqual([])
    expect(refreshAttempts).toBe(2)
    const reconciledLock = await readInstalledSkillLock()
    const reconciled = reconciledLock.installed["sample-skill"]
    expect(reconciled?.state).toBe("withdrawn")
    if (reconciled?.state !== "withdrawn") {
      throw new Error("Expected a withdrawn lock entry")
    }
    expect(reconciled.runtimeRefreshPending).toBe(false)

    denied.length = 0
    await reconcileWithdrawnLibrarySkills(catalog, {
      setSkillPermission: async (name, action) => {
        denied.push(`${name}:${action}`)
      },
      refreshSkillRuntime: async () => {
        refreshAttempts += 1
      },
    })
    expect(denied).toEqual([])
    expect(refreshAttempts).toBe(2)

    const cleared: string[] = []
    denied.length = 0
    await reconcileWithdrawnLibrarySkills(catalog, {
      clearSkillPermission: async (name) => {
        cleared.push(name)
      },
      setSkillPermission: async (name, action) => {
        denied.push(`${name}:${action}`)
      },
      systemSkillNames: ["sample-skill"],
    })
    expect(cleared).toEqual(["sample-skill"])
    expect(denied).toEqual([])

    cleared.length = 0
    await reconcileWithdrawnLibrarySkills(catalog, {
      clearSkillPermission: async (name) => {
        cleared.push(name)
      },
      systemSkillNames: ["sample-skill"],
    })
    expect(cleared).toEqual([])
  })
})
