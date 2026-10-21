import { describe, expect, test } from "bun:test"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { formatBetaReleaseBody, formatReleaseTag } from "@buddy/script/release-stream"
import {
  parseReleaseNote,
  readInstalledStableReleaseNotes,
  resolveLatestReleaseAssetUrl,
  selectInstalledStablePreviewRelease,
} from "./installed-stable-readers"
import { betaReleases, REAL_SHARED_RELEASES, sharedRelease } from "./fixtures/shared-repository"

function asDraft(release: ReturnType<typeof sharedRelease>): ReturnType<typeof sharedRelease> {
  return { ...release, isDraft: true }
}

describe("frozen installed Stable readers", () => {
  test("Preview includes prereleases, accepts one optional v, compares numerically, and rejects other namespaces", () => {
    const releases = [
      sharedRelease({ tagName: "v0.0.9" }),
      sharedRelease({ tagName: "v0.0.10", isPrerelease: true }),
      sharedRelease({ tagName: "0.0.11", isPrerelease: true }),
      sharedRelease({ tagName: "v0.0.999", isDraft: true }),
      sharedRelease({ tagName: "beta-v999.0.0", isPrerelease: true }),
      ...["vv2.0.0", "v2.0.0-rc.1", "skill-artifacts", "bad"].map((tagName) =>
        sharedRelease({ tagName }),
      ),
    ]
    expect(selectInstalledStablePreviewRelease(releases, "v0.0.9")).toBe("0.0.11")
    expect(selectInstalledStablePreviewRelease(REAL_SHARED_RELEASES, "v0.0.79")).toBe("v0.0.79")
  })

  test("Preview requests only 100 visible releases, then falls back to GitHub latest", () => {
    const preview = sharedRelease({ tagName: "v0.0.80", isPrerelease: true })
    expect(selectInstalledStablePreviewRelease([...betaReleases(99), preview], "v0.0.79")).toBe(
      "v0.0.80",
    )
    expect(selectInstalledStablePreviewRelease([...betaReleases(100), preview], "v0.0.79")).toBe(
      "v0.0.79",
    )
    const drafts = betaReleases(105).map(asDraft)
    expect(selectInstalledStablePreviewRelease([...drafts, preview], "v0.0.79")).toBe("v0.0.80")
  })

  test("Stable updates and recovery retain the GitHub latest redirect", () => {
    expect(resolveLatestReleaseAssetUrl("latest-macos-arm64.json")).toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/latest-macos-arm64.json",
    )
    expect(resolveLatestReleaseAssetUrl("recovery-policy.json")).toBe(
      "https://github.com/prashantbhudwal/buddy-releases/releases/latest/download/recovery-policy.json",
    )
  })

  test("notes keep API order, the loose beta-v range quirk, exclusive current, and inclusive target", () => {
    const releases = [
      sharedRelease({ tagName: "v0.0.75", isPrerelease: true }),
      sharedRelease({ tagName: "v0.0.79" }),
      sharedRelease({ tagName: "beta-v900.0.76", isPrerelease: true, body: "- Visible Beta bug" }),
      sharedRelease({ tagName: "v0.0.74" }),
      sharedRelease({ tagName: "v0.0.80" }),
      sharedRelease({ tagName: "v0.0.77", isDraft: true }),
      sharedRelease({ tagName: "skill-artifacts" }),
    ]
    const input = { releases, currentVersion: "0.0.74", targetVersion: "0.0.79" }
    expect(
      readInstalledStableReleaseNotes({ ...input, ring: "preview" }).map((note) => note.version),
    ).toEqual(["0.0.75", "0.0.79", "beta-v900.0.76"])
    expect(
      readInstalledStableReleaseNotes({ ...input, ring: "stable" }).map((note) => note.version),
    ).toEqual(["0.0.79"])
  })

  test("notes drop empty parsed bodies and retain at most five notes in API order", () => {
    const releases = [
      sharedRelease({ tagName: "v0.0.78", body: "# Heading only" }),
      ...[79, 76, 77, 75, 74, 73].map((patch) =>
        sharedRelease({
          tagName: formatReleaseTag(BUDDY_DISTRIBUTIONS.prod, `0.0.${patch}`),
        }),
      ),
    ]
    const notes = readInstalledStableReleaseNotes({
      releases,
      currentVersion: "0.0.70",
      targetVersion: "0.0.79",
      ring: "preview",
    })
    expect(notes.map((note) => note.version)).toEqual([
      "0.0.79",
      "0.0.76",
      "0.0.77",
      "0.0.75",
      "0.0.74",
    ])
  })

  test("notes have one 20-record anonymous page, with drafts removed before the limit", () => {
    const note = sharedRelease({ tagName: "v0.0.79" })
    const pair = { currentVersion: "0.0.74", targetVersion: "0.0.79", ring: "preview" as const }
    expect(
      readInstalledStableReleaseNotes({ ...pair, releases: [...betaReleases(19), note] }).map(
        (item) => item.version,
      ),
    ).toEqual(["0.0.79"])
    expect(
      readInstalledStableReleaseNotes({ ...pair, releases: [...betaReleases(20), note] }),
    ).toEqual([])
    expect(
      readInstalledStableReleaseNotes({
        ...pair,
        releases: [...betaReleases(21).map(asDraft), note],
      }).map((item) => item.version),
    ).toEqual(["0.0.79"])
  })

  test.each([
    "-->\n- escaped comment breakout",
    "<li>Beta list</li>",
    "before<br>after</p>",
    "&gt; &lt; &amp; &#62; &#x3e;",
    "- [Beta link](https://example.com)\n# Beta heading",
    "--> <li>Beta</li><br></p> &gt; [link](https://example.com)\n## Heading\n- details",
  ])("formatted adversarial Beta notes yield zero frozen parser items: %s", (notes) => {
    expect(
      parseReleaseNote({
        version: "beta-v0.1.0",
        body: formatBetaReleaseBody(notes),
        url: "https://example.com",
      }),
    ).toEqual({
      version: "beta-v0.1.0",
      url: "https://example.com",
      items: [],
      totalItems: 0,
    })
  })

  test("frozen notes parser normalizes visible HTML/entities/markdown and deduplicates items", () => {
    expect(
      parseReleaseNote({
        version: "0.0.79",
        url: "https://example.com",
        body: "# Heading\n<li>**Hello** &amp; [world](https://example.com)</li>\n- hello & world\n<p>`Fix` by @author in https://example.com</p>",
      }),
    ).toEqual({
      version: "0.0.79",
      url: "https://example.com",
      items: ["Hello & world", "Fix"],
      totalItems: 2,
    })
  })
})
