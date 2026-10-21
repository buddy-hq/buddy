import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { createTestFetch } from "./helpers/fetch"
import { signedUpdateFixture } from "./helpers/signed-update"
import { afterEach, describe, expect, test } from "bun:test"
import {
  createWindowsUpdateFeedProviderOptions,
  absolutizeElectronUpdateManifestUrls,
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
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe("Beta Windows feed", () => {
  test("uses the Beta provider for resets and turns relative installer paths into Beta asset URLs", async () => {
    expect(createDefaultWindowsUpdateProviderOptions(BUDDY_DISTRIBUTIONS.beta)).toEqual({
      channel: "latest",
      provider: "github",
      owner: "prashantbhudwal",
      repo: "buddy-releases",
    })
    const feed = await startWindowsUpdateFeed({
      distribution: BUDDY_DISTRIBUTIONS.beta,
      content: `version: 1.2.3\npath: update.exe\nsha512: test\n`,
      version: "1.2.3",
    })
    try {
      await expect((await fetch(new URL("latest.yml", feed.url))).text()).resolves.toBe(
        "version: 1.2.3\npath: https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.2.3/update.exe\nsha512: test\n",
      )
    } finally {
      await feed.close()
    }
  })

  test("missing Beta key stops verification without contacting the prod feed or using an ambient key", async () => {
    const previous = process.env.BUDDY_UPDATE_PUBLIC_KEY
    const requested: string[] = []
    try {
      process.env.BUDDY_UPDATE_PUBLIC_KEY = BUDDY_DISTRIBUTIONS.prod.updaterPublicKey
      globalThis.fetch = createTestFetch(async (url) => {
        requested.push(String(url))
        return new Response("unused")
      })
      await expect(
        fetchWindowsUpdateManifest({
          distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null },
          expectedVersion: "2.0.0",
          logger: { warn: () => undefined },
        }),
      ).rejects.toThrow("Buddy Beta updates are not configured")
      expect(requested).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.BUDDY_UPDATE_PUBLIC_KEY
      else process.env.BUDDY_UPDATE_PUBLIC_KEY = previous
    }
  })

  test("a missing Beta target manifest never tries a legacy filename", async () => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return new Response("missing", { status: 404 })
    })
    await expect(
      fetchWindowsUpdateManifest({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        expectedVersion: "2.0.0",
        publicKey: "explicit-test-key",
        logger: { warn: () => undefined },
      }),
    ).rejects.toThrow("Failed to fetch signed update content")
    expect(requested.toSorted()).toEqual([
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml",
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml.sig",
    ])
  })

  test.each([
    [
      "flow style",
      'files: [{url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/v1.2.3/Buddy-Setup.exe", sha512: test}]',
    ],
    [
      "alias",
      'installer: &installer {url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/v1.2.3/Buddy-Setup.exe", sha512: test}\nfiles: [*installer]',
    ],
    [
      "another Beta tag",
      'files: [{url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v9.0.0/Buddy-Setup.exe", sha512: test}]',
    ],
    ["relative flow URL", 'files: [{url: "Buddy-Setup.exe", sha512: test}]'],
    [
      "web installer package",
      'files: [{url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.2.3/Buddy-Setup.exe", sha512: test}]\npackages: {ia32: {path: "https://github.com/prashantbhudwal/buddy-releases/releases/download/v1.2.3/package.7z", sha512: test}}',
    ],
  ])("rejects Beta downloads outside its release through %s", (_style, entries) => {
    expect(() =>
      absolutizeElectronUpdateManifestUrls(
        `version: ${UPDATE_VERSION}\n${entries}\n`,
        UPDATE_VERSION,
        BUDDY_DISTRIBUTIONS.beta,
      ),
    ).toThrow("Beta update assets must belong to the Beta release repository and tag")
  })

  test("keeps an absolute block-style Beta manifest unchanged", () => {
    const content = [
      `version: ${UPDATE_VERSION}`,
      "files:",
      '  - url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.2.3/Buddy-Setup.exe"',
      "    sha512: test",
      'path: "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.2.3/Buddy-Setup.exe"',
      "sha512: test",
      "",
    ].join("\n")
    expect(
      absolutizeElectronUpdateManifestUrls(content, UPDATE_VERSION, BUDDY_DISTRIBUTIONS.beta),
    ).toBe(content)
  })

  test("verifies a Windows manifest with a provisioned Beta test key", async () => {
    const content = "version: 2.0.0\npath: update.exe\nsha512: test\n"
    const fixture = signedUpdateFixture(content)
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return new Response(String(url).endsWith(".sig") ? fixture.signature : content)
    })
    await expect(
      fetchWindowsUpdateManifest({
        distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey },
        expectedVersion: "2.0.0",
        logger: { warn: () => undefined },
      }),
    ).resolves.toEqual({ content, version: "2.0.0" })
    expect(requested.toSorted()).toEqual([
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml",
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml.sig",
    ])
  })

  test("discovers a later-page Beta release with a carried-forward manifest and serves its older Beta assets", async () => {
    const assetUrl =
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.2.3/update.exe"
    const content = `version: 1.2.3\npath: ${assetUrl}\nsha512: test\n`
    const fixture = signedUpdateFixture(content)
    const distribution = { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey }
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      if (String(url).startsWith("https://api.github.com/")) {
        if (String(url).includes("&page=2")) {
          return Response.json([{ draft: false, prerelease: true, tag_name: "beta-v2.0.0" }])
        }
        return Response.json(
          Array.from({ length: 100 }, () => ({
            draft: false,
            prerelease: true,
            tag_name: "v99.0.0",
          })),
        )
      }
      return new Response(String(url).endsWith(".sig") ? fixture.signature : content)
    })
    const manifest = await fetchWindowsUpdateManifest({
      distribution,
      logger: { warn: () => undefined },
    })
    expect(manifest).toEqual({ content, version: "1.2.3" })
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml",
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml.sig",
    ])
    globalThis.fetch = ORIGINAL_FETCH
    const feed = await startWindowsUpdateFeed({ ...manifest, distribution })
    try {
      await expect((await fetch(new URL("latest.yml", feed.url))).text()).resolves.toBe(content)
      expect(createWindowsUpdateFeedProviderOptions(feed).provider).toBe("generic")
    } finally {
      await feed.close()
    }
  })

  test("discovery accepts another Beta asset tag while a pinned download requires its exact tag", async () => {
    const content =
      "version: 2.0.0\npath: https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.9.0/update.exe\nsha512: test\n"
    const fixture = signedUpdateFixture(content)
    const distribution = { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey }
    globalThis.fetch = createTestFetch(async (url) => {
      if (String(url).startsWith("https://api.github.com/")) {
        return Response.json([{ draft: false, prerelease: true, tag_name: "beta-v3.0.0" }])
      }
      return new Response(String(url).endsWith(".sig") ? fixture.signature : content)
    })
    const manifest = await fetchWindowsUpdateManifest({
      distribution,
      logger: { warn: () => undefined },
    })
    expect(manifest).toEqual({ content, version: "2.0.0" })
    await expect(
      fetchWindowsUpdateManifest({
        distribution,
        expectedVersion: "2.0.0",
        logger: { warn: () => undefined },
      }),
    ).rejects.toThrow("Beta update assets must belong to the Beta release repository and tag")
    globalThis.fetch = ORIGINAL_FETCH
    const feed = await startWindowsUpdateFeed({ ...manifest, distribution })
    try {
      await expect((await fetch(new URL("latest.yml", feed.url))).text()).resolves.toBe(content)
    } finally {
      await feed.close()
    }
  })

  test("rejects a correctly signed Stable asset URL during Beta discovery", async () => {
    const content =
      "version: 2.0.0\npath: https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.0.0/update.exe\nsha512: test\n"
    const fixture = signedUpdateFixture(content)
    globalThis.fetch = createTestFetch(async (url) =>
      String(url).startsWith("https://api.github.com/")
        ? Response.json([{ draft: false, prerelease: true, tag_name: "beta-v2.0.0" }])
        : new Response(String(url).endsWith(".sig") ? fixture.signature : content),
    )
    await expect(
      fetchWindowsUpdateManifest({
        distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey },
        logger: { warn: () => undefined },
      }),
    ).rejects.toThrow("Beta update assets must belong to the Beta release repository and tag")
  })
})
