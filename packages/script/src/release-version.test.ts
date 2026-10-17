import { describe, expect, test } from "bun:test"
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

test("Beta numeric release tags use the same selector and reject source/prerelease tags", () => {
  expect(
    latestReleaseVersionFromReleases([
      { tagName: "v0.1.0", isDraft: false, isPrerelease: false },
      { tagName: "v0.2.0", isDraft: false, isPrerelease: false },
      { tagName: "beta-v9.0.0", isDraft: false, isPrerelease: false },
      { tagName: "v9.0.0-beta.1", isDraft: false, isPrerelease: false },
      { tagName: "v9.0.0", isDraft: true, isPrerelease: false },
    ]),
  ).toBe("0.2.0")
})
