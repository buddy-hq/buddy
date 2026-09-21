import { z } from "zod"
import type { UpdateReleaseNote, UpdateRing } from "@buddy/update-contract"
import { UPDATE_RING_PREVIEW } from "@buddy/update-contract"
import { MAX_RELEASE_NOTES, parseReleaseNote } from "@buddy/update-contract/release-notes"
import { RELEASE_REPOSITORY_OWNER, RELEASE_REPOSITORY_NAME } from "./update-common"
import { compareVersions } from "./recovery-policy-core"

const RELEASE_LIST_PAGE_SIZE = 20
const RELEASE_REQUEST_TIMEOUT_MS = 8_000
const RELEASE_TAG_PREFIX = "v"

const ReleaseBoundarySchema = z.object({
  tag_name: z.string(),
  html_url: z.url(),
  body: z.string().nullish(),
  draft: z.boolean().nullish(),
  prerelease: z.boolean().nullish(),
})
const ReleaseListBoundarySchema = z.array(ReleaseBoundarySchema)
const RELEASE_LIST_URL = `https://api.github.com/repos/${RELEASE_REPOSITORY_OWNER}/${RELEASE_REPOSITORY_NAME}/releases`

type ReleaseRecord = z.infer<typeof ReleaseBoundarySchema>

type LoggerLike = {
  warn: (...args: unknown[]) => void
}

/** Release-note failures are non-fatal because signed manifests authorize updates. */
export async function fetchReleaseNotes(input: {
  readonly currentVersion: string
  readonly targetVersion: string
  readonly ring: UpdateRing
  readonly logger: LoggerLike
}): Promise<readonly UpdateReleaseNote[]> {
  const releases = await fetchReleaseList(input.logger)

  const inRange = releases.filter((release) => {
    if (release.draft === true) return false
    if (release.prerelease === true && input.ring !== UPDATE_RING_PREVIEW) return false

    const version = releaseVersion(release.tag_name)
    return (
      compareVersions(version, input.currentVersion) > 0 &&
      compareVersions(version, input.targetVersion) <= 0
    )
  })

  return inRange
    .map((release) =>
      parseReleaseNote({
        version: releaseVersion(release.tag_name),
        body: release.body ?? "",
        url: release.html_url,
      }),
    )
    .filter((note) => note.items.length > 0)
    .slice(0, MAX_RELEASE_NOTES)
}

function releaseVersion(tagName: string): string {
  return tagName.startsWith(RELEASE_TAG_PREFIX) ? tagName.slice(RELEASE_TAG_PREFIX.length) : tagName
}

async function fetchReleaseList(logger: LoggerLike): Promise<readonly ReleaseRecord[]> {
  try {
    const response = await fetch(`${RELEASE_LIST_URL}?per_page=${RELEASE_LIST_PAGE_SIZE}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Buddy",
      },
      signal: AbortSignal.timeout(RELEASE_REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) {
      logger.warn("release notes request failed", { status: response.status })
      return []
    }

    const parsed = ReleaseListBoundarySchema.safeParse(await response.json())
    if (!parsed.success) {
      logger.warn("release notes response did not match the expected shape")
      return []
    }
    return parsed.data
  } catch (error) {
    logger.warn("release notes could not be read", error)
    return []
  }
}
