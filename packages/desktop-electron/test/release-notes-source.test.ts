import { afterEach, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { formatBetaReleaseBody } from "@buddy/script/release-stream"
import { fetchReleaseNotes } from "../src/main/release-notes-source"
import { createTestFetch } from "./helpers/fetch"
import { REAL_SHARED_RELEASES } from "../../../script/release/fixtures/shared-repository"

const originalFetch = globalThis.fetch
const logger = { warn: () => undefined }
afterEach(() => {
  globalThis.fetch = originalFetch
})

function release(
  tag: string,
  input: { draft?: boolean; prerelease?: boolean; body?: string } = {},
) {
  return {
    tag_name: tag,
    html_url: `https://github.com/prashantbhudwal/buddy-releases/releases/tag/${tag}`,
    body:
      input.body ??
      (tag.startsWith("beta-v") ? formatBetaReleaseBody("- Beta change") : "- Stable change"),
    draft: input.draft ?? false,
    prerelease: input.prerelease ?? tag.startsWith("beta-v"),
  }
}

test("Beta notes isolate published Beta tags, decode hidden notes, and sort numeric versions in range", async () => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    return Response.json([
      release("v9.0.0"),
      release("v1.9.0", { prerelease: true }),
      release("beta-v1.2.0"),
      release("beta-v1.10.0", { body: formatBetaReleaseBody("- A < B & C") }),
      release("v1.10.0"),
      release("beta-v1.8.0", { prerelease: false }),
      release("beta-v1.7.0", { draft: true }),
      release("beta-v1.6.0", { body: "- Unwrapped notes" }),
      release("beta-v1.0.0"),
      release("beta-v2.0.0"),
      release("beta-v1.3"),
      release("skill-artifacts"),
    ])
  })
  const notes = await fetchReleaseNotes({
    distribution: BUDDY_DISTRIBUTIONS.beta,
    currentVersion: "1.0.0",
    targetVersion: "1.10.0",
    ring: "stable",
    logger,
  })
  expect(notes.map((note) => ({ version: note.version, items: note.items }))).toEqual([
    { version: "1.10.0", items: ["A < B & C"] },
    { version: "1.2.0", items: ["Beta change"] },
  ])
  expect(requested).toEqual([
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
  ])
})

test("Beta notes scan past full Stable pages and earlier matches, sort, cap, and terminate after a full page", async () => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    const page = Number(new URL(String(url)).searchParams.get("page") ?? "1")
    if (page === 5) return Response.json([])
    if (page < 3) return Response.json(Array.from({ length: 100 }, () => release("v99.0.0")))
    return Response.json([
      ...Array.from({ length: 6 }, (_, index) =>
        release(`beta-v1.${(page - 3) * 6 + index + 1}.0`),
      ),
      ...Array.from({ length: 94 }, () => release("skill-artifacts")),
    ])
  })
  const notes = await fetchReleaseNotes({
    distribution: BUDDY_DISTRIBUTIONS.beta,
    currentVersion: "1.0.0",
    targetVersion: "1.12.0",
    ring: "preview",
    logger,
  })
  expect(notes.map((note) => note.version)).toEqual([
    "1.12.0",
    "1.11.0",
    "1.10.0",
    "1.9.0",
    "1.8.0",
  ])
  expect(requested).toEqual([
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=3",
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=4",
    "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=5",
  ])
})

test.each(["stable", "preview"] as const)(
  "prod %s notes paginate past Beta and retain ordering, caps, and prerelease policy",
  async (ring) => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      if (!String(url).includes("&page=2")) {
        return Response.json(Array.from({ length: 100 }, () => release("beta-v1.9.0")))
      }
      return Response.json([
        release("v1.7.0", { prerelease: true }),
        release("v1.6.0"),
        release("v1.5.0"),
        release("v1.4.0"),
        release("v1.3.0"),
        release("v1.2.0"),
        release("v1.1.0"),
        release("beta-v1.8.0"),
        release("skill-artifacts"),
        release("1.8.0"),
        release("v1.8"),
        release("v1.9.0", { draft: true }),
      ])
    })
    const notes = await fetchReleaseNotes({
      distribution: BUDDY_DISTRIBUTIONS.prod,
      currentVersion: "1.0.0",
      targetVersion: "1.9.0",
      ring,
      logger,
    })
    expect(notes.map((note) => note.version)).toEqual(
      ring === "preview"
        ? ["1.7.0", "1.6.0", "1.5.0", "1.4.0", "1.3.0"]
        : ["1.6.0", "1.5.0", "1.4.0", "1.3.0", "1.2.0"],
    )
    expect(notes[0]?.items).toEqual(["Stable change"])
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
    ])
  },
)

test("prod notes stop after enough notes even when the last page is full", async () => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    if (requested.length > 1) throw new Error("unexpected extra page")
    return Response.json(Array.from({ length: 100 }, (_, index) => release(`v1.${100 - index}.0`)))
  })
  const notes = await fetchReleaseNotes({
    distribution: BUDDY_DISTRIBUTIONS.prod,
    currentVersion: "1.0.0",
    targetVersion: "1.100.0",
    ring: "stable",
    logger,
  })
  expect(notes.map((note) => note.version)).toEqual([
    "1.100.0",
    "1.99.0",
    "1.98.0",
    "1.97.0",
    "1.96.0",
  ])
  expect(requested).toHaveLength(1)
})

test("prod notes bound pagination when the shared repository contains only Beta", async () => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    if (requested.length > 3) throw new Error("pagination exceeded its bound")
    return Response.json(Array.from({ length: 100 }, () => release("beta-v1.9.0")))
  })
  expect(
    await fetchReleaseNotes({
      distribution: BUDDY_DISTRIBUTIONS.prod,
      currentVersion: "1.0.0",
      targetVersion: "1.9.0",
      ring: "preview",
      logger,
    }),
  ).toEqual([])
  expect(requested).toHaveLength(3)
})

for (const ring of ["stable", "preview"] as const) {
  test.each(["network", "http", "json", "shape"] as const)(
    `prod ${ring} notes retain page-one matches after a later-page %s failure`,
    async (failure) => {
      const requested: string[] = []
      globalThis.fetch = createTestFetch(async (url) => {
        requested.push(String(url))
        if (requested.length === 1) {
          return Response.json([
            release("v1.1.0"),
            ...Array.from({ length: 99 }, () => release("beta-v1.9.0")),
          ])
        }
        if (failure === "network") throw new Error("offline")
        if (failure === "http") return new Response("unavailable", { status: 503 })
        if (failure === "json") return new Response("not JSON")
        return Response.json({ unexpected: "shape" })
      })
      const notes = await fetchReleaseNotes({
        distribution: BUDDY_DISTRIBUTIONS.prod,
        currentVersion: "1.0.0",
        targetVersion: "1.9.0",
        ring,
        logger,
      })
      expect(notes.map((note) => note.version)).toEqual(["1.1.0"])
      expect(requested).toEqual([
        "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
        "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100&page=2",
      ])
    },
  )

  test(`prod ${ring} reads the live-like shared repository in one request`, async () => {
    const requested: string[] = []
    globalThis.fetch = createTestFetch(async (url) => {
      requested.push(String(url))
      return Response.json([
        release("beta-v1.9.0"),
        ...REAL_SHARED_RELEASES.filter((item) => !item.isDraft).map((item) => ({
          tag_name: item.tagName,
          html_url: item.url,
          body: item.body,
          draft: item.isDraft,
          prerelease: item.isPrerelease,
        })),
      ])
    })
    const notes = await fetchReleaseNotes({
      distribution: BUDDY_DISTRIBUTIONS.prod,
      currentVersion: "0.0.77",
      targetVersion: "0.0.79",
      ring,
      logger,
    })
    expect(notes.map((note) => note.version)).toEqual(["0.0.79"])
    expect(requested).toEqual([
      "https://api.github.com/repos/prashantbhudwal/buddy-releases/releases?per_page=100",
    ])
  })
}

test.each(["network", "http", "json", "shape"] as const)(
  "Beta notes discard partial results on a later-page %s failure",
  async (failure) => {
    globalThis.fetch = createTestFetch(async (url) => {
      if (!String(url).includes("&page=2")) {
        return Response.json(Array.from({ length: 100 }, () => release("beta-v1.1.0")))
      }
      if (failure === "network") throw new Error("offline")
      if (failure === "http") return new Response("unavailable", { status: 503 })
      if (failure === "json") return new Response("not JSON")
      return Response.json({ unexpected: "shape" })
    })
    expect(
      await fetchReleaseNotes({
        distribution: BUDDY_DISTRIBUTIONS.beta,
        currentVersion: "1.0.0",
        targetVersion: "1.1.0",
        ring: "preview",
        logger,
      }),
    ).toEqual([])
  },
)
