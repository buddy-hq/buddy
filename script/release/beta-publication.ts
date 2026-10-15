import { $ } from "bun"
import { z } from "zod"
import { latestReleaseVersionFromReleases } from "@buddy/script/release-version"

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
  const value = await $`gh api --paginate --slurp ${`repos/${repository}/releases`}`.quiet().json()
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
  return latestReleaseVersionFromReleases(
    releases.map((release) => ({
      tagName: release.tag_name,
      isDraft: release.draft,
      isPrerelease: release.prerelease,
    })),
    { includePrereleases: true },
  )
}
