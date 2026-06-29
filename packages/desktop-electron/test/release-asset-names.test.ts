import { describe, expect, test } from "bun:test"
import {
  resolveMacOsUpdateManifestFilename,
  resolveWindowsUpdateManifestFilename,
} from "../src/shared/release-asset-names"

describe("release asset names", () => {
  test("resolves target-specific updater manifests", () => {
    expect(resolveMacOsUpdateManifestFilename("arm64")).toBe("latest-macos-arm64.json")
    expect(resolveMacOsUpdateManifestFilename("x64")).toBe("latest-macos-x64.json")
    expect(resolveWindowsUpdateManifestFilename("x64")).toBe("latest-windows-x64.yml")
  })
})
