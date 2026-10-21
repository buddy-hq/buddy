import { $ } from "bun"
import { z } from "zod"
import type { BuddyDistribution } from "@buddy/script/distribution"
import {
  assertReleaseTag,
  compareReleaseVersions,
  isPublishedStreamRelease,
} from "@buddy/script/release-stream"
import { assertReleaseTagDestination, releaseDistribution } from "./distribution-guard"

const GITHUB_RELEASE_PAGE_SIZE = 100

const publishedReleaseSchema = z.object({
  assets: z.array(z.object({ name: z.string().min(1) })),
  draft: z.boolean(),
  prerelease: z.boolean().default(false),
  published_at: z.string().nullable(),
  tag_name: z.string().min(1),
})

const publishedReleasePagesSchema = z.array(z.array(publishedReleaseSchema))

export type PublishedReleaseWithAssets = {
  assetNames: string[]
  publishedAt: string
  tag: string
}

export function selectNewestPublishedReleaseWithAssets(input: {
  distribution?: BuddyDistribution
  currentTag: string
  requiredAssetNames: readonly string[]
  value: unknown
}): PublishedReleaseWithAssets | undefined {
  const distribution = input.distribution ?? releaseDistribution()
  assertReleaseTag(distribution, input.currentTag)
  const requiredNames = new Set(input.requiredAssetNames)
  return publishedReleasePagesSchema
    .parse(input.value)
    .flat()
    .filter(
      (release) =>
        isPublishedStreamRelease(distribution, {
          tagName: release.tag_name,
          isDraft: release.draft,
          isPrerelease: release.prerelease,
        }) &&
        release.published_at !== null &&
        release.tag_name !== input.currentTag &&
        [...requiredNames].every((name) => release.assets.some((asset) => asset.name === name)),
    )
    .map((release) => ({
      assetNames: release.assets.map((asset) => asset.name),
      publishedAt: release.published_at ?? "",
      tag: release.tag_name,
    }))
    .toSorted((left, right) =>
      compareReleaseVersions(
        assertReleaseTag(distribution, right.tag),
        assertReleaseTag(distribution, left.tag),
      ),
    )[0]
}

export async function readNewestPublishedReleaseWithAssets(input: {
  environment?: NodeJS.ProcessEnv
  currentTag: string
  repository: string
  requiredAssetNames: readonly string[]
}): Promise<PublishedReleaseWithAssets | undefined> {
  const distribution = assertReleaseTagDestination(
    input.repository,
    input.currentTag,
    input.environment,
  )
  const response =
    await $`gh api --paginate --slurp --method GET ${`repos/${input.repository}/releases`} -f ${`per_page=${GITHUB_RELEASE_PAGE_SIZE}`}`
      .quiet()
      .json()
  return selectNewestPublishedReleaseWithAssets({ ...input, distribution, value: response })
}
