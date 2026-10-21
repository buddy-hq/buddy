import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { formatBetaReleaseBody, formatReleaseTag } from "@buddy/script/release-stream"
import type { InstalledStableRelease } from "../installed-stable-readers"
import releases from "./shared-releases.json"

/**
 * Read-only gh API snapshot, 2026-10-21: buddy-releases/releases?per_page=100.
 * API order and all flags retained (38 published, three drafts); asset metadata
 * omitted and bodies trimmed to their first three lines. Latest was v0.0.79.
 */
export const REAL_SHARED_RELEASES: readonly InstalledStableRelease[] = releases

/** A release fixture with independently supplied protocol flags and display body. */
export function sharedRelease(input: {
  readonly tagName: string
  readonly isDraft?: boolean
  readonly isPrerelease?: boolean
  readonly body?: string
}): InstalledStableRelease {
  return {
    tagName: input.tagName,
    isDraft: input.isDraft ?? false,
    isPrerelease: input.isPrerelease ?? false,
    body: input.body ?? "- Stable improvement",
    url: `https://github.com/prashantbhudwal/buddy-releases/releases/tag/${input.tagName}`,
  }
}

/** Distinct hidden Beta releases for exercising anonymous API page limits. */
export function betaReleases(count: number): readonly InstalledStableRelease[] {
  return Array.from({ length: count }, (_, index) =>
    sharedRelease({
      tagName: formatReleaseTag(BUDDY_DISTRIBUTIONS.beta, `99.0.${index}`),
      isPrerelease: true,
      body: formatBetaReleaseBody("- Beta-only improvement"),
    }),
  )
}
