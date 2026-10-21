import { describe, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "./distribution"
import { highestStreamReleaseVersion } from "./release-stream"
import { latestReleaseVersionFromReleases } from "./release-version"

describe("script release version selection", () => {
  test("uses the highest published semver tag including Preview prereleases", () => {
    expect(
      latestReleaseVersionFromReleases([
        {
          isDraft: false,
          isPrerelease: false,
          tagName: "v1.2.0",
        },
        {
          isDraft: false,
          isPrerelease: true,
          tagName: "v1.4.0",
        },
        {
          isDraft: false,
          isPrerelease: false,
          tagName: "v1.3.0",
        },
        {
          isDraft: true,
          isPrerelease: false,
          tagName: "v9.0.0",
        },
      ]),
    ).toBe("1.4.0")
  })
})

test("Beta selects only published pre-releases in its own tag namespace", () => {
  expect(
    highestStreamReleaseVersion(BUDDY_DISTRIBUTIONS.beta, [
      { tagName: "v9.0.0", isDraft: false, isPrerelease: false },
      { tagName: "v9.1.0", isDraft: false, isPrerelease: true },
      { tagName: "beta-v0.2.0", isDraft: false, isPrerelease: true },
      { tagName: "beta-v9.0.0", isDraft: false, isPrerelease: false },
      { tagName: "beta-v9.1.0", isDraft: true, isPrerelease: true },
      { tagName: "v0.2.0", isDraft: false, isPrerelease: false },
      { tagName: "skill-artifacts", isDraft: false, isPrerelease: true },
      { tagName: "beta-v9.0.0-beta.1", isDraft: false, isPrerelease: true },
    ]),
  ).toBe("0.2.0")
})
