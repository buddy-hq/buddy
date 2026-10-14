import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { createTestFetch } from "./helpers/fetch"
import { afterEach, describe, expect, test } from "bun:test"
import {
  createWindowsUpdateFeedProviderOptions,
  createDefaultWindowsUpdateProviderOptions,
  fetchWindowsUpdateManifest,
  startWindowsUpdateFeed,
  WINDOWS_UPDATE_MANIFEST_FILENAME,
  type WindowsUpdateFeed,
} from "../src/main/windows-update-feed"
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
          `  - url: https://github.com/prashantbhudwal/buddy-releases/releases/download/v${UPDATE_VERSION}/${WINDOWS_ARTIFACT_FILENAME}`,
        )
        expect(manifest).toContain(
          `path: 'https://github.com/prashantbhudwal/buddy-releases/releases/download/v${UPDATE_VERSION}/${WINDOWS_BLOCKMAP_FILENAME}'`,
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


const ORIGINAL_FETCH = globalThis.fetch
afterEach(() => { globalThis.fetch = ORIGINAL_FETCH })

describe("Beta Windows feed", () => {
  test("uses the Beta provider for resets and turns relative installer paths into Beta asset URLs", async () => {
    expect(createDefaultWindowsUpdateProviderOptions(BUDDY_DISTRIBUTIONS.beta)).toEqual({ channel: "latest", provider: "github", owner: "prashantbhudwal", repo: "buddy-beta-releases" })
    const feed = await startWindowsUpdateFeed({ distribution: BUDDY_DISTRIBUTIONS.beta, content: `version: 1.2.3\npath: update.exe\n`, version: "1.2.3" })
    try {
      await expect((await fetch(new URL("latest.yml", feed.url))).text()).resolves.toBe("version: 1.2.3\npath: https://github.com/prashantbhudwal/buddy-beta-releases/releases/download/v1.2.3/update.exe\n")
    } finally { await feed.close() }
  })

  test("missing Beta key stops verification without contacting the prod feed or using an ambient key", async () => {
    const previous = process.env.BUDDY_UPDATE_PUBLIC_KEY
    const requested: string[] = []
    try {
      process.env.BUDDY_UPDATE_PUBLIC_KEY = BUDDY_DISTRIBUTIONS.prod.updaterPublicKey
      globalThis.fetch = createTestFetch(async (url) => { requested.push(String(url)); return new Response("unused") })
      await expect(fetchWindowsUpdateManifest({ distribution: BUDDY_DISTRIBUTIONS.beta, expectedVersion: "2.0.0", logger: { warn: () => undefined } })).rejects.toThrow("Buddy Beta updates are not configured")
      expect(requested).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.BUDDY_UPDATE_PUBLIC_KEY
      else process.env.BUDDY_UPDATE_PUBLIC_KEY = previous
    }
  })

  test("a missing Beta target manifest never tries a legacy filename", async () => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => { requested.push(String(url)); return new Response("missing", { status: 404 }) })
    await expect(fetchWindowsUpdateManifest({ distribution: BUDDY_DISTRIBUTIONS.beta, expectedVersion: "2.0.0", publicKey: "explicit-test-key", logger: { warn: () => undefined } })).rejects.toThrow("Failed to fetch signed update content")
    expect(requested.toSorted()).toEqual([
      "https://github.com/prashantbhudwal/buddy-beta-releases/releases/download/v2.0.0/latest-windows-x64.yml",
      "https://github.com/prashantbhudwal/buddy-beta-releases/releases/download/v2.0.0/latest-windows-x64.yml.sig",
    ])
  })
})
