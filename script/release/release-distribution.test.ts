import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { BUDDY_DISTRIBUTIONS, formatReleaseRepositorySlug, requireUpdaterPublicKey } from "@buddy/script/distribution"
import {
  assertReleaseDestination,
  sourceReleaseTag,
} from "./distribution-guard"
import { assertBetaVersionMovesForward } from "./beta-publication"
import { renderReleaseInstaller } from "./installers"

describe("release distribution boundary", () => {
  test("Beta has no fallback signing key", () => {
    expect(() => requireUpdaterPublicKey({ ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null })).toThrow("no updater public key provisioned")
    expect(requireUpdaterPublicKey(BUDDY_DISTRIBUTIONS.prod)).toBe(BUDDY_DISTRIBUTIONS.prod.updaterPublicKey)
  })

  test.each([
    "upload-release-assets.ts",
    "finalize-latest-mac-json.ts",
    "finalize-latest-yml.ts",
  ])("legacy %s refuses Beta before any upload or signing", (filename) => {
    const result = spawnSync(process.execPath, [path.resolve(import.meta.dir, "../../packages/desktop-electron/scripts", filename)], {
      env: {
        ...process.env,
        BUDDY_CHANNEL: "beta",
        BUDDY_RELEASE_REPO: "prashantbhudwal/buddy-beta-releases",
        GH_REPO: "",
        BUDDY_VERSION: "0.1.0",
      },
      encoding: "utf8",
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Legacy direct uploads do not support beta")
  })

  test("guards explicit destinations before uploading", () => {
    expect(() => assertReleaseDestination("prashantbhudwal/buddy-releases", { BUDDY_CHANNEL: "beta" })).toThrow("conflicts with beta")
    expect(() => assertReleaseDestination("prashantbhudwal/buddy-beta-releases", {})).toThrow("conflicts with prod")
    expect(assertReleaseDestination("prashantbhudwal/buddy-beta-releases", { BUDDY_CHANNEL: "beta" }).id).toBe("beta")
  })

  test("keeps release-repo versions numeric and source tags disjoint", () => {
    expect(sourceReleaseTag("0.1.0", {})).toBe("v0.1.0")
    expect(sourceReleaseTag("0.1.0", { BUDDY_CHANNEL: "beta" })).toBe("beta-v0.1.0")
    expect(() => sourceReleaseTag("0.1.0-beta.1", { BUDDY_CHANNEL: "beta" })).toThrow("Invalid release version")
  })

  test("Beta versions move forward with equality reserved for frozen retries", () => {
    expect(() => assertBetaVersionMovesForward("0.1.0", undefined)).not.toThrow()
    expect(() => assertBetaVersionMovesForward("0.2.0", "0.1.9")).not.toThrow()
    expect(() => assertBetaVersionMovesForward("0.1.0", "0.1.0")).not.toThrow()
    expect(() => assertBetaVersionMovesForward("0.1.9", "0.2.0")).toThrow("refusing to move latest backward")
    expect(() => assertBetaVersionMovesForward("1.0.0", "2.0.0")).toThrow("lower than published")
  })

  test.each(["macos.sh", "windows.ps1"])("renders Beta installer defaults and preserves prod %s bytes", async (suffix) => {
    const source = await Bun.file(new URL(`../../scripts/install-buddy-${suffix}`, import.meta.url)).text()
    expect(renderReleaseInstaller(source, "prod")).toBe(source)
    const beta = renderReleaseInstaller(source, "beta")
    expect(beta).toContain("prashantbhudwal/buddy-beta-releases")
    expect(beta).toContain("Downloads/buddy-beta-release")
    expect(beta).toContain("Buddy Beta installer")
    expect(beta).not.toContain("prashantbhudwal/buddy-releases")
    expect(beta).toContain("BUDDY_BETA_RELEASE_REPO")
    expect(beta).not.toContain("BUDDY_RELEASE_REPO")
    expect(beta).not.toContain("Buddy Beta Beta")
    expect(beta).not.toContain("Buddy.app")
    expect(beta).not.toContain("Buddy Beta.app")
    if (suffix === "macos.sh") {
      expect(beta).toContain('CURRENT_ASSET_BASENAME="buddy-v${VERSION}-macos-${ARCH_LABEL}"')
      expect(beta).toContain('LEGACY_ASSET_BASENAME="buddy-electron-mac-${ARCH}"')
      expect(beta).toContain("Drag Buddy Beta into Applications")
    } else {
      expect(beta).toContain('"buddy-v$version-windows-$arch.exe"')
      expect(beta).toContain('"buddy-electron-win-$arch.exe"')
      expect(beta).toContain('"buddy-v$version-windows-x64.exe"')
    }
  })

  test.each(Object.values(BUDDY_DISTRIBUTIONS))("local installer defaults match $id", async (distribution) => {
    const source = await Bun.file(new URL("../install-release.sh", import.meta.url)).text()
    const defaults = source.match(new RegExp(`\\n  ${distribution.id}\\)\\n([\\s\\S]*?)\\n    ;;`, "u"))?.[1]
    expect(defaults).toContain(`EXPECTED_REPO="${formatReleaseRepositorySlug(distribution)}"`)
    expect(defaults).toContain(`EXPECTED_APP_NAME="${distribution.productName}"`)
    expect(defaults).toContain(`EXPECTED_APP_ID="${distribution.appId}"`)
  })

  test("rendering Beta display text keeps an existing Beta label intact", () => {
    expect(renderReleaseInstaller("Buddy installer; Buddy Beta installer", "beta")).toBe("Buddy Beta installer; Buddy Beta installer")
  })
})
