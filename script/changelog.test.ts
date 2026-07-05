import { describe, expect, test } from "bun:test"
import { latestReleaseVersionFromReleases } from "./changelog"

describe("changelog release version helpers", () => {
  test("selects the highest stable semver release by default", () => {
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
    ).toBe("1.3.0")
  })

  test("can include Preview candidates when choosing the next release tag", () => {
    expect(
      latestReleaseVersionFromReleases(
        [
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.3.0",
          },
          {
            isDraft: false,
            isPrerelease: true,
            tagName: "v1.4.0",
          },
        ],
        { includePrereleases: true },
      ),
    ).toBe("1.4.0")
  })

  test("skips an existing tag when requested", () => {
    expect(
      latestReleaseVersionFromReleases(
        [
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.3.0",
          },
          {
            isDraft: false,
            isPrerelease: false,
            tagName: "v1.2.0",
          },
        ],
        { skip: "v1.3.0" },
      ),
    ).toBe("1.2.0")
  })
})
