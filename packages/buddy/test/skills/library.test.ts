import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import {
  catalogPathCandidates,
  resolveCatalogPathFromCandidates,
} from "../../src/learning/skill-management/service/library"

describe("skill catalog library", () => {
  test("resolves catalog candidates from source and bundled runtime entrypoints", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "buddy-skill-catalog-paths-"))
    const sourceModule = path.join(root, "source", "library.js")
    const runtimeIndex = path.join(root, "runtime", "index.js")
    const runtimeEntrypoint = path.join(root, "packaged", "buddy-backend.js")

    const candidates = catalogPathCandidates({
      argv: ["buddy-backend", "run", runtimeIndex, "run", runtimeEntrypoint],
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
})
