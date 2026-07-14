import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { resolveExtractedMacAppPath } from "../scripts/verify-mac-update-archive"

const TEST_DIRECTORY_PREFIX = "buddy-mac-update-verification-test-"

function withTestDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX))
  try {
    run(directory)
  } finally {
    rmSync(directory, { force: true, recursive: true })
  }
}

describe("macOS update archive verification", () => {
  test("resolves the single extracted app bundle", () => {
    withTestDirectory((directory) => {
      const appPath = path.join(directory, "Buddy.app")
      mkdirSync(appPath)

      expect(resolveExtractedMacAppPath(directory)).toBe(appPath)
    })
  })

  test("rejects missing and ambiguous app bundles", () => {
    withTestDirectory((directory) => {
      expect(() => resolveExtractedMacAppPath(directory)).toThrow("found 0")
      mkdirSync(path.join(directory, "Buddy.app"))
      mkdirSync(path.join(directory, "Other.app"))
      expect(() => resolveExtractedMacAppPath(directory)).toThrow("found 2")
    })
  })
})
