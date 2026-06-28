import { describe, expect, test } from "bun:test"
import {
  createWindowsUpdateFeedProviderOptions,
  startWindowsUpdateFeed,
  WINDOWS_UPDATE_MANIFEST_FILENAME,
  type WindowsUpdateFeed,
} from "../src/main/windows-update-feed"
import { resolveReleaseAssetUrl } from "../src/main/update-common"
import { resolveWindowsReleaseArtifactFilename } from "../src/shared/release-asset-names"

const UPDATE_VERSION = "1.2.3"
const WINDOWS_ARTIFACT_FILENAME = resolveWindowsReleaseArtifactFilename(
  UPDATE_VERSION,
  "x64",
  "exe",
)
const WINDOWS_BLOCKMAP_FILENAME = `${WINDOWS_ARTIFACT_FILENAME}.blockmap`

describe("windows update feed", () => {
  test("serves the signed latest.yml manifest over loopback http", async () => {
    await withWindowsUpdateFeed(`version: ${UPDATE_VERSION}\n`, async (feed) => {
      expect(feed.url.startsWith("http://127.0.0.1:")).toBe(true)
      expect(createWindowsUpdateFeedProviderOptions(feed)).toEqual({
        channel: "latest",
        provider: "generic",
        url: feed.url,
      })

      const manifestUrl = new URL(`${WINDOWS_UPDATE_MANIFEST_FILENAME}?cacheBust=1`, feed.url)
      const response = await fetch(manifestUrl)

      expect(response.status).toBe(200)
      expect(response.headers.get("cache-control")).toContain("no-cache")
      await expect(response.text()).resolves.toBe(`version: ${UPDATE_VERSION}\n`)
    })
  })

  test("rejects file feeds before electron-updater hits its ClientRequest protocol failure", () => {
    expect(() =>
      createWindowsUpdateFeedProviderOptions({
        url: "file:///C:/Temp/buddy/windows-updater/",
      }),
    ).toThrow("Windows update feed must use http: or https:")
  })

  test("rewrites Windows release artifact paths to signed release asset URLs", async () => {
    await withWindowsUpdateFeed(
      [
        `version: ${UPDATE_VERSION}`,
        "files:",
        `  - url: ${WINDOWS_ARTIFACT_FILENAME}`,
        "    sha512: test",
        "    size: 123",
        `path: '${WINDOWS_BLOCKMAP_FILENAME}'`,
      ].join("\n"),
      async (feed) => {
        const response = await fetch(new URL(WINDOWS_UPDATE_MANIFEST_FILENAME, feed.url))
        const manifest = await response.text()

        expect(manifest).toContain(
          `  - url: ${resolveReleaseAssetUrl(UPDATE_VERSION, WINDOWS_ARTIFACT_FILENAME)}`,
        )
        expect(manifest).toContain(
          `path: '${resolveReleaseAssetUrl(UPDATE_VERSION, WINDOWS_BLOCKMAP_FILENAME)}'`,
        )
      },
    )
  })

  test("returns 404 for non-manifest paths", async () => {
    await withWindowsUpdateFeed(`version: ${UPDATE_VERSION}\n`, async (feed) => {
      const response = await fetch(new URL("not-latest.yml", feed.url))
      expect(response.status).toBe(404)
    })
  })
})

async function withWindowsUpdateFeed(
  content: string,
  run: (feed: WindowsUpdateFeed) => Promise<void>,
): Promise<void> {
  const feed = await startWindowsUpdateFeed({
    content,
    version: UPDATE_VERSION,
  })

  try {
    await run(feed)
  } finally {
    await feed.close()
  }
}
