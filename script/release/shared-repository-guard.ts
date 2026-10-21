#!/usr/bin/env bun

import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import {
  formatBetaReleaseBody,
  parseReleaseTag,
  readBetaReleaseBody,
  releaseTagDistribution,
} from "@buddy/script/release-stream"
import {
  parseReleaseNote,
  readInstalledStableReleaseNotes,
  selectInstalledStablePreviewRelease,
  type InstalledStableRelease,
} from "./installed-stable-readers"
import { readSharedReleaseRepository } from "./shared-repository-github"

/** Authenticated API order plus GitHub's independently resolved latest release. */
export type SharedReleaseRepository = {
  readonly releases: readonly InstalledStableRelease[]
  readonly latestTag: string
}

/** Blocking installed-client regressions and accepted cosmetic note displacement. */
export type SharedRepositoryGuardReport = {
  readonly errors: readonly string[]
  readonly warnings: readonly string[]
  readonly displacedNotes: number
  readonly affectedNotesPairs: number
}

/** Check the repository against the frozen readers used by installed Stable apps. */
export function evaluateSharedReleaseRepository(
  input: SharedReleaseRepository,
): SharedRepositoryGuardReport {
  const errors: string[] = []
  const warnings: string[] = []
  const visible = input.releases.filter((release) => !release.isDraft)
  const latest = visible.find((release) => release.tagName === input.latestTag)
  if (!latest || releaseTagDistribution(input.latestTag) !== "prod" || latest.isPrerelease) {
    errors.push(
      `GitHub latest must be a published, non-prerelease prod vX.Y.Z release; received ${input.latestTag}`,
    )
  }

  for (const release of visible) {
    const distribution = releaseTagDistribution(release.tagName)
    if (distribution === undefined && release.tagName !== "skill-artifacts") {
      errors.push(
        `Unknown visible release tag ${release.tagName}; expected vX.Y.Z, beta-vX.Y.Z, or skill-artifacts`,
      )
    }
    if (distribution !== "beta") continue
    if (!release.isPrerelease) {
      errors.push(`Beta ${release.tagName} must be a pre-release`)
    }
    const betaNotes = readBetaReleaseBody(release.body)
    if (
      release.body.length > 0 &&
      (betaNotes === undefined ||
        formatBetaReleaseBody(betaNotes).trimEnd() !==
          release.body.replaceAll("\r\n", "\n").trimEnd())
    ) {
      errors.push(`Beta ${release.tagName} has a visible body; use formatBetaReleaseBody`)
    }
    const frozenNote = parseReleaseNote({
      version: release.tagName,
      body: release.body,
      url: release.url,
    })
    if (frozenNote.items.length > 0) {
      errors.push(`Beta ${release.tagName} exposes release-note items to installed Stable apps`)
    }
  }

  const withoutBeta = visible.filter(
    (release) => releaseTagDistribution(release.tagName) !== "beta",
  )
  const actualPreview = selectInstalledStablePreviewRelease(visible, input.latestTag)
  const expectedPreview = selectInstalledStablePreviewRelease(withoutBeta, input.latestTag)
  if (actualPreview !== expectedPreview) {
    errors.push(
      `Beta releases change installed Stable Preview selection from ${expectedPreview} to ${actualPreview} in the first 100 visible releases`,
    )
  }

  for (const [ring, tag] of [
    ["preview", expectedPreview],
    ["stable", input.latestTag],
  ] as const) {
    const targetVersion = parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, tag)
    if (targetVersion === undefined) continue
    const pair = { currentVersion: "0.0.40", targetVersion, ring }
    const expected = readInstalledStableReleaseNotes({ ...pair, releases: withoutBeta })
    const actual = readInstalledStableReleaseNotes({ ...pair, releases: visible })
    const targetNote = expected.find((note) => note.version === targetVersion)
    if (
      targetNote &&
      !actual.some((note) => note.version === targetNote.version && note.url === targetNote.url)
    ) {
      errors.push(
        `Beta releases displace the offered ${ring} release ${tag}'s own note from installed Stable apps' first 20 visible releases; cut a Stable or Preview release before publishing more Beta releases`,
      )
    }
  }

  const targets = new Set(
    withoutBeta.flatMap((release) => {
      const version = parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, release.tagName)
      return version === undefined ? [] : [version]
    }),
  )
  const displaced = new Set<string>()
  let affectedNotesPairs = 0
  for (const currentVersion of ["0.0.40", "0.0.48", "0.0.74", "0.0.79"]) {
    for (const targetVersion of targets) {
      for (const ring of ["stable", "preview"] as const) {
        const pair = { currentVersion, targetVersion, ring }
        const actual = readInstalledStableReleaseNotes({ ...pair, releases: visible })
        const expected = readInstalledStableReleaseNotes({ ...pair, releases: withoutBeta })
        if (JSON.stringify(actual) === JSON.stringify(expected)) continue
        affectedNotesPairs += 1
        for (const note of expected) {
          if (
            !actual.some(
              (candidate) => candidate.version === note.version && candidate.url === note.url,
            )
          ) {
            displaced.add(`${note.version}:${note.url}`)
          }
        }
      }
    }
  }
  if (affectedNotesPairs > 0) {
    warnings.push(
      `Beta releases displace ${displaced.size} Stable release note(s) across ${affectedNotesPairs} representative (current, target, ring) pairs in the first 20 visible releases`,
    )
  }
  return { errors, warnings, displacedNotes: displaced.size, affectedNotesPairs }
}

/** Model publication at index zero, the worst case for installed-client page limits. */
export function evaluatePlannedBetaPublication(
  input: SharedReleaseRepository,
  release: InstalledStableRelease,
): SharedRepositoryGuardReport {
  const report = evaluateSharedReleaseRepository({
    latestTag: input.latestTag,
    releases: [
      { ...release, isDraft: false, isPrerelease: true },
      ...input.releases.filter((candidate) => candidate.tagName !== release.tagName),
    ],
  })
  if (releaseTagDistribution(release.tagName) === "beta") return report
  return {
    ...report,
    errors: [`Planned Beta tag ${release.tagName} must belong to beta-vX.Y.Z`, ...report.errors],
  }
}

if (import.meta.main) {
  const repository = Bun.argv[2] ?? "prashantbhudwal/buddy-releases"
  const snapshot = await readSharedReleaseRepository(repository)
  if (!snapshot.ok) {
    console.error(snapshot.error.message)
    process.exitCode = 1
  } else {
    const report = evaluateSharedReleaseRepository(snapshot.value)
    for (const warning of report.warnings) console.warn(`WARNING: ${warning}`)
    for (const error of report.errors) console.error(`ERROR: ${error}`)
    process.exitCode = report.errors.length > 0 ? 1 : 0
    if (report.errors.length === 0) {
      console.log(`Shared release repository is safe for installed Stable readers: ${repository}`)
    }
  }
}
