import { describe, expect, test } from "bun:test"
import {
  assertPrereleasePromotionMovesForward,
  assertPromotableRelease,
  latestReleaseTagFromCommandResult,
  normalizePromotionTag,
  parseGithubReleasePromotionState,
  selectHighestStableReleaseTag,
} from "./promote-release"

describe("promote release", () => {
  test("accepts only stable semver release tags", () => {
    expect(normalizePromotionTag("v1.2.3")).toBe("v1.2.3")
    expect(() => normalizePromotionTag("1.2.3")).toThrow("Malformed release tag")
    expect(() => normalizePromotionTag("v1.2.3-preview.1")).toThrow("Malformed release tag")
    expect(() => normalizePromotionTag(undefined)).toThrow("Malformed release tag")
  })

  test("parses GitHub release promotion state", () => {
    expect(
      parseGithubReleasePromotionState({
        isDraft: false,
        isPrerelease: true,
        tagName: "v1.2.3",
      }),
    ).toEqual({
      isDraft: false,
      isPrerelease: true,
      tagName: "v1.2.3",
    })

    expect(() => parseGithubReleasePromotionState({ tagName: "v1.2.3" })).toThrow(
      "missing promotion fields",
    )
  })

  test("refuses drafts and mismatched tags", () => {
    expect(() =>
      assertPromotableRelease(
        {
          isDraft: true,
          isPrerelease: true,
          tagName: "v1.2.3",
        },
        "v1.2.3",
      ),
    ).toThrow("still a draft")

    expect(() =>
      assertPromotableRelease(
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.2.4",
        },
        "v1.2.3",
      ),
    ).toThrow("Release tag mismatch")
  })

  test("accepts published prerelease candidates", () => {
    expect(() =>
      assertPromotableRelease(
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.2.3",
        },
        "v1.2.3",
      ),
    ).not.toThrow()
  })

  test("accepts a stable release so interrupted promotion can be retried", () => {
    const release = {
      isDraft: false,
      isPrerelease: false,
      tagName: "v1.2.3",
    }
    expect(() => assertPromotableRelease(release, "v1.2.3")).not.toThrow()
  })

  test("refuses to promote an older Preview over a newer stable release", () => {
    expect(() => assertPrereleasePromotionMovesForward("v1.2.4", "v1.2.3")).not.toThrow()
    expect(() => assertPrereleasePromotionMovesForward("v2.0.0", "v1.99.99")).not.toThrow()
    expect(() => assertPrereleasePromotionMovesForward("v1.2.3", "v1.2.3")).toThrow(
      "refusing to move latest backward",
    )
    expect(() => assertPrereleasePromotionMovesForward("v1.2.2", "v1.2.3")).toThrow(
      "refusing to move latest backward",
    )
  })

  test("ignores non-release tags when selecting the highest stable version", () => {
    expect(
      selectHighestStableReleaseTag([
        { tagName: "desktop-hotfix" },
        { tagName: "v1.2.3" },
        { tagName: "v2.0.0-preview.1" },
        { tagName: "v1.10.0" },
      ]),
    ).toBe("v1.10.0")
  })

  test("never points latest at the candidate before repairing to the highest stable", async () => {
    const source = await Bun.file(new URL("./promote-release.ts", import.meta.url)).text()
    expect(source).toContain("--prerelease=false --latest=false")
    expect(source).not.toContain("--prerelease=false --latest --repo")
  })

  test("treats a missing GitHub latest pointer as repairable", () => {
    expect(latestReleaseTagFromCommandResult({ exitCode: 1, output: "" })).toBeUndefined()
    expect(latestReleaseTagFromCommandResult({ exitCode: 0, output: "v1.2.3\n" })).toBe("v1.2.3")
  })
})
