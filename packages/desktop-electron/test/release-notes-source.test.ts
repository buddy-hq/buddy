import { afterEach, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { fetchReleaseNotes } from "../src/main/release-notes-source"
import { createTestFetch } from "./helpers/fetch"

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test.each(["prod", "beta"] as const)("fetches %s release notes from its own repository with the correct prerelease policy", async (distribution) => {
  const requested: string[] = []
  globalThis.fetch = createTestFetch(async (url) => {
    requested.push(String(url))
    return Response.json([{ tag_name: "v1.1.0", html_url: "https://example.invalid/releases/v1.1.0", body: "- Improved notes", draft: false, prerelease: true }])
  })
  const notes = await fetchReleaseNotes({ distribution: BUDDY_DISTRIBUTIONS[distribution], currentVersion: "1.0.0", targetVersion: "1.1.0", ring: "stable", logger: { warn: () => undefined } })
  expect(requested).toEqual([`https://api.github.com/repos/prashantbhudwal/${distribution === "beta" ? "buddy-beta-releases" : "buddy-releases"}/releases?per_page=20`])
  expect(notes.map((note) => note.version)).toEqual(distribution === "beta" ? ["1.1.0"] : [])
})
