import { describe, expect, test } from "bun:test"
import {
  parseSkillCatalogDocument,
  type SkillCatalogDocument,
} from "../../src/learning/skill-management/service/library"
import { refreshSkillArtifactsWithDependenciesForTests } from "../../src/learning/skill-management/service/artifact-refresh"

const TEST_CATALOG = parseSkillCatalogDocument({
  schemaVersion: 1,
  revision: 2,
  entries: [],
})

describe("skill artifact refresh", () => {
  test("reconciles withdrawals from the accepted catalog before completing", async () => {
    const reconciled: SkillCatalogDocument[] = []

    const result = await refreshSkillArtifactsWithDependenciesForTests({
      readCatalog: async () => ({
        document: TEST_CATALOG,
        revision: TEST_CATALOG.revision,
        source: "remote",
        syncError: undefined,
      }),
      reconcileCatalog: async (catalog) => {
        reconciled.push(catalog)
      },
      refreshSystem: async () => ({ changed: false }),
    })

    expect(reconciled).toEqual([TEST_CATALOG])
    expect(result.catalog.document).toBe(TEST_CATALOG)
  })
})
