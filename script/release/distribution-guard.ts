import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  formatSourceReleaseTag,
  isBuddyDistributionId,
  requireUpdaterPublicKey,
  type BuddyDistribution,
  type BuddyDistributionId,
} from "@buddy/script/distribution"
import { highestPublishedBetaVersion } from "./beta-publication"

/** Release commands default to prod; dev and unknown channels are never publishable. */
export function releaseDistribution(
  environment: NodeJS.ProcessEnv = process.env,
): BuddyDistribution {
  const channel = environment.BUDDY_CHANNEL?.trim() || "prod"
  if (!isBuddyDistributionId(channel)) {
    throw new Error(`Release channel must be prod or beta, received ${channel}`)
  }
  return BUDDY_DISTRIBUTIONS[channel]
}

/** Require the release source branch to match the selected distribution. */
export function assertReleaseBranch(branch: string, distribution: BuddyDistribution): void {
  if (branch !== distribution.releaseBranch) {
    throw new Error(
      `${distribution.id === "beta" ? "Beta releases" : "Preview release candidates"} must be cut from ${distribution.releaseBranch}, received '${branch}'`,
    )
  }
}

export function assertReleaseDestination(
  repository: string,
  environment: NodeJS.ProcessEnv = process.env,
): BuddyDistribution {
  const distribution = releaseDistribution(environment)
  const expected = formatReleaseRepositorySlug(distribution)
  for (const candidate of [repository, environment.BUDDY_RELEASE_REPO, environment.GH_REPO]) {
    if (candidate?.trim() && candidate.trim() !== expected) {
      throw new Error(
        `Release repository ${candidate.trim()} conflicts with ${distribution.id}; expected ${expected}`,
      )
    }
  }
  if (repository.trim() !== expected) throw new Error(`Release repository must be ${expected}`)
  return distribution
}

export function sourceReleaseTag(
  version: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error(`Invalid release version: ${version}`)
  return formatSourceReleaseTag(releaseDistribution(environment), version)
}

/** Prod records have no channel field, preserving their existing bytes and digest. */
export function releaseChannelIdentity(environment: NodeJS.ProcessEnv): { channel?: "beta" } {
  return releaseDistribution(environment).id === "beta" ? { channel: "beta" } : {}
}

export function assertReleaseRecordChannel(
  record: { channel?: "beta" },
  channel: BuddyDistributionId,
): void {
  if ((record.channel ?? "prod") !== channel) {
    throw new Error(`Release record channel ${record.channel ?? "prod"} conflicts with ${channel}`)
  }
}

export function assertLegacyProdRelease(environment: NodeJS.ProcessEnv = process.env): void {
  const distribution = releaseDistribution(environment)
  if (distribution.id !== "prod") throw new Error("Legacy direct uploads do not support beta")
  assertReleaseDestination(formatReleaseRepositorySlug(distribution), environment)
}

if (import.meta.main) {
  const distribution = assertReleaseDestination(formatReleaseRepositorySlug(releaseDistribution()))
  const publicKey = requireUpdaterPublicKey(distribution)
  const version = process.env.BUDDY_VERSION?.trim() ?? ""
  console.log(
    `Release destination: ${formatReleaseRepositorySlug(distribution)}; source tag: ${sourceReleaseTag(version)}; updater key: ${publicKey}`,
  )
  const targets = [
    process.env.BUDDY_RELEASE_TARGET_MACOS_ARM64,
    process.env.BUDDY_RELEASE_TARGET_MACOS_X64,
    process.env.BUDDY_RELEASE_TARGET_WINDOWS_X64,
  ]
  if (distribution.id === "beta" && targets.some((value) => value === "false")) {
    if (!(await highestPublishedBetaVersion(formatReleaseRepositorySlug(distribution)))) {
      throw new Error("The first Beta release requires all three targets")
    }
  }
  if (distribution.id === "prod") {
    for (const key of [
      "BUDDY_SKILLS_REPOSITORY_TOKEN",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY",
      "BUDDY_SKILL_SIGNING_PRIVATE_KEY_PASSWORD",
    ]) {
      if (!process.env[key]?.trim()) throw new Error(`${key} is required for prod`)
    }
  }
}
