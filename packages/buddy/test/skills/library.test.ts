import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  catalogPathCandidates,
  resolveCatalogSkillState,
  resolveCatalogPathFromCandidates,
} from "../../src/learning/skill-management/service/library"
import type { InstalledSkillLockEntry } from "../../src/learning/skill-management/service/lock"

const CATALOG_SHA = "a".repeat(64)
const SKILL_SIZE_BYTES = 100
const SKILL_FILE_COUNT = 1
const SCANNER_POLICY_VERSION = 1

function activeLockEntry(sha256: string): InstalledSkillLockEntry {
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
  test("resolves catalog candidates from source and bundled runtime entrypoints", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-skill-catalog-paths-"))
    const sourceModule = path.join(root, "source", "library.js")
    const runtimeIndex = path.join(root, "runtime", "index.js")
    const runtimeEntrypoint = path.join(root, "packaged", "index.js")

    const candidates = catalogPathCandidates({
      argv: ["node", runtimeIndex, "run", runtimeEntrypoint],
      moduleUrl: pathToFileURL(sourceModule).href,
    })

    expect(candidates).toEqual([
      path.join(root, "source", "catalog.json"),
      path.join(root, "runtime", "catalog.json"),
      path.join(root, "packaged", "catalog.json"),
    ])
  })

  test("skips missing catalog candidates until a readable asset exists", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-skill-catalog-resolve-"))
    const missingCatalog = path.join(root, "missing", "catalog.json")
    const existingCatalog = path.join(root, "runtime", "catalog.json")

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
})
