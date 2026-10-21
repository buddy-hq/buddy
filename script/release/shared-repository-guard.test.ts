import { describe, expect, test } from "bun:test"
import { formatBetaReleaseBody } from "@buddy/script/release-stream"
import {
  evaluatePlannedBetaPublication,
  evaluateSharedReleaseRepository,
} from "./shared-repository-guard"
import { betaReleases, REAL_SHARED_RELEASES, sharedRelease } from "./fixtures/shared-repository"

const stable = sharedRelease({ tagName: "v0.0.79" })
const preview = sharedRelease({ tagName: "v0.0.80", isPrerelease: true })
const beta = sharedRelease({
  tagName: "beta-v0.1.0",
  isPrerelease: true,
  body: formatBetaReleaseBody("- Beta only"),
})

describe("shared release repository guard", () => {
  test("the trimmed real repository and higher/equal numeric Beta versions preserve installed Preview selection", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: "v0.0.79",
      releases: [...betaReleases(8), { ...beta, tagName: "beta-v0.0.79" }, ...REAL_SHARED_RELEASES],
    })
    expect(report.errors).toEqual([])
  })

  test("a misflagged published Beta fails even when its notes are hidden", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [{ ...beta, isPrerelease: false }, stable],
    })
    expect(report.errors).toContain("Beta beta-v0.1.0 must be a pre-release")
  })

  test.each(["- Visible Beta notes", "# Visible heading", " "])(
    "a Beta body outside the formatter fails: %s",
    (body) => {
      const report = evaluateSharedReleaseRepository({
        latestTag: stable.tagName,
        releases: [{ ...beta, body }, stable],
      })
      expect(report.errors).toContain(
        "Beta beta-v0.1.0 has a visible body; use formatBetaReleaseBody",
      )
    },
  )

  test("a comment-shaped body that leaks through the frozen parser fails independently of decoding", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [{ ...beta, body: "<!-- buddy-beta-release-notes\n> Leak\n-->" }, stable],
    })
    expect(report.errors).toContain(
      "Beta beta-v0.1.0 exposes release-note items to installed Stable apps",
    )
  })

  test("a noncanonical body is refused even when the frozen parser happens to hide it", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [
        { ...beta, body: "<!-- buddy-beta-release-notes\n<li>Unescaped</li>\n-->" },
        stable,
      ],
    })
    expect(report.errors).toEqual([
      "Beta beta-v0.1.0 has a visible body; use formatBetaReleaseBody",
    ])
  })

  test("empty Beta bodies, known skill artifacts, and invisible malformed drafts are accepted", () => {
    expect(
      evaluateSharedReleaseRepository({
        latestTag: stable.tagName,
        releases: [
          { ...beta, body: "" },
          sharedRelease({ tagName: "skill-artifacts", body: "" }),
          sharedRelease({ tagName: "unknown-draft", isDraft: true }),
          {
            ...beta,
            tagName: "beta-v0.1.1",
            isDraft: true,
            isPrerelease: false,
            body: "Visible draft",
          },
          stable,
        ],
      }).errors,
    ).toEqual([])
  })

  test.each(["beta-v0.1.0", "v0.0.80", "skill-artifacts", "v0.0.999"])(
    "latest must be a published non-prerelease prod release: %s",
    (latestTag) => {
      const report = evaluateSharedReleaseRepository({
        latestTag,
        releases: [
          stable,
          preview,
          beta,
          sharedRelease({ tagName: "skill-artifacts", body: "" }),
          sharedRelease({ tagName: "v0.0.999", isDraft: true }),
        ],
      })
      expect(report.errors.some((error) => error.startsWith("GitHub latest must be"))).toBe(true)
    },
  )

  test.each(["0.0.79", "v0.0.79-rc.1", "beta-v0.1.0-rc.1", "vv1.0.0", "other-artifacts"])(
    "unknown visible tags fail closed: %s",
    (tagName) => {
      const report = evaluateSharedReleaseRepository({
        latestTag: stable.tagName,
        releases: [stable, sharedRelease({ tagName })],
      })
      expect(
        report.errors.some((error) => error.startsWith(`Unknown visible release tag ${tagName};`)),
      ).toBe(true)
    },
  )

  test("the Preview boundary is 100 visible records; a Preview release at 101 fails", () => {
    const releases = [
      { ...preview, body: "" },
      { ...stable, body: "" },
    ]
    expect(
      evaluateSharedReleaseRepository({
        latestTag: stable.tagName,
        releases: [...betaReleases(99), ...releases],
      }).errors,
    ).toEqual([])
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [...betaReleases(100), ...releases],
    })
    expect(report.errors).toContain(
      "Beta releases change installed Stable Preview selection from v0.0.80 to v0.0.79 in the first 100 visible releases",
    )
  })

  test("full-list checks include misflagged Beta and unknown releases beyond installed page limits", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [
        stable,
        ...betaReleases(101),
        { ...beta, isPrerelease: false },
        sharedRelease({ tagName: "surprise" }),
      ],
    })
    expect(report.errors).toContain("Beta beta-v0.1.0 must be a pre-release")
    expect(
      report.errors.some((error) => error.startsWith("Unknown visible release tag surprise;")),
    ).toBe(true)
  })

  test.each(["stable", "preview"] as const)(
    "19 Betas preserve the offered %s note; the twentieth blocks publication",
    (ring) => {
      const offered = ring === "stable" ? [stable] : [preview, { ...stable, body: "" }]
      expect(
        evaluateSharedReleaseRepository({
          latestTag: stable.tagName,
          releases: [...betaReleases(19), ...offered],
        }).errors,
      ).toEqual([])
      const report = evaluateSharedReleaseRepository({
        latestTag: stable.tagName,
        releases: [...betaReleases(20), ...offered],
      })
      expect(
        report.errors.some((error) =>
          error.includes(`offered ${ring} release ${offered[0]?.tagName}'s own note`),
        ),
      ).toBe(true)
      expect(
        report.errors.every((error) =>
          error.includes("cut a Stable or Preview release before publishing more Beta releases"),
        ),
      ).toBe(true)
    },
  )

  test("catch-up note displacement only warns while the offered note stays visible", () => {
    const report = evaluateSharedReleaseRepository({
      latestTag: stable.tagName,
      releases: [stable, ...betaReleases(19), sharedRelease({ tagName: "v0.0.78" })],
    })
    expect(report.errors).toEqual([])
    expect(report.displacedNotes).toBe(1)
    expect(report.affectedNotesPairs).toBeGreaterThan(0)
    expect(report.warnings).toEqual([
      `Beta releases displace 1 Stable release note(s) across ${report.affectedNotesPairs} representative (current, target, ring) pairs in the first 20 visible releases`,
    ])
  })

  test("the real repository plus one planned Beta preserves the offered release notes", () => {
    expect(
      evaluatePlannedBetaPublication(
        { latestTag: stable.tagName, releases: REAL_SHARED_RELEASES },
        { ...beta, isDraft: true },
      ).errors,
    ).toEqual([])
  })

  test("planned publication inserts the actual body as a published prerelease at the worst-case index", () => {
    const draft = { ...beta, isDraft: true, isPrerelease: false }
    const releases = [{ ...preview, body: "" }, { ...stable, body: "" }, draft]
    const safe = { latestTag: stable.tagName, releases: [...betaReleases(98), ...releases] }
    const unsafe = { latestTag: stable.tagName, releases: [...betaReleases(99), ...releases] }
    expect(evaluatePlannedBetaPublication(safe, draft).errors).toEqual([])
    expect(evaluatePlannedBetaPublication(unsafe, draft).errors).toContain(
      "Beta releases change installed Stable Preview selection from v0.0.80 to v0.0.79 in the first 100 visible releases",
    )
    expect(
      evaluatePlannedBetaPublication(safe, { ...draft, body: "Visible planned notes" }).errors,
    ).toContain("Beta beta-v0.1.0 has a visible body; use formatBetaReleaseBody")
    expect(draft.isDraft).toBe(true)
  })

  test("planned Beta publication refuses a prod namespace tag", () => {
    expect(
      evaluatePlannedBetaPublication({ latestTag: stable.tagName, releases: [stable] }, preview)
        .errors,
    ).toContain("Planned Beta tag v0.0.80 must belong to beta-vX.Y.Z")
  })
})
