import { describe, expect, test } from "bun:test"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createElectronBuilderConfiguration } from "../electron-builder-config"
import { resolveMacOsReleaseArtifactPattern } from "../src/shared/release-asset-names"

describe("electron-builder config", () => {
  const testDirectory = path.dirname(fileURLToPath(import.meta.url))
  const repositoryRoot = path.resolve(testDirectory, "../../..")
  const config = createElectronBuilderConfiguration({ channel: "prod", repositoryRoot })

  test("preserves Stable identity, protocol, publishing and Windows installer settings", () => {
    expect(config.appId).toBe("ai.buddy.desktop")
    expect(config.productName).toBe("Buddy")
    expect(config.protocols).toEqual({ name: "Buddy", schemes: ["buddy"] })
    expect(config.publish).toEqual({
      provider: "github",
      owner: "prashantbhudwal",
      repo: "buddy-releases",
      channel: "latest",
    })
    expect(config.extraMetadata).not.toHaveProperty("name")
    expect(config.nsis).toEqual({
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      installerIcon: "resources/icons/icon.ico",
      installerHeaderIcon: "resources/icons/icon.ico",
    })
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

  test("preserves Stable macOS packaging identity and ad-hoc signing", () => {
    expect(config.forceCodeSigning).toBeUndefined()
    expect(config.mac).toEqual({
      // The artifact label follows the configured or host target arch.
      artifactName: resolveMacOsReleaseArtifactPattern(),
      category: "public.app-category.developer-tools",
      forceCodeSigning: true,
      icon: "resources/icons/icon.icns",
      hardenedRuntime: true,
      identity: "-",
      gatekeeperAssess: false,
      entitlements: "resources/entitlements.plist",
      entitlementsInherit: "resources/entitlements.plist",
      notarize: false,
      target: ["dmg", "zip"],
    })
    expect(config.dmg).toEqual({ sign: true })
  })

  test("keeps unsigned Windows NSIS updates compatible with the signed manifest updater", () => {
    expect(config.win?.target).toEqual(["nsis"])
    expect(config.win?.artifactName).toBe("buddy-v${version}-windows-x64.${ext}")
    expect(config.win?.icon).toBe("resources/icons/icon.ico")
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
