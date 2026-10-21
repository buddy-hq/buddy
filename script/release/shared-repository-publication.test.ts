import { describe, expect, test } from "bun:test"
import { formatBetaReleaseBody } from "@buddy/script/release-stream"
import { publishBetaToSharedRepository } from "./shared-repository-publication"
import { SharedReleaseGithubError, type ReleaseGithubCommand } from "./shared-repository-github"
import type { InstalledStableRelease } from "./installed-stable-readers"
import { betaReleases, REAL_SHARED_RELEASES, sharedRelease } from "./fixtures/shared-repository"

const repository = "prashantbhudwal/buddy-releases"
const tag = "beta-v0.1.0"

type GithubState = {
  releases: InstalledStableRelease[]
  latestTag: string
  published: boolean
  edits: string[][]
  publishedBodies: string[]
}

function apiRelease(release: InstalledStableRelease) {
  return {
    tag_name: release.tagName,
    draft: release.isDraft,
    prerelease: release.isPrerelease,
    body: release.body,
    html_url: release.url,
  }
}

function githubFixture(
  input: {
    releases?: readonly InstalledStableRelease[]
    body?: string
    afterPublication?: (state: GithubState) => void
    beforePublication?: (state: GithubState) => void
    releaseViewBodyAfterPublication?: string
    failVerification?: boolean
    failRollback?: boolean
    failPublishResponse?: boolean
    malformedPages?: boolean
  } = {},
) {
  const state: GithubState = {
    releases: [
      sharedRelease({
        tagName: tag,
        isDraft: true,
        body: input.body ?? formatBetaReleaseBody("- Beta improvement"),
      }),
      ...(input.releases ?? REAL_SHARED_RELEASES),
    ],
    latestTag: "v0.0.79",
    published: false,
    edits: [],
    publishedBodies: [],
  }
  const command: ReleaseGithubCommand = async (args) => {
    if (args[0] === "api" && args.includes(`repos/${repository}/releases?per_page=100`)) {
      if (!args.includes("--paginate") || !args.includes("--slurp")) {
        throw new Error("The full-list GitHub boundary requires pagination")
      }
      if (input.malformedPages) return { ok: true, value: "{}" }
      const records = state.releases.map(apiRelease)
      return { ok: true, value: JSON.stringify([records.slice(0, 100), records.slice(100)]) }
    }
    if (args[0] === "api" && args.includes(`repos/${repository}/releases/latest`)) {
      const latest = state.releases.find((release) => release.tagName === state.latestTag)
      if (!latest) throw new Error("Fake latest release is missing")
      return { ok: true, value: JSON.stringify(apiRelease(latest)) }
    }
    if (args[0] === "release" && args[1] === "view") {
      if (input.failVerification && state.published) {
        return {
          ok: false,
          error: new SharedReleaseGithubError("Read release", "simulated verification failure"),
        }
      }
      const release = state.releases.find((candidate) => candidate.tagName === args[2])
      if (!release) throw new Error(`Fake release not found: ${args[2]}`)
      return {
        ok: true,
        value: JSON.stringify(
          state.published && input.releaseViewBodyAfterPublication !== undefined
            ? { ...release, body: input.releaseViewBodyAfterPublication }
            : release,
        ),
      }
    }
    if (args[0] === "release" && args[1] === "edit") {
      state.edits.push([...args])
      if (args.includes("--draft=true")) {
        if (input.failRollback)
          return {
            ok: false,
            error: new SharedReleaseGithubError("Revert release", "simulated rollback failure"),
          }
        state.releases = state.releases.map((release) =>
          release.tagName === tag ? { ...release, isDraft: true } : release,
        )
        return { ok: true, value: "" }
      }
      if (
        !args.includes("--draft=false") ||
        !args.includes("--prerelease") ||
        !args.includes("--latest=false")
      ) {
        throw new Error("Unsafe Beta publish flags reached the GitHub boundary")
      }
      input.beforePublication?.(state)
      const notesFile = args[args.indexOf("--notes-file") + 1]
      if (!args.includes("--notes-file") || !notesFile)
        throw new Error("Beta publication must include the validated notes file")
      const body = await Bun.file(notesFile).text()
      state.publishedBodies.push(body)
      state.published = true
      state.releases = state.releases.map((release) =>
        release.tagName === tag
          ? { ...release, body, isDraft: false, isPrerelease: true }
          : release,
      )
      input.afterPublication?.(state)
      if (input.failPublishResponse)
        return {
          ok: false,
          error: new SharedReleaseGithubError(
            "Publish release",
            "response lost after remote publication",
          ),
        }
      return { ok: true, value: "" }
    }
    throw new Error(`Unexpected fake gh command: ${args.join(" ")}`)
  }
  return { state, command }
}

describe("publish.ts shared Beta publication boundary", () => {
  test("publishes a prerelease that is never latest and verifies the full repository afterward", async () => {
    const github = githubFixture()
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result.ok).toBe(true)
    expect(github.state.releases.find((release) => release.tagName === tag)).toMatchObject({
      isDraft: false,
      isPrerelease: true,
    })
    expect(github.state.latestTag).toBe("v0.0.79")
    const notesFile = github.state.edits[0]?.[7]
    expect(notesFile).toBeString()
    expect(github.state.edits).toEqual([
      [
        "release",
        "edit",
        tag,
        "--draft=false",
        "--prerelease",
        "--latest=false",
        "--notes-file",
        notesFile,
        "--repo",
        repository,
      ],
    ])
    expect(github.state.publishedBodies).toEqual([formatBetaReleaseBody("- Beta improvement")])
    if (!notesFile) throw new Error("Expected temporary notes file")
    expect(await Bun.file(notesFile).exists()).toBe(false)
  })

  test("publishes the validated body in the same edit even if the draft body changes after validation", async () => {
    const body = formatBetaReleaseBody("- Validated original notes\n- Preserve the exact body")
    const github = githubFixture({
      body,
      beforePublication(state) {
        state.releases = state.releases.map((release) =>
          release.tagName === tag ? { ...release, body: "Unchecked visible notes" } : release,
        )
      },
    })
    expect(await publishBetaToSharedRepository({ repository, tag }, github.command)).toMatchObject({
      ok: true,
    })
    expect(github.state.releases.find((release) => release.tagName === tag)?.body).toBe(body)
    expect(github.state.publishedBodies).toEqual([body])
  })

  test.each(["view-and-list", "list-only"] as const)(
    "reverts a different hidden post-publication body from %s",
    async (response) => {
      const body = formatBetaReleaseBody("- Validated notes")
      const github = githubFixture({
        body,
        releaseViewBodyAfterPublication: response === "list-only" ? body : undefined,
        afterPublication(state) {
          state.releases = state.releases.map((release) =>
            release.tagName === tag
              ? { ...release, body: formatBetaReleaseBody("- Different hidden notes") }
              : release,
          )
        },
      })
      const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
      expect(result).toMatchObject({ ok: false, revertedToDraft: true })
      if (result.ok) throw new Error("Expected body identity verification to fail")
      expect(result.errors).toContain(
        response === "list-only"
          ? `Published Beta ${tag} body in the full release list differs from the validated body`
          : `Published Beta ${tag} body differs from the validated body`,
      )
      expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(true)
    },
  )

  test("a verified frozen retry preserves an already published Beta", async () => {
    const github = githubFixture()
    github.state.releases = github.state.releases.map((release) =>
      release.tagName === tag ? { ...release, isDraft: false, isPrerelease: true } : release,
    )
    expect(await publishBetaToSharedRepository({ repository, tag }, github.command)).toMatchObject({
      ok: true,
    })
    expect(github.state.edits).toEqual([])
    expect(github.state.latestTag).toBe("v0.0.79")
  })

  test("refuses a planned visible Beta body before publishing", async () => {
    const github = githubFixture({ body: "- Visible Beta notes" })
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result).toMatchObject({ ok: false, revertedToDraft: false })
    if (result.ok) throw new Error("Expected planned publication to fail")
    expect(result.errors).toContain(
      "Beta beta-v0.1.0 has a visible body; use formatBetaReleaseBody",
    )
    expect(github.state.edits).toEqual([])
    expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(true)
  })

  test("refuses a publication that would push Preview off its first anonymous page", async () => {
    const github = githubFixture({
      releases: [
        ...betaReleases(99),
        sharedRelease({ tagName: "v0.0.80", isPrerelease: true }),
        sharedRelease({ tagName: "v0.0.79" }),
      ],
    })
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result).toMatchObject({ ok: false, revertedToDraft: false })
    if (result.ok) throw new Error("Expected installed Preview guard to fail")
    expect(result.errors.some((error) => error.includes("first 100 visible releases"))).toBe(true)
    expect(github.state.edits).toEqual([])
  })

  test.each(["stable", "preview"] as const)(
    "refuses to publish the Beta that would displace the offered %s note",
    async (ring) => {
      const stable = sharedRelease({
        tagName: "v0.0.79",
        body: ring === "stable" ? "- Stable note" : "",
      })
      const offered =
        ring === "stable"
          ? [stable]
          : [sharedRelease({ tagName: "v0.0.80", isPrerelease: true }), stable]
      const github = githubFixture({ releases: [...betaReleases(19), ...offered] })
      const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
      expect(result).toMatchObject({ ok: false, revertedToDraft: false })
      if (result.ok) throw new Error("Expected offered-note guard to block publication")
      expect(result.errors.some((error) => error.includes(`offered ${ring} release`))).toBe(true)
      expect(
        result.errors.every((error) =>
          error.includes("cut a Stable or Preview release before publishing more Beta releases"),
        ),
      ).toBe(true)
      expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(true)
      expect(github.state.publishedBodies).toEqual([])
    },
  )

  test.each(["visible-body", "misflagged", "latest", "unknown-tag"] as const)(
    "reverts Beta to draft when the post-publication guard fails: %s",
    async (failure) => {
      const github = githubFixture({
        afterPublication(state) {
          if (failure === "visible-body")
            state.releases = state.releases.map((release) =>
              release.tagName === tag ? { ...release, body: "Leaked notes" } : release,
            )
          if (failure === "misflagged")
            state.releases = state.releases.map((release) =>
              release.tagName === tag ? { ...release, isPrerelease: false } : release,
            )
          if (failure === "latest") state.latestTag = tag
          if (failure === "unknown-tag")
            state.releases.push(sharedRelease({ tagName: "unexpected" }))
        },
      })
      const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
      expect(result).toMatchObject({ ok: false, revertedToDraft: true })
      if (result.ok) throw new Error("Expected post-publication guard to fail")
      expect(result.errors.length).toBeGreaterThan(0)
      expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(true)
      expect(github.state.edits.at(-1)).toEqual([
        "release",
        "edit",
        tag,
        "--draft=true",
        "--repo",
        repository,
      ])
    },
  )

  test("full pagination detects a concurrent unsafe release beyond the first 100 records", async () => {
    const github = githubFixture({
      releases: [sharedRelease({ tagName: "v0.0.79" }), ...betaReleases(101)],
      afterPublication(state) {
        state.releases.push(
          sharedRelease({ tagName: "beta-v0.2.0", isPrerelease: false, body: "" }),
        )
      },
    })
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result).toMatchObject({ ok: false, revertedToDraft: true })
    if (result.ok) throw new Error("Expected full-list check to fail")
    expect(result.errors).toContain("Beta beta-v0.2.0 must be a pre-release")
  })

  test("verification I/O failures and ambiguous publish failures also compensate", async () => {
    for (const flags of [{ failVerification: true }, { failPublishResponse: true }]) {
      const github = githubFixture(flags)
      expect(
        await publishBetaToSharedRepository({ repository, tag }, github.command),
      ).toMatchObject({ ok: false, revertedToDraft: true })
      expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(true)
    }
  })

  test("rollback failure is explicit and publication still returns failure", async () => {
    const github = githubFixture({ failVerification: true, failRollback: true })
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result).toMatchObject({ ok: false, revertedToDraft: false })
    if (result.ok) throw new Error("Expected failed rollback to remain a failure")
    expect(result.errors.some((error) => error.startsWith("URGENT: could not revert"))).toBe(true)
    expect(github.state.releases.find((release) => release.tagName === tag)?.isDraft).toBe(false)
  })

  test("malformed GitHub records fail closed before publication", async () => {
    const github = githubFixture({ malformedPages: true })
    const result = await publishBetaToSharedRepository({ repository, tag }, github.command)
    expect(result).toMatchObject({ ok: false, revertedToDraft: false })
    expect(github.state.edits).toEqual([])
  })

  test("a prod tag never reaches the GitHub mutation boundary", async () => {
    const github = githubFixture()
    expect(
      await publishBetaToSharedRepository({ repository, tag: "v0.1.0" }, github.command),
    ).toEqual({
      ok: false,
      errors: ["Beta publication requires a beta-vX.Y.Z tag: v0.1.0"],
      revertedToDraft: false,
    })
    expect(github.state.edits).toEqual([])
  })
})
