export type GithubReleaseVersion = {
  isDraft: boolean
  isPrerelease: boolean
  tagName: string
}

export type LatestReleaseVersionInput = {
  includePrereleases?: boolean
  skip?: string
}

function readSemverTag(tagName: string): string | undefined {
  const tag = tagName.replace(/^v/, "")
  if (!/^\d+\.\d+\.\d+$/.test(tag)) return undefined
  return tag
}

function compareSemverVersions(left: string, right: string): number {
  const leftParts = left.split(".").map((value) => Number.parseInt(value, 10))
  const rightParts = right.split(".").map((value) => Number.parseInt(value, 10))

  for (let index = 0; index < 3; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart !== rightPart) return leftPart - rightPart
  }

  return 0
}

export function latestReleaseVersionFromReleases(
  releases: readonly GithubReleaseVersion[],
  input: LatestReleaseVersionInput = {},
): string | undefined {
  const skipTag = input.skip?.replace(/^v/, "")
  let latest: string | undefined

  for (const release of releases) {
    if (release.isDraft) continue
    if (input.includePrereleases === false && release.isPrerelease) continue

    const tag = readSemverTag(release.tagName)
    if (!tag) continue
    if (skipTag && tag === skipTag) continue
    if (!latest || compareSemverVersions(tag, latest) > 0) {
      latest = tag
    }
  }

  return latest
}
