import { signedUpdateFixture } from "./helpers/signed-update"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { afterEach, describe, expect, test } from "bun:test"
import {
  fetchSignedText,
  UpdatesNotConfiguredError,
  resolveReleaseAssetUrl,
  resolveUpdatePublicKeyOverride,
  resolveLatestRingAssetUrl,
  resolveVersionedReleaseAssetUrls,
  resolveManualDownloadUrl,
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
    globalThis.fetch = createTestFetch(
      async () =>
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
    globalThis.fetch = createTestFetch(
      async () =>
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
    globalThis.fetch = createTestFetch(
      async () =>
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

describe("Beta update distribution", () => {
  test.each(["stable", "preview"] as const)(
    "%s discovers only published pre-releases in the Beta tag namespace",
    async (ring) => {
      const requested: string[] = []
      globalThis.fetch = createTestFetch(async (url) => {
        requested.push(String(url))
        return Response.json([
          { draft: true, prerelease: true, tag_name: "v9.0.0" },
          { draft: false, prerelease: false, tag_name: "v1.9.0" },
          { draft: false, prerelease: true, tag_name: "v2.0.0" },
          { draft: false, prerelease: false, tag_name: "v99.0.0" },
          { draft: false, prerelease: true, tag_name: "beta-v2.0.0" },
          { draft: false, prerelease: true, tag_name: "beta-v1.9.0" },
          { draft: false, prerelease: false, tag_name: "beta-v8.0.0" },
          { draft: true, prerelease: true, tag_name: "beta-v9.0.0" },
          { draft: false, prerelease: true, tag_name: "skill-artifacts" },
          { draft: false, prerelease: true, tag_name: "beta-v3.0" },
          { draft: false, prerelease: true, tag_name: "beta-current" },
        ])
      })
      await expect(
        resolveLatestRingAssetUrl({
          distribution: BUDDY_DISTRIBUTIONS.beta,
          filename: "latest-windows-x64.yml",
          ring,
        }),
      ).resolves.toBe(
        "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-windows-x64.yml",
      )
      expect(requested).toEqual([
        "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
      ])
    },
  )

  test("has no latest or legacy filename fallback", async () => {
    globalThis.fetch = createTestFetch(async () => Response.json([]))
    await expect(
      resolveLatestRingAssetUrl({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        filename: "recovery-policy.json",
        ring: "stable",
      }),
    ).rejects.toThrow("No numeric Beta release")
    expect(
      resolveVersionedReleaseAssetUrls({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        primaryFilename: "latest-mac-arm64.json",
        legacyFilename: "latest-mac.json",
        version: "2.0.0",
      }),
    ).toEqual([
      "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest-mac-arm64.json",
    ])
  })

  test("fails closed before fetching when the embedded Beta signing key is missing", async () => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return new Response("unused")
    })
    await expect(
      fetchSignedText({
        distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: null },
        url: "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/latest.yml",
      }),
    ).rejects.toBeInstanceOf(UpdatesNotConfiguredError)
    expect(requested).toEqual([])
  })

  test.each([
    "https://github.com/prashantbhudwal/buddy-releases/releases/download/v2.0.0/update.zip",
    "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v1.0.0/update.zip",
    "../v2.0.0/update.zip",
    "https://example.invalid/releases/download/beta-v2.0.0/update.zip",
  ])("rejects Beta pinned assets outside their exact Beta tag: %s", (url) => {
    expect(() => resolveReleaseAssetUrl("2.0.0", url, BUDDY_DISTRIBUTIONS.beta)).toThrow(
      "Beta update assets",
    )
  })

  test("ignores ambient key overrides for Beta while preserving prod overrides", () => {
    const previous = process.env.BUDDY_UPDATE_PUBLIC_KEY
    try {
      process.env.BUDDY_UPDATE_PUBLIC_KEY = "prod-override"
      expect(resolveUpdatePublicKeyOverride(BUDDY_DISTRIBUTIONS.beta)).toBeUndefined()
      expect(resolveUpdatePublicKeyOverride(BUDDY_DISTRIBUTIONS.prod)).toBe("prod-override")
    } finally {
      if (previous === undefined) delete process.env.BUDDY_UPDATE_PUBLIC_KEY
      else process.env.BUDDY_UPDATE_PUBLIC_KEY = previous
    }
  })
})

test("Beta signed text supports an explicit test key without falling back to the prod key", async () => {
  const content = '{"version":"2.0.0"}'
  const fixture = signedUpdateFixture(content)
  const url =
    "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v2.0.0/metadata.json"
  globalThis.fetch = createTestFetch(
    async (input) => new Response(String(input).endsWith(".sig") ? fixture.signature : content),
  )
  await expect(
    fetchSignedText({ distribution: BUDDY_DISTRIBUTIONS.beta, publicKey: fixture.publicKey, url }),
  ).resolves.toBe(content)
  await expect(
    fetchSignedText({
      distribution: { ...BUDDY_DISTRIBUTIONS.beta, updaterPublicKey: fixture.publicKey },
      url,
    }),
  ).resolves.toBe(content)
  await expect(
    fetchSignedText({
      distribution: BUDDY_DISTRIBUTIONS.beta,
      publicKey: BUDDY_DISTRIBUTIONS.prod.updaterPublicKey,
      url,
    }),
  ).rejects.toThrow("verification failed")
})

test("Beta discovery includes higher numeric versions on later release pages", async () => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    return Response.json(
      String(url).endsWith("&page=2")
        ? [{ draft: false, prerelease: true, tag_name: "beta-v3.0.0" }]
        : Array.from({ length: 100 }, (_, index) => ({
            draft: false,
            prerelease: true,
            tag_name: index === 0 ? "beta-v2.0.0" : `v1.0.${index}`,
          })),
    )
  })
  await expect(
    resolveLatestRingAssetUrl({
      distribution: BUDDY_DISTRIBUTIONS.beta,
      filename: "latest-windows-x64.yml",
      ring: "preview",
    }),
  ).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases/download/beta-v3.0.0/latest-windows-x64.yml",
  )
  expect(requested).toEqual([
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
  ])
})

test.each(["prod", "beta"] as const)(
  "%s discovery traverses several full mixed pages and an exactly-full final page",
  async (id) => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      const page = Number(new URL(String(url)).searchParams.get("page") ?? "1")
      if (page === 5) return Response.json([])
      return Response.json(
        Array.from({ length: 100 }, (_, index) => ({
          draft: false,
          prerelease: true,
          tag_name:
            page < 3
              ? id === "beta"
                ? "v99.0.0"
                : "beta-v99.0.0"
              : index === 0
                ? `${id === "beta" ? "beta-v" : "v"}${page}.0.0`
                : "skill-artifacts",
        })),
      )
    })
    await expect(
      resolveLatestRingAssetUrl({
        distribution: BUDDY_DISTRIBUTIONS[id],
        filename: "latest-windows-x64.yml",
        ring: "preview",
      }),
    ).resolves.toBe(
      `https://github.com/prashantbhudwal/buddy-releases/releases/download/${id === "beta" ? "beta-v" : "v"}4.0.0/latest-windows-x64.yml`,
    )
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=3",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=4",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=5",
    ])
  },
)

test.each(["network", "http", "json", "shape", "record"] as const)(
  "Beta discovery rejects a partial winner after a later-page %s failure",
  async (failure) => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      if (String(url).includes("&page=2")) {
        if (failure === "network") throw new Error("offline")
        if (failure === "http") return new Response("unavailable", { status: 503 })
        if (failure === "json") return new Response("not JSON")
        return Response.json(failure === "shape" ? {} : [{ tag_name: "beta-v9.0.0" }])
      }
      return Response.json(
        Array.from({ length: 100 }, () => ({
          draft: false,
          prerelease: true,
          tag_name: "beta-v2.0.0",
        })),
      )
    })
    await expect(
      resolveLatestRingAssetUrl({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        filename: "recovery-policy.json",
        ring: "stable",
      }),
    ).rejects.toThrow()
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
    ])
  },
)

test("release discovery refuses an endless release list instead of selecting from part of it", async () => {
  let requests = 0
  globalThis.fetch = createTestFetch(async () => {
    requests += 1
    return Response.json(
      Array.from({ length: 100 }, () => ({
        draft: false,
        prerelease: true,
        tag_name: "beta-v2.0.0",
      })),
    )
  })
  await expect(
    resolveLatestRingAssetUrl({
      distribution: BUDDY_DISTRIBUTIONS.beta,
      filename: "recovery-policy.json",
      ring: "stable",
    }),
  ).rejects.toThrow(/exceeded 50 pages/)
  expect(requests).toBe(50)
})

test("prod Preview retains its latest fallback and prod assets retain absolute URL acceptance", async () => {
  globalThis.fetch = createTestFetch(async () =>
    Response.json([{ draft: false, prerelease: true, tag_name: "beta-v9.0.0" }]),
  )
  await expect(
    resolveLatestRingAssetUrl({ filename: "latest.yml", ring: "preview" }),
  ).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/latest.yml",
  )
  expect(
    resolveReleaseAssetUrl("2.0.0", "https://example.invalid/update.zip", BUDDY_DISTRIBUTIONS.prod),
  ).toBe("https://example.invalid/update.zip")
})

test("manual downloads resolve Beta's newest page and preserve prod latest without discovery", async () => {
  globalThis.fetch = createTestFetch(async () =>
    Response.json([
      { draft: false, prerelease: false, tag_name: "v99.0.0" },
      { draft: false, prerelease: true, tag_name: "beta-v2.0.0" },
    ]),
  )
  await expect(resolveManualDownloadUrl(BUDDY_DISTRIBUTIONS.beta)).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases/tag/beta-v2.0.0",
  )
  globalThis.fetch = createTestFetch(async () => {
    throw new Error("offline")
  })
  await expect(resolveManualDownloadUrl(BUDDY_DISTRIBUTIONS.prod)).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases/latest",
  )
  await expect(resolveManualDownloadUrl(BUDDY_DISTRIBUTIONS.beta)).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases?q=beta-v",
  )
  globalThis.fetch = createTestFetch(async () => Response.json([]))
  await expect(resolveManualDownloadUrl(BUDDY_DISTRIBUTIONS.beta)).resolves.toBe(
    "https://github.com/prashantbhudwal/buddy-releases/releases?q=beta-v",
  )
})
