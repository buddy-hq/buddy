import { describe, expect, test } from "bun:test"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SkillCatalogEntry } from "../../src/learning/skill-management/service/library"
import {
  readInstalledSkillLock,
  writeInstalledSkillLock,
} from "../../src/learning/skill-management/service/lock"
import { installCuratedLibrarySkill } from "../../src/learning/skill-management/service/mutations"
import { managedLibraryRoot } from "../../src/learning/skill-management/service/paths"
import { computeSkillTreeSha256 } from "../../src/learning/skill-management/service/tree-hash"

const CATALOG_ID = "update-test"
const SKILL_NAME = "update-test"
const OLD_SHA = "a".repeat(64)
const OLD_REF = "b".repeat(40)
const NEW_REF = "c".repeat(40)
const RENAMED_SKILL_NAME = "renamed-update-test"
const LOCK_SCHEMA_VERSION = 1
const SCANNER_POLICY_VERSION = 1
const SKILL_FILE_COUNT = 1
const SOURCE = {
  type: "github" as const,
  repo: "example/skills",
  path: `skills/${SKILL_NAME}`,
  ref: NEW_REF,
}

function skillDocument(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

Use the updated workflow.
`
}

function catalogEntry(sha256: string, sizeBytes: number): SkillCatalogEntry {
  return {
    id: CATALOG_ID,
    displayName: "Update Test",
    summary: "Tests curated skill updates.",
    categories: ["test"],
    tags: ["test"],
    source: SOURCE,
    integrity: {
      algorithm: "tree-sha256-v1",
      sha256,
      sizeBytes,
      fileCount: SKILL_FILE_COUNT,
    },
    review: {
      approvedAt: "2026-06-29T00:00:00.000Z",
      approvedBy: "Buddy tests",
      policyVersion: SCANNER_POLICY_VERSION,
    },
    status: "approved",
  }
}

async function writeActiveLock(
  entry: SkillCatalogEntry,
  targetRoot: string,
  installedDocument: string,
): Promise<void> {
  await writeInstalledSkillLock({
    schemaVersion: LOCK_SCHEMA_VERSION,
    installed: {
      [CATALOG_ID]: {
        catalogId: CATALOG_ID,
        displayName: entry.displayName,
        skillName: SKILL_NAME,
        source: {
          ...SOURCE,
          ref: OLD_REF,
        },
        integrity: {
          ...entry.integrity,
          sha256: OLD_SHA,
          sizeBytes: Buffer.byteLength(installedDocument),
        },
        installedAt: "2026-06-28T00:00:00.000Z",
        scannerPolicyVersion: SCANNER_POLICY_VERSION,
        state: "active",
        installedPath: targetRoot,
      },
    },
  })
}

function fetchedSkill(fetchedRoot: string, sizeBytes: number) {
  return {
    source: SOURCE,
    tempRoot: fetchedRoot,
    skillRoot: fetchedRoot,
    stats: {
      fileCount: SKILL_FILE_COUNT,
      totalBytes: sizeBytes,
    },
    cleanup: async () => undefined,
  }
}

describe("curated skill mutations", () => {
  test("atomically replaces an installed skill when the catalog hash changes", async () => {
    const previousTestHome = process.env.BUDDY_TEST_HOME
    const testHome = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-skill-update-"))
    process.env.BUDDY_TEST_HOME = testHome

    const targetRoot = path.join(managedLibraryRoot(), CATALOG_ID)
    const fetchedRoot = path.join(testHome, "fetched")
    const oldDocument = skillDocument(SKILL_NAME, "Old workflow.")
    const newDocument = skillDocument(SKILL_NAME, "Updated workflow.")

    try {
      await Promise.all([
        fsp.mkdir(targetRoot, { recursive: true }),
        fsp.mkdir(fetchedRoot, { recursive: true }),
      ])
      await Promise.all([
        fsp.writeFile(path.join(targetRoot, "SKILL.md"), oldDocument, "utf8"),
        fsp.writeFile(path.join(fetchedRoot, "SKILL.md"), newDocument, "utf8"),
      ])

      const newSha = await computeSkillTreeSha256(fetchedRoot)
      const newSizeBytes = Buffer.byteLength(newDocument)
      const entry = catalogEntry(newSha, newSizeBytes)

      await writeActiveLock(entry, targetRoot, oldDocument)

      await expect(
        installCuratedLibrarySkill(CATALOG_ID, testHome, {
          readCatalogEntryByID: async () => entry,
          fetchPinnedGitHubSkill: async () => fetchedSkill(fetchedRoot, newSizeBytes),
          resolveInstalledSkillByName: async () => ({
            name: SKILL_NAME,
            description: "Old workflow.",
            location: path.join(targetRoot, "SKILL.md"),
            content: oldDocument,
          }),
          refreshSkillRuntime: async () => undefined,
        }),
      ).resolves.toBe(SKILL_NAME)

      await expect(fsp.readFile(path.join(targetRoot, "SKILL.md"), "utf8")).resolves.toBe(
        newDocument,
      )
      const lock = await readInstalledSkillLock()
      expect(lock.installed[CATALOG_ID]?.integrity.sha256).toBe(newSha)
      expect(lock.installed[CATALOG_ID]?.source.ref).toBe(NEW_REF)
    } finally {
      if (previousTestHome === undefined) {
        delete process.env.BUDDY_TEST_HOME
      } else {
        process.env.BUDDY_TEST_HOME = previousTestHome
      }
      await fsp.rm(testHome, { recursive: true, force: true })
    }
  })

  test("rejects a curated update that changes the installed skill name", async () => {
    const previousTestHome = process.env.BUDDY_TEST_HOME
    const testHome = await fsp.mkdtemp(path.join(os.tmpdir(), "buddy-skill-rename-"))
    process.env.BUDDY_TEST_HOME = testHome

    const targetRoot = path.join(managedLibraryRoot(), CATALOG_ID)
    const fetchedRoot = path.join(testHome, "fetched")
    const oldDocument = skillDocument(SKILL_NAME, "Old workflow.")
    const renamedDocument = skillDocument(RENAMED_SKILL_NAME, "Renamed workflow.")

    try {
      await Promise.all([
        fsp.mkdir(targetRoot, { recursive: true }),
        fsp.mkdir(fetchedRoot, { recursive: true }),
      ])
      await Promise.all([
        fsp.writeFile(path.join(targetRoot, "SKILL.md"), oldDocument, "utf8"),
        fsp.writeFile(path.join(fetchedRoot, "SKILL.md"), renamedDocument, "utf8"),
      ])

      const renamedSha = await computeSkillTreeSha256(fetchedRoot)
      const renamedSizeBytes = Buffer.byteLength(renamedDocument)
      const entry = catalogEntry(renamedSha, renamedSizeBytes)
      await writeActiveLock(entry, targetRoot, oldDocument)

      await expect(
        installCuratedLibrarySkill(CATALOG_ID, testHome, {
          readCatalogEntryByID: async () => entry,
          fetchPinnedGitHubSkill: async () => fetchedSkill(fetchedRoot, renamedSizeBytes),
          resolveInstalledSkillByName: async () => {
            throw new Error("Name validation must happen before installed-skill resolution")
          },
          refreshSkillRuntime: async () => undefined,
        }),
      ).rejects.toThrow(
        `Curated skill update cannot change name from "${SKILL_NAME}" to "${RENAMED_SKILL_NAME}"`,
      )

      await expect(fsp.readFile(path.join(targetRoot, "SKILL.md"), "utf8")).resolves.toBe(
        oldDocument,
      )
      const lock = await readInstalledSkillLock()
      expect(lock.installed[CATALOG_ID]?.skillName).toBe(SKILL_NAME)
      expect(lock.installed[CATALOG_ID]?.integrity.sha256).toBe(OLD_SHA)
    } finally {
      if (previousTestHome === undefined) {
        delete process.env.BUDDY_TEST_HOME
      } else {
        process.env.BUDDY_TEST_HOME = previousTestHome
      }
      await fsp.rm(testHome, { recursive: true, force: true })
    }
  })
})
