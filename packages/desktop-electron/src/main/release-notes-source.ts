import { z } from "zod"
import type { UpdateReleaseNote, UpdateRing } from "@buddy/update-contract"
import { UPDATE_RING_PREVIEW } from "@buddy/update-contract"
import { MAX_RELEASE_NOTES, parseReleaseNote } from "@buddy/update-contract/release-notes"
import { UPDATE_DISTRIBUTION } from "./update-common"
import { formatReleaseRepositorySlug, type BuddyDistribution } from "@buddy/script/distribution"
import {
  compareReleaseVersions,
  isPublishedStreamRelease,
  parseReleaseTag,
  readBetaReleaseBody,
} from "@buddy/script/release-stream"
import { compareVersions } from "./recovery-policy-core"

const RELEASE_LIST_PAGE_SIZE = 100
const PROD_RELEASE_LIST_MAX_PAGES = 3
const RELEASE_REQUEST_TIMEOUT_MS = 8_000

const ReleaseBoundarySchema = z.object({
  tag_name: z.string(),
  html_url: z.url(),
  body: z.string().nullish(),
  draft: z.boolean().nullish(),
  prerelease: z.boolean().nullish(),
})
const ReleaseListBoundarySchema = z.array(ReleaseBoundarySchema)

type ReleaseRecord = z.infer<typeof ReleaseBoundarySchema>

type LoggerLike = {
  warn: (...args: unknown[]) => void
}

/** Release-note failures are non-fatal because signed manifests authorize updates. */
export async function fetchReleaseNotes(input: {
  readonly distribution?: BuddyDistribution
  readonly currentVersion: string
  readonly targetVersion: string
  readonly ring: UpdateRing
  readonly logger: LoggerLike
}): Promise<readonly UpdateReleaseNote[]> {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  const notes: UpdateReleaseNote[] = []
  try {
    for (let page = 1; ; page += 1) {
      const pageQuery = page === 1 ? "" : `&page=${page}`
      const response = await fetch(
        `https://api.github.com/repos/${formatReleaseRepositorySlug(distribution)}/releases?per_page=${RELEASE_LIST_PAGE_SIZE}${pageQuery}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Buddy",
          },
          signal: AbortSignal.timeout(RELEASE_REQUEST_TIMEOUT_MS),
        },
      )
      if (!response.ok) {
        input.logger.warn("release notes request failed", { status: response.status })
        return distribution.id === "prod" ? notes.slice(0, MAX_RELEASE_NOTES) : []
      }

      const parsed = ReleaseListBoundarySchema.safeParse(await response.json())
      if (!parsed.success) {
        input.logger.warn("release notes response did not match the expected shape")
        return distribution.id === "prod" ? notes.slice(0, MAX_RELEASE_NOTES) : []
      }
      for (const release of parsed.data) {
        const note = readReleaseNote(release, distribution, input)
        if (note) notes.push(note)
      }
      if (parsed.data.length < RELEASE_LIST_PAGE_SIZE) break
      if (
        distribution.id === "prod" &&
        (notes.length >= MAX_RELEASE_NOTES || page >= PROD_RELEASE_LIST_MAX_PAGES)
      )
        break
    }
  } catch (error) {
    input.logger.warn("release notes could not be read", error)
    return distribution.id === "prod" ? notes.slice(0, MAX_RELEASE_NOTES) : []
  }

  if (distribution.id === "beta") {
    notes.sort((left, right) => compareReleaseVersions(right.version, left.version))
  }
  return notes.slice(0, MAX_RELEASE_NOTES)
}

function readReleaseNote(
  release: ReleaseRecord,
  distribution: BuddyDistribution,
  input: { currentVersion: string; targetVersion: string; ring: UpdateRing },
): UpdateReleaseNote | undefined {
  if (
    distribution.id === "beta" &&
    !isPublishedStreamRelease(distribution, {
      tagName: release.tag_name,
      isDraft: release.draft === true,
      isPrerelease: release.prerelease === true,
    })
  )
    return undefined
  if (release.draft === true) return undefined
  if (
    distribution.id === "prod" &&
    release.prerelease === true &&
    input.ring !== UPDATE_RING_PREVIEW
  )
    return undefined

  const version = parseReleaseTag(distribution, release.tag_name)
  const compare = distribution.id === "beta" ? compareReleaseVersions : compareVersions
  if (
    version === undefined ||
    compare(version, input.currentVersion) <= 0 ||
    compare(version, input.targetVersion) > 0
  )
    return undefined
  const body =
    distribution.id === "beta" ? readBetaReleaseBody(release.body ?? "") : (release.body ?? "")
  if (body === undefined) return undefined
  const note = parseReleaseNote({ version, body, url: release.html_url })
  return note.items.length > 0 ? note : undefined
}
