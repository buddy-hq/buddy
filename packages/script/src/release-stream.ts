import {
  BUDDY_DISTRIBUTIONS,
  type BuddyDistribution,
  type BuddyDistributionId,
} from "./distribution.ts"
import { latestReleaseVersionFromReleases, type GithubReleaseVersion } from "./release-version.ts"

/**
 * Stable (prod) and Beta publish into one assets repository, so a release's
 * tag alone decides which distribution owns it. Read and write releases only
 * through these helpers; never parse or build a release tag by hand.
 *
 * Installed Stable apps cannot be changed. They read GitHub's "latest" release
 * and, on the Preview ring, the highest `vX.Y.Z` tag. Beta therefore uses
 * `beta-vX.Y.Z`, is always a pre-release, and is never latest.
 */

const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/u
const RELEASE_TAG_PATTERNS = {
  prod: /^v(\d+\.\d+\.\d+)$/u,
  beta: /^beta-v(\d+\.\d+\.\d+)$/u,
} as const satisfies Record<BuddyDistributionId, RegExp>

export function formatReleaseTag(distribution: BuddyDistribution, version: string): string {
  if (!RELEASE_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid ${distribution.productName} release version: ${version}`)
  }
  return `${distribution.releaseTagPrefix}${version}`
}

/** The numeric version of a tag in this distribution's namespace, or undefined for any other tag. */
export function parseReleaseTag(distribution: BuddyDistribution, tag: string): string | undefined {
  return RELEASE_TAG_PATTERNS[distribution.id].exec(tag)?.[1]
}

/** Which distribution owns a tag; undefined for non-app tags such as `skill-artifacts`. */
export function releaseTagDistribution(tag: string): BuddyDistributionId | undefined {
  if (parseReleaseTag(BUDDY_DISTRIBUTIONS.prod, tag) !== undefined) return "prod"
  if (parseReleaseTag(BUDDY_DISTRIBUTIONS.beta, tag) !== undefined) return "beta"
  return undefined
}

/** Refuse to read or mutate a release outside the distribution's namespace. Returns its version. */
export function assertReleaseTag(distribution: BuddyDistribution, tag: string): string {
  const version = parseReleaseTag(distribution, tag)
  if (version === undefined) {
    throw new Error(
      `Release tag ${tag} does not belong to ${distribution.productName}; expected ${distribution.releaseTagPrefix}X.Y.Z`,
    )
  }
  return version
}

/** A tag, the numeric version it carries, and the distribution must all agree. */
export function assertReleaseTagVersion(
  distribution: BuddyDistribution,
  tag: string,
  version: string,
): void {
  const expected = formatReleaseTag(distribution, version)
  if (tag !== expected) {
    throw new Error(
      `Release tag ${tag} does not match ${distribution.productName} ${version}; expected ${expected}`,
    )
  }
}

/** A published release this distribution's clients and tooling may use. Beta is always a pre-release. */
export function isPublishedStreamRelease(
  distribution: BuddyDistribution,
  release: GithubReleaseVersion,
): boolean {
  if (release.isDraft) return false
  if (parseReleaseTag(distribution, release.tagName) === undefined) return false
  return distribution.id !== "beta" || release.isPrerelease
}

export function compareReleaseVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => BigInt(part))
  const rightParts = right.split(".").map((part) => BigInt(part))
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0n) - (rightParts[index] ?? 0n)
    if (difference !== 0n) return difference > 0n ? 1 : -1
  }
  return 0
}

/**
 * The highest published version in a distribution's stream.
 * Prod delegates to its existing selector unchanged; Beta counts only its own pre-releases.
 */
export function highestStreamReleaseVersion(
  distribution: BuddyDistribution,
  releases: readonly GithubReleaseVersion[],
  input: { includePrereleases?: boolean; skipVersion?: string } = {},
): string | undefined {
  if (distribution.id === "prod") {
    return latestReleaseVersionFromReleases(releases, {
      includePrereleases: input.includePrereleases,
      skip: input.skipVersion,
    })
  }
  let highest: string | undefined
  for (const release of releases) {
    if (!isPublishedStreamRelease(distribution, release)) continue
    const version = assertReleaseTag(distribution, release.tagName)
    if (version === input.skipVersion) continue
    if (highest === undefined || compareReleaseVersions(version, highest) > 0) highest = version
  }
  return highest
}

const BETA_NOTES_OPENING = "<!-- buddy-beta-release-notes"
const BETA_NOTES_CLOSING = "-->"
const BETA_RELEASE_BODY_PATTERN = /^<!-- buddy-beta-release-notes\n([\s\S]*?)\n-->\s*$/u

/**
 * Installed Stable apps show the body of every pre-release in range on the
 * Preview ring, so Beta notes live inside an HTML comment they strip entirely.
 * Escaping `&`, `<` and `>` keeps the comment unbroken for GitHub and for them.
 */
export function formatBetaReleaseBody(notes: string): string {
  const escaped = notes.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  return `${BETA_NOTES_OPENING}\n${escaped}\n${BETA_NOTES_CLOSING}\n`
}

/** Beta notes from a body written by `formatBetaReleaseBody`; undefined for any other body. */
export function readBetaReleaseBody(body: string): string | undefined {
  const escaped = BETA_RELEASE_BODY_PATTERN.exec(body.replaceAll("\r\n", "\n"))?.[1]
  if (escaped === undefined) return undefined
  return escaped.replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&")
}
