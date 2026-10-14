import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { createHash } from "node:crypto"
import { BUDDY_DISTRIBUTIONS, requireUpdaterPublicKey } from "@buddy/script/distribution"
import {
  assertReleaseDestination,
  sourceReleaseTag,
} from "./distribution-guard"
import { assertBetaVersionMovesForward } from "./beta-publication"
import { renderReleaseInstaller } from "./installers"

const fixture = (filename: string) => Bun.file(new URL(`./fixtures/${filename}`, import.meta.url))

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
    const digests = z.object({ "install-buddy-macos.sh": z.string(), "install-buddy-windows.ps1": z.string() }).parse(await fixture("prod-installers.sha256.json").json())
    const filename = suffix === "macos.sh" ? "install-buddy-macos.sh" : "install-buddy-windows.ps1"
    expect(createHash("sha256").update(renderReleaseInstaller(source, "prod")).digest("hex")).toBe(digests[filename])
    const beta = renderReleaseInstaller(source, "beta")
    expect(beta).toContain("prashantbhudwal/buddy-beta-releases")
    expect(beta).toContain("Downloads/buddy-beta-release")
    expect(beta).toContain("Buddy Beta installer")
    expect(beta).not.toContain("prashantbhudwal/buddy-releases")
    expect(beta).toContain("buddy-v")
  })
})
