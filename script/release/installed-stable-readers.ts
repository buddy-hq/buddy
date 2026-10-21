/**
 * Frozen reader models for installed Stable binaries. NEVER fix, modernize, or
 * replace these algorithms with current helpers: their quirks model binaries
 * which cannot be updated. Only the I/O boundary is supplied as pure input.
 */

/** Release fields needed to simulate anonymous installed Stable clients. */
export type InstalledStableRelease = {
  readonly tagName: string
  readonly isDraft: boolean
  readonly isPrerelease: boolean
  readonly body: string
  readonly url: string
}

/** The release-note shape shipped in v0.0.79 (update-state.ts:13–18). */
type UpdateReleaseNote = {
  readonly version: string
  readonly url: string
  readonly items: readonly string[]
  readonly totalItems: number
}

const UPDATE_RING_PREVIEW = "preview"
const RELEASE_TAG_PREFIX = "v"
const RELEASE_REPOSITORY = "prashantbhudwal/buddy-releases"

// Frozen v0.0.79: packages/script/src/release-version.ts:1–51.
// Shared by installed Preview readers v0.0.48–v0.0.79; never fix these copies.
type GithubReleaseVersion = {
  isDraft: boolean
  isPrerelease: boolean
  tagName: string
}

type LatestReleaseVersionInput = {
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

function latestReleaseVersionFromReleases(
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

/**
 * Frozen v0.0.79: packages/desktop-electron/src/main/update-common.ts:85–159.
 * Models ONE unauthenticated /releases?per_page=100 request, including fallback
 * to /releases/latest. Never fix this installed v0.0.48–v0.0.79 behavior.
 */
export function selectInstalledStablePreviewRelease(
  releases: readonly InstalledStableRelease[],
  latestTag: string,
): string {
  const page = releases.filter((release) => !release.isDraft).slice(0, 100)
  const latestVersion = latestReleaseVersionFromReleases(page)
  if (!latestVersion) return latestTag
  return (
    page.find((release) => !release.isDraft && release.tagName.replace(/^v/, "") === latestVersion)
      ?.tagName ?? latestTag
  )
}

/**
 * Frozen v0.0.79: packages/desktop-electron/src/main/update-common.ts:50–52,94–103;
 * recovery-policy.ts:32–36. Stable and recovery use GitHub's latest redirect,
 * never a locally sorted release list. Never fix this installed behavior.
 */
export function resolveLatestReleaseAssetUrl(filename: string): string {
  return `https://github.com/${RELEASE_REPOSITORY}/releases/latest/download/${filename}`
}

// Frozen v0.0.79: packages/desktop-electron/src/main/recovery-policy-core.ts:170–190.
// The NaN→0 conversion is significant for beta-v tags. Never fix it.
function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left)
  const rightParts = versionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0
    const rightPart = rightParts[index] ?? 0
    if (leftPart < rightPart) return -1
    if (leftPart > rightPart) return 1
  }

  return 0
}

function versionParts(version: string): number[] {
  return version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

/**
 * Frozen v0.0.79: packages/desktop-electron/src/main/release-notes-source.ts:8,29–67.
 * Identical reader in v0.0.74–v0.0.79. Models ONE anonymous 20-record page;
 * the filtering, API order, loose version range, and five-note cap must not change.
 */
export function readInstalledStableReleaseNotes(input: {
  readonly releases: readonly InstalledStableRelease[]
  readonly currentVersion: string
  readonly targetVersion: string
  readonly ring: "stable" | "preview"
}): readonly UpdateReleaseNote[] {
  const releases = input.releases
    .filter((release) => !release.isDraft)
    .slice(0, 20)
    .map((release) => ({
      tag_name: release.tagName,
      html_url: release.url,
      body: release.body,
      draft: release.isDraft,
      prerelease: release.isPrerelease,
    }))

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

// Frozen v0.0.79: packages/update-contract/src/release-notes.ts:3–108.
// Exact parser copy for installed v0.0.74–v0.0.79; never fix it.
const MAX_RELEASE_NOTE_ITEMS = 8

const MAX_RELEASE_NOTE_ITEM_LENGTH = 220

const MAX_RELEASE_NOTES = 5

const HTML_ENTITIES = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", '"'],
])

const MAX_CODE_POINT = 0x10ffff
const ENTITY_PATTERN = /&([a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/gu
const BLOCK_TAG_PATTERN = /<\/(?:p|div|li|h[1-6]|ul|ol|blockquote)>/giu
const LIST_TAG_PATTERN = /<li\b[^>]*>/giu
const BREAK_TAG_PATTERN = /<br\s*\/?>/giu
const TAG_PATTERN = /<[^>]*>/gu
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\([^)]+\)/gu
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`\n]+)`/gu
const MARKDOWN_STRONG_ASTERISK_PATTERN = /\*\*([^*\n]+)\*\*/gu
const MARKDOWN_STRONG_UNDERSCORE_PATTERN = /(?<!\w)__([^_\n]+)__(?!\w)/gu
const MARKDOWN_EMPHASIS_ASTERISK_PATTERN = /\*([^*\n]+)\*/gu
const MARKDOWN_EMPHASIS_UNDERSCORE_PATTERN = /(?<!\w)_([^_\n]+)_(?!\w)/gu
const BULLET_PREFIX_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+/u
const HEADING_PREFIX_PATTERN = /^\s*#{1,6}\s+/u
const TRAILING_ATTRIBUTION_PATTERN = /\s+by\s+@[\w-]+(?:\s+in\s+\S+)?\s*$/iu
const WHITESPACE_PATTERN = /\s+/gu

/**
 * Release bodies are untrusted display text, so normalize them rather than
 * rendering their markup.
 */
export function parseReleaseNote(input: {
  readonly version: string
  readonly body: string
  readonly url: string
}): UpdateReleaseNote {
  const lines = stripMarkup(input.body)
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0)

  const unique: string[] = []
  const seen = new Set<string>()
  for (const line of lines) {
    const key = line.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(truncate(line))
  }

  return {
    version: input.version,
    url: input.url,
    items: unique.slice(0, MAX_RELEASE_NOTE_ITEMS),
    totalItems: unique.length,
  }
}

function decodeEntity(entity: string): string {
  const named = HTML_ENTITIES.get(entity)
  if (named !== undefined) return named

  const codePoint = entity.startsWith("#x")
    ? Number.parseInt(entity.slice(2), 16)
    : entity.startsWith("#")
      ? Number.parseInt(entity.slice(1), 10)
      : Number.NaN
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) {
    return `&${entity};`
  }
  return String.fromCodePoint(codePoint)
}

function stripMarkup(body: string): string {
  return body
    .replace(BREAK_TAG_PATTERN, "\n")
    .replace(LIST_TAG_PATTERN, "\n")
    .replace(BLOCK_TAG_PATTERN, "\n")
    .replace(TAG_PATTERN, "")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(ENTITY_PATTERN, (_match, entity: string) => decodeEntity(entity))
}

function normalizeLine(line: string): string {
  if (HEADING_PREFIX_PATTERN.test(line)) return ""
  return line
    .replace(BULLET_PREFIX_PATTERN, "")
    .replace(MARKDOWN_INLINE_CODE_PATTERN, "$1")
    .replace(MARKDOWN_STRONG_ASTERISK_PATTERN, "$1")
    .replace(MARKDOWN_STRONG_UNDERSCORE_PATTERN, "$1")
    .replace(MARKDOWN_EMPHASIS_ASTERISK_PATTERN, "$1")
    .replace(MARKDOWN_EMPHASIS_UNDERSCORE_PATTERN, "$1")
    .replace(TRAILING_ATTRIBUTION_PATTERN, "")
    .replace(WHITESPACE_PATTERN, " ")
    .trim()
}

function truncate(item: string): string {
  if (item.length <= MAX_RELEASE_NOTE_ITEM_LENGTH) return item
  return `${item.slice(0, MAX_RELEASE_NOTE_ITEM_LENGTH - 1).trimEnd()}…`
}
