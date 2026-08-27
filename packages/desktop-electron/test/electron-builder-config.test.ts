import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElectronBuilderConfiguration } from "../electron-builder-config"
import {
  WINDOWS_RELEASE_ARCHS,
  resolveWindowsReleaseArtifactPattern,
} from "../src/shared/release-asset-names"

describe("electron-builder config", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(testDirectory, "../../..")
  const config = createElectronBuilderConfiguration({ channel: "prod", repositoryRoot })

  test("packages Buddy and third-party license notices", () => {
    expect(config.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: path.resolve(repositoryRoot, "LICENSE"),
          to: "LICENSE",
        }),
        expect.objectContaining({
          from: path.resolve(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
          to: "THIRD_PARTY_NOTICES.md",
        }),
      ]),
    )
  })

  test("requires explicit ad-hoc signing for macOS release bundles", () => {
    expect(config.forceCodeSigning).toBeUndefined()
    expect(config.mac?.forceCodeSigning).toBe(true)
    expect(config.mac?.identity).toBe("-")
    expect(config.mac?.hardenedRuntime).toBe(true)
  })

  test("keeps unsigned Windows NSIS updates compatible with the signed manifest updater", () => {
    expect(config.win?.target).toEqual(["nsis"])
    expect(config.win?.artifactName).toBe(
      resolveWindowsReleaseArtifactPattern(WINDOWS_RELEASE_ARCHS[0]),
    )
    expect(config.win?.verifyUpdateCodeSignature).toBe(false)
  })
})
