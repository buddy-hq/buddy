import { afterEach, describe, expect, test } from "bun:test"
import {
  fetchSignedText,
  resolveLatestPrereleaseAssetUrl,
  resolveVersionedReleaseAssetUrls,
  SignedUpdateFetchError,
} from "../src/main/update-common"
import { resolveWindowsUpdateManifestFilename } from "../src/shared/release-asset-names"

const ORIGINAL_FETCH = globalThis.fetch
const WINDOWS_UPDATE_MANIFEST_FILENAME = resolveWindowsUpdateManifestFilename("x64")

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

    await expect(resolveLatestPrereleaseAssetUrl(WINDOWS_UPDATE_MANIFEST_FILENAME)).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.1.0-beta.2/latest-windows-x64.yml",
    )
    expect(requestedUrl).toBe(
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
    )
  })

  test("resolves current and legacy versioned release asset URLs", () => {
    expect(
      resolveVersionedReleaseAssetUrls({
        legacyFilename: "latest.yml",
        primaryFilename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        version: "1.9.0",
      }),
    ).toEqual([
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v1.9.0/latest-windows-x64.yml",
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v1.9.0/latest.yml",
    ])
  })

  test("throws typed fetch errors for missing signed update content", async () => {
    globalThis.fetch = async () => new Response("missing", { status: 404 })

    await expect(
      fetchSignedText({
        publicKey: "unused",
        url: "https://example.invalid/latest.yml",
      }),
    ).rejects.toBeInstanceOf(SignedUpdateFetchError)
  })
})
