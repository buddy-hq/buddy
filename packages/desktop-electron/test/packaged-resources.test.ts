import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  ELECTRON_ASAR_FILENAME,
  capturePackagedResourcesSnapshot,
  resolveChangedPackagedResourcesDirectory,
} from "../scripts/packaged-resources"

const TEST_DIRECTORY_PREFIX = "buddy-packaged-resources-test-"
const testDirectories: string[] = []

function createResourcesDirectory(root: string, name: string, contents: string): string {
  const resourcesDirectory = path.join(root, name, "resources")
  mkdirSync(resourcesDirectory, { recursive: true })
  writeFileSync(path.join(resourcesDirectory, ELECTRON_ASAR_FILENAME), contents)
  return resourcesDirectory
}

afterEach(() => {
  for (const directory of testDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("packaged resources", () => {
  test("selects only the resources directory changed by the current build", () => {
    const distDirectory = mkdtempSync(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX))
    testDirectories.push(distDirectory)
    createResourcesDirectory(distDirectory, "stale", "old stale package")
    const current = createResourcesDirectory(distDirectory, "current", "old current package")
    const before = capturePackagedResourcesSnapshot(distDirectory)

    writeFileSync(
      path.join(current, ELECTRON_ASAR_FILENAME),
      "new current package with a different size",
    )
    const after = capturePackagedResourcesSnapshot(distDirectory)

    expect(resolveChangedPackagedResourcesDirectory({ before, after })).toBe(current)
  })

  test("rejects builds that do not identify exactly one changed package", () => {
    const distDirectory = mkdtempSync(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX))
    testDirectories.push(distDirectory)
    const first = createResourcesDirectory(distDirectory, "first", "old first package")
    const second = createResourcesDirectory(distDirectory, "second", "old second package")
    const before = capturePackagedResourcesSnapshot(distDirectory)

    expect(() =>
      resolveChangedPackagedResourcesDirectory({
        before,
        after: capturePackagedResourcesSnapshot(distDirectory),
      }),
    ).toThrow("did not create or update")

    writeFileSync(
      path.join(first, ELECTRON_ASAR_FILENAME),
      "new first package with a different size",
    )
    writeFileSync(
      path.join(second, ELECTRON_ASAR_FILENAME),
      "new second package with another different size",
    )
    expect(() =>
      resolveChangedPackagedResourcesDirectory({
        before,
        after: capturePackagedResourcesSnapshot(distDirectory),
      }),
    ).toThrow("updated multiple resources directories")
  })
})
