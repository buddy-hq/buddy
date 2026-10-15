import { BUDDY_BRANDING } from "./branding.ts"
import type { BuddyReleaseChannel } from "./channel.ts"

/**
 * A distribution is a separately installable, separately updated Buddy app.
 * Prod (Stable + Preview rings) and Beta never share an app identity, a URL
 * scheme, a releases repository, a signing key, or on-disk state.
 */
export type BuddyDistributionId = Exclude<BuddyReleaseChannel, "dev">

export type BuddyDistribution = {
  id: BuddyDistributionId
  productName: string
  appId: string
  /** URL scheme registered with the OS, without `://`. */
  protocol: string
  /** `extraMetadata.name`; electron-updater derives its Windows cache directory from it. */
  packageName: string | undefined
  releaseOwner: string
  releaseRepository: string
  /** Source branch required for release cuts and workflow dispatches. */
  releaseBranch: string
  /** Prefix for source-repository provenance tags; release-repo tags stay `vX.Y.Z`. */
  sourceTagPrefix: string
  /**
   * Minisign public key for update manifests and recovery policy.
   * `null` means no key is provisioned yet: updates and publishing must fail
   * closed. Never fall back to another distribution's key.
   */
  updaterPublicKey: string | null
}

const RELEASE_OWNER = "prashantbhudwal"

export const BUDDY_DISTRIBUTIONS = {
  prod: {
    id: "prod",
    productName: BUDDY_BRANDING.productName,
    appId: "ai.buddy.desktop",
    protocol: BUDDY_BRANDING.appProtocol,
    packageName: undefined,
    releaseOwner: RELEASE_OWNER,
    releaseRepository: "buddy-releases",
    releaseBranch: "main",
    sourceTagPrefix: "v",
    updaterPublicKey: "RWTcBSYzKsK7Gf1M2w9kTDB2fvSRlsZejPWt+AaMGvGiNk3mxAW+Wh3f",
  },
  beta: {
    id: "beta",
    productName: "Buddy Beta",
    appId: "ai.buddy.desktop.beta",
    protocol: "buddy-beta",
    packageName: "buddy-desktop-beta",
    releaseOwner: RELEASE_OWNER,
    releaseRepository: "buddy-beta-releases",
    releaseBranch: "beta",
    sourceTagPrefix: "beta-v",
    updaterPublicKey: null,
  },
} as const satisfies Record<BuddyDistributionId, BuddyDistribution>

export function isBuddyDistributionId(value: string | undefined): value is BuddyDistributionId {
  return value === "prod" || value === "beta"
}

/** Dev builds are not a distribution: they are never packaged for release or updated. */
export function resolveBuddyDistribution(channel: BuddyReleaseChannel): BuddyDistribution | undefined {
  return channel === "dev" ? undefined : BUDDY_DISTRIBUTIONS[channel]
}

export function formatReleaseRepositorySlug(distribution: BuddyDistribution): string {
  return `${distribution.releaseOwner}/${distribution.releaseRepository}`
}

export function formatSourceReleaseTag(distribution: BuddyDistribution, version: string): string {
  return `${distribution.sourceTagPrefix}${version}`
}

export function requireUpdaterPublicKey(distribution: BuddyDistribution): string {
  if (distribution.updaterPublicKey === null) {
    throw new Error(
      `${distribution.productName} has no updater public key provisioned; refusing to sign, verify, or publish updates.`,
    )
  }
  return distribution.updaterPublicKey
}
