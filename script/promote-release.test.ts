import { describe, expect, test } from "bun:test"
import {
  assertPromotableRelease,
  normalizePromotionTag,
  parseGithubReleasePromotionState,
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

  test("refuses drafts, stable releases, and mismatched tags", () => {
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
          isPrerelease: false,
          tagName: "v1.2.3",
        },
        "v1.2.3",
      ),
    ).toThrow("already stable")

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
})
