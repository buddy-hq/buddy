import { describe, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "./distribution.ts"
import {
  assertReleaseTag,
  assertReleaseTagVersion,
  compareReleaseVersions,
  formatBetaReleaseBody,
  formatReleaseTag,
  highestStreamReleaseVersion,
  isPublishedStreamRelease,
  parseReleaseTag,
  readBetaReleaseBody,
  releaseTagDistribution,
} from "./release-stream.ts"

const { beta, prod } = BUDDY_DISTRIBUTIONS

describe("release tag namespaces", () => {
  test("Stable and Beta tags never overlap", () => {
    expect(formatReleaseTag(prod, "0.0.79")).toBe("v0.0.79")
    expect(formatReleaseTag(beta, "0.0.79")).toBe("beta-v0.0.79")
    expect(parseReleaseTag(prod, "beta-v0.0.79")).toBeUndefined()
    expect(parseReleaseTag(beta, "v0.0.79")).toBeUndefined()
    expect(releaseTagDistribution("v1.2.3")).toBe("prod")
    expect(releaseTagDistribution("beta-v1.2.3")).toBe("beta")
  })

  test.each([
    "skill-artifacts",
    "1.2.3",
    "V1.2.3",
    "v1.2",
    "v1.2.3-beta.1",
    "Beta-v1.2.3",
    "beta-1.2.3",
    "beta-v1.2.3 ",
    "beta-beta-v1.2.3",
  ])("%s belongs to no distribution", (tag) => {
    expect(releaseTagDistribution(tag)).toBeUndefined()
  })

  test("refuses tags and versions from the other stream", () => {
    expect(assertReleaseTag(beta, "beta-v0.1.0")).toBe("0.1.0")
    expect(() => assertReleaseTag(beta, "v0.1.0")).toThrow(/does not belong to Buddy Beta/)
    expect(() => assertReleaseTag(prod, "beta-v0.1.0")).toThrow(/does not belong to Buddy/)
    expect(() => assertReleaseTagVersion(beta, "v0.1.0", "0.1.0")).toThrow(/expected beta-v0.1.0/)
    expect(() => formatReleaseTag(beta, "v0.1.0")).toThrow(/Invalid Buddy Beta release version/)
  })
})

describe("stream release selection", () => {
  const mixed = [
    { tagName: "v0.0.79", isDraft: false, isPrerelease: false },
    { tagName: "v0.0.80", isDraft: false, isPrerelease: true },
    { tagName: "beta-v0.9.0", isDraft: false, isPrerelease: true },
    { tagName: "beta-v0.10.0", isDraft: false, isPrerelease: true },
    { tagName: "beta-v9.0.0", isDraft: true, isPrerelease: true },
    { tagName: "beta-v8.0.0", isDraft: false, isPrerelease: false },
    { tagName: "skill-artifacts", isDraft: false, isPrerelease: true },
  ]

  test("each stream sees only its own published releases", () => {
    expect(highestStreamReleaseVersion(prod, mixed)).toBe("0.0.80")
    expect(highestStreamReleaseVersion(prod, mixed, { includePrereleases: false })).toBe("0.0.79")
    expect(highestStreamReleaseVersion(beta, mixed)).toBe("0.10.0")
    expect(highestStreamReleaseVersion(beta, mixed, { skipVersion: "0.10.0" })).toBe("0.9.0")
    expect(highestStreamReleaseVersion(beta, mixed.slice(0, 2))).toBeUndefined()
  })

  test("a Beta release that is not a pre-release is never usable", () => {
    expect(
      isPublishedStreamRelease(beta, {
        tagName: "beta-v8.0.0",
        isDraft: false,
        isPrerelease: false,
      }),
    ).toBe(false)
    expect(
      isPublishedStreamRelease(prod, { tagName: "v0.0.80", isDraft: false, isPrerelease: true }),
    ).toBe(true)
  })

  test("compares versions numerically", () => {
    expect(compareReleaseVersions("0.10.0", "0.9.0")).toBe(1)
    expect(compareReleaseVersions("1.0.0", "1.0.0")).toBe(0)
    expect(compareReleaseVersions("99999999999999999999.0.0", "99999999999999999998.0.0")).toBe(1)
  })
})

describe("Beta release body", () => {
  test("round-trips notes that contain markup", () => {
    const notes = "## Fixes\n- Chat --> Bench <li> works & <br/> renders\n- `a > b`"
    const body = formatBetaReleaseBody(notes)
    expect(body.indexOf(">")).toBe(body.length - 2)
    expect(readBetaReleaseBody(body)).toBe(notes)
    expect(readBetaReleaseBody(body.replaceAll("\n", "\r\n"))).toBe(notes)
  })

  test("ignores any body it did not write", () => {
    expect(readBetaReleaseBody("- visible note")).toBeUndefined()
    expect(readBetaReleaseBody(`${formatBetaReleaseBody("a")}visible`)).toBeUndefined()
  })
})
