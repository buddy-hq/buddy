import { describe, expect, test } from "bun:test"
import prodConfiguration from "./fixtures/prod-builder-config.json"
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

  test("keeps the complete prod configuration identical to the captured pre-Beta configuration", () => {
    expect<unknown>(
      createElectronBuilderConfiguration({ channel: "prod", repositoryRoot: "/buddy-repository" }),
    ).toEqual(prodConfiguration)
  })

  test("isolates Beta identity, protocol, publishing and Windows updater cache metadata", () => {
    const beta = createElectronBuilderConfiguration({ channel: "beta", repositoryRoot })
    expect(beta.appId).toBe("ai.buddy.desktop.beta")
    expect(beta.productName).toBe("Buddy Beta")
    expect(beta.protocols).toEqual({ name: "Buddy Beta", schemes: ["buddy-beta"] })
    expect(beta.publish).toEqual({
      provider: "github",
      owner: "prashantbhudwal",
      repo: "buddy-beta-releases",
      channel: "latest",
    })
    expect(beta.extraMetadata).toEqual({ ...config.extraMetadata, name: "buddy-desktop-beta" })
    expect(beta.nsis).toEqual(config.nsis)
  })

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

  test("packs the in-app browser guest preload with compiled desktop output", () => {
    expect(config.files).toEqual(expect.arrayContaining(["out/**/*"]))
  })

  test("unpacks native credential bindings from the application archive", () => {
    expect(config.asarUnpack).toContain("out/main/node_modules/@napi-rs/keyring/**/*")
    expect(config.asarUnpack).toContain("out/main/chunks/node_modules/@primno/dpapi/prebuilds/**/*")
  })
})
