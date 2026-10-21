import { $ } from "bun"
import { z } from "zod"
import { BUDDY_DISTRIBUTIONS } from "@buddy/script/distribution"
import { formatBetaReleaseBody, highestStreamReleaseVersion } from "@buddy/script/release-stream"
import { RELEASE_FREEZE_FILENAME } from "./constants"
import { assertReleaseDestination } from "./distribution-guard"

/** Preserve frozen release bodies exactly; encode editable Beta notes once. */
export function resolveBetaDraftReleaseBody(input: {
  readonly notes: string
  readonly existingRelease:
    | {
        readonly body: string
        readonly assets: readonly { readonly name: string }[]
      }
    | undefined
}): string {
  if (input.existingRelease?.assets.some((asset) => asset.name === RELEASE_FREEZE_FILENAME)) {
    return input.existingRelease.body
  }
  return formatBetaReleaseBody(input.notes)
}

/** Equality permits a frozen retry; older versions may never move Beta latest backward. */
export function assertBetaVersionMovesForward(version: string, highest: string | undefined): void {
  const parts = version.split(".").map(BigInt)
  const previous = highest?.split(".").map(BigInt)
  if (!previous) return
  for (let index = 0; index < 3; index += 1) {
    const currentPart = parts[index]
    const previousPart = previous[index]
    if (currentPart === undefined || previousPart === undefined) {
      throw new Error("Beta versions must contain major, minor, and patch numbers")
    }
    if (currentPart > previousPart) return
    if (currentPart < previousPart) {
      throw new Error(
        `Beta ${version} is lower than published ${highest}; refusing to move latest backward`,
      )
    }
  }
}

export async function highestPublishedBetaVersion(repository: string): Promise<string | undefined> {
  assertReleaseDestination(repository, { BUDDY_CHANNEL: "beta" })
  const value = await $`gh api --paginate --slurp ${`repos/${repository}/releases?per_page=100`}`
    .quiet()
    .json()
  const releases = z
    .array(
      z.array(
        z.object({
          tag_name: z.string(),
          draft: z.boolean(),
          prerelease: z.boolean(),
        }),
      ),
    )
    .parse(value)
    .flat()
  return highestStreamReleaseVersion(
    BUDDY_DISTRIBUTIONS.beta,
    releases.map((release) => ({
      tagName: release.tag_name,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
    })),
    { includePrereleases: true },
  )
}
