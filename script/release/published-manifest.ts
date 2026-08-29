import { $ } from "bun"
import { z } from "zod"

const GITHUB_RELEASE_PAGE_SIZE = 100

const publishedReleaseSchema = z.object({
  assets: z.array(z.object({ name: z.string().min(1) })),
  draft: z.boolean(),
  published_at: z.string().nullable(),
  tag_name: z.string().min(1),
})

const publishedReleasePagesSchema = z.array(z.array(publishedReleaseSchema))
const releaseTagPattern = /^v(\d+)\.(\d+)\.(\d+)$/u

export type PublishedReleaseWithAssets = {
  assetNames: string[]
  publishedAt: string
  tag: string
}

function releaseVersionParts(tag: string): readonly [number, number, number] | undefined {
  const match = tag.match(releaseTagPattern)
  if (!match) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function compareReleaseTags(left: string, right: string): number {
  const leftParts = releaseVersionParts(left)
  const rightParts = releaseVersionParts(right)
  if (!leftParts || !rightParts) return 0
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function selectNewestPublishedReleaseWithAssets(input: {
  currentTag: string
  requiredAssetNames: readonly string[]
  value: unknown
}): PublishedReleaseWithAssets | undefined {
  const requiredNames = new Set(input.requiredAssetNames)
  return publishedReleasePagesSchema
    .parse(input.value)
    .flat()
    .filter(
      (release) =>
        !release.draft &&
        release.published_at !== null &&
        release.tag_name !== input.currentTag &&
        releaseVersionParts(release.tag_name) !== undefined &&
        [...requiredNames].every((name) => release.assets.some((asset) => asset.name === name)),
    )
    .map((release) => ({
      assetNames: release.assets.map((asset) => asset.name),
      publishedAt: release.published_at ?? "",
      tag: release.tag_name,
    }))
    .toSorted((left, right) => compareReleaseTags(right.tag, left.tag))[0]
}

export async function readNewestPublishedReleaseWithAssets(input: {
  currentTag: string
  repository: string
  requiredAssetNames: readonly string[]
}): Promise<PublishedReleaseWithAssets | undefined> {
  const response =
    await $`gh api --paginate --slurp --method GET ${`repos/${input.repository}/releases`} -f ${`per_page=${GITHUB_RELEASE_PAGE_SIZE}`}`
      .quiet()
      .json()
  return selectNewestPublishedReleaseWithAssets({ ...input, value: response })
}
