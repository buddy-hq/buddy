import { afterEach, describe, expect, test } from "bun:test"
import { resolveLatestPrereleaseAssetUrl } from "../src/main/update-common"

const ORIGINAL_FETCH = globalThis.fetch
const LATEST_YML_FILENAME = "latest.yml"

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe("update common", () => {
  test("resolves latest prerelease assets without using the stable latest release", async () => {
    let requestedUrl = ""
    globalThis.fetch = async (input) => {
      requestedUrl = String(input)
      return new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: false,
            published_at: "2026-01-03T00:00:00Z",
            tag_name: "v2.0.0",
          },
          {
            draft: false,
            prerelease: true,
            published_at: "2026-01-02T00:00:00Z",
            tag_name: "v2.1.0-beta.1",
          },
          {
            draft: false,
            prerelease: true,
            published_at: "2026-01-04T00:00:00Z",
            tag_name: "v2.1.0-beta.2",
          },
        ]),
      )
    }

    await expect(resolveLatestPrereleaseAssetUrl(LATEST_YML_FILENAME)).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.1.0-beta.2/latest.yml",
    )
    expect(requestedUrl).toBe(
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
    )
  })
})
