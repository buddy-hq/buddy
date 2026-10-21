import { describe, expect, test } from "bun:test"
import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  formatSourceReleaseTag,
  requireUpdaterPublicKey,
  resolveBuddyDistribution,
} from "./distribution.ts"

describe("Buddy distributions", () => {
  test("prod keeps the identity existing Stable and Preview installs depend on", () => {
    const prod = BUDDY_DISTRIBUTIONS.prod
    expect(prod.appId).toBe("ai.buddy.desktop")
    expect(prod.protocol).toBe("buddy")
    expect(formatReleaseRepositorySlug(prod)).toBe("prashantbhudwal/buddy-releases")
    expect(prod.releaseBranch).toBe("main")
    expect(formatSourceReleaseTag(prod, "1.2.3")).toBe("v1.2.3")
    expect(requireUpdaterPublicKey(prod)).toStartWith("RW")
  })

  test("beta shares only the assets repository with prod, never an identity or tag namespace", () => {
    const { beta, prod } = BUDDY_DISTRIBUTIONS
    for (const key of [
      "productName",
      "appId",
      "protocol",
      "packageName",
      "releaseTagPrefix",
      "sourceTagPrefix",
    ] as const) {
      expect(beta[key]).not.toBe(prod[key])
    }
    expect(formatReleaseRepositorySlug(beta)).toBe(formatReleaseRepositorySlug(prod))
    expect(formatSourceReleaseTag(beta, "0.1.0")).toBe("beta-v0.1.0")
    expect(beta.releaseBranch).toBe("beta")
  })

  test("beta fails closed until its own updater key is provisioned", () => {
    expect(() =>
      requireUpdaterPublicKey({ ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null }),
    ).toThrow(/no updater public key/)
  })

  test("dev is not a releasable distribution", () => {
    expect(resolveBuddyDistribution("dev")).toBeUndefined()
    expect(resolveBuddyDistribution("beta")).toBe(BUDDY_DISTRIBUTIONS.beta)
    expect(resolveBuddyDistribution("prod")).toBe(BUDDY_DISTRIBUTIONS.prod)
  })
})
