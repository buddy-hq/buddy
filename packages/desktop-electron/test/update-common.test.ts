import { afterEach, describe, expect, test } from "bun:test"
import {
  fetchSignedText,
  resolveLatestRingAssetUrl,
  resolveVersionedReleaseAssetUrls,
  SignedUpdateFetchError,
} from "../src/main/update-common"
import { resolveWindowsUpdateManifestFilename } from "../src/shared/release-asset-names"
import { createTestFetch } from "./helpers/fetch"

const ORIGINAL_FETCH = globalThis.fetch
const WINDOWS_UPDATE_MANIFEST_FILENAME = resolveWindowsUpdateManifestFilename("x64")

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe("update common", () => {
  test("stable ring resolves stable latest assets without querying prereleases", async () => {
    globalThis.fetch = createTestFetch(async () => {
      throw new Error("stable ring should not fetch GitHub prereleases")
    })

    await expect(
      resolveLatestRingAssetUrl({
        filename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        ring: "stable",
      }),
    ).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/latest-windows-x64.yml",
    )
  })

  test("preview ring resolves latest prerelease assets", async () => {
    globalThis.fetch = createTestFetch(async () =>
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: true,
            published_at: "2026-01-02T00:00:00Z",
            tag_name: "v2.1.0",
          },
        ]),
      ),
    )

    await expect(
      resolveLatestRingAssetUrl({
        filename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        ring: "preview",
      }),
    ).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.1.0/latest-windows-x64.yml",
    )
  })

  test("preview ring resolves the newest stable release when no prerelease candidate exists", async () => {
    globalThis.fetch = createTestFetch(async () =>
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: false,
            published_at: "2026-01-02T00:00:00Z",
            tag_name: "v2.1.0",
          },
        ]),
      ),
    )

    await expect(
      resolveLatestRingAssetUrl({
        filename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        ring: "preview",
      }),
    ).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.1.0/latest-windows-x64.yml",
    )
  })

  test("preview ring skips an older bad prerelease after a newer stable promotion", async () => {
    globalThis.fetch = createTestFetch(async () =>
      new Response(
        JSON.stringify([
          {
            draft: false,
            prerelease: true,
            published_at: "2026-01-01T00:00:00Z",
            tag_name: "v2.1.0",
          },
          {
            draft: false,
            prerelease: false,
            published_at: "2026-01-03T00:00:00Z",
            tag_name: "v2.2.0",
          },
        ]),
      ),
    )

    await expect(
      resolveLatestRingAssetUrl({
        filename: WINDOWS_UPDATE_MANIFEST_FILENAME,
        ring: "preview",
      }),
    ).resolves.toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.2.0/latest-windows-x64.yml",
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
    globalThis.fetch = createTestFetch(async () => new Response("missing", { status: 404 }))

    await expect(
      fetchSignedText({
        publicKey: "unused",
        url: "https://example.invalid/latest.yml",
      }),
    ).rejects.toBeInstanceOf(SignedUpdateFetchError)
  })
})
