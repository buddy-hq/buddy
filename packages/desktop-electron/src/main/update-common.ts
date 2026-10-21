import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  requireUpdaterPublicKey,
  type BuddyDistribution,
} from "@buddy/script/distribution"
import {
  assertReleaseTag,
  formatReleaseTag,
  highestStreamReleaseVersion,
  isPublishedStreamRelease,
  parseReleaseTag,
} from "@buddy/script/release-stream"
import { verifySignedMessage } from "@buddy/script/minisign"
import { z } from "zod"
import type { UpdateRing } from "@buddy/update-contract"
import { parseWithSchema } from "../shared/parse-external"
import { UPDATE_RING_PREVIEW } from "@buddy/update-contract"

const SIGNATURE_SUFFIX = ".sig"
const GITHUB_RELEASES_API_ACCEPT_HEADER = "application/vnd.github+json"
const GITHUB_RELEASES_API_VERSION_HEADER = "2022-11-28"
const GITHUB_RELEASES_API_USER_AGENT = "Buddy-Updater"
const LATEST_PRERELEASE_SEARCH_LIMIT = 100
/** A release list longer than this is a misbehaving response; refuse rather than select from part of it. */
const MAX_RELEASE_LIST_PAGES = 50

/** Resolved once from the embedded build channel, never the process environment. */
export const UPDATE_DISTRIBUTION: BuddyDistribution =
  import.meta.env.BUDDY_CHANNEL === "beta" ? BUDDY_DISTRIBUTIONS.beta : BUDDY_DISTRIBUTIONS.prod

export const RELEASE_REPOSITORY = formatReleaseRepositorySlug(UPDATE_DISTRIBUTION)
export const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"

/** Missing distribution signing configuration, surfaced separately from network failures. */
export class UpdatesNotConfiguredError extends Error {
  constructor(distribution: BuddyDistribution, cause: unknown) {
    super(`${distribution.productName} updates are not configured.`, { cause })
    this.name = "UpdatesNotConfiguredError"
  }
}

/** Ambient overrides remain available for prod; Beta trusts only its embedded key. */
export function resolveUpdatePublicKeyOverride(
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string | undefined {
  return distribution.id === "beta"
    ? undefined
    : process.env[BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY]?.trim() || undefined
}

/** Require this distribution's verification key before any update discovery or content fetch. */
export function resolveUpdateVerificationPublicKey(
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
  explicitKey?: string,
): string {
  if (explicitKey !== undefined) return explicitKey
  try {
    return requireUpdaterPublicKey(distribution)
  } catch (cause) {
    throw new UpdatesNotConfiguredError(distribution, cause)
  }
}

type TGithubRelease = {
  draft: boolean
  prerelease: boolean
  tagName: string
}

const githubReleaseSchema = z.object({
  draft: z.boolean(),
  prerelease: z.boolean(),
  tag_name: z.string().min(1),
})

type VersionedReleaseAssetUrlInput = {
  distribution?: BuddyDistribution
  legacyFilename?: string
  primaryFilename: string
  version: string
}

export class SignedUpdateFetchError extends Error {
  readonly status: number
  readonly url: string

  constructor(input: { message: string; status: number; url: string }) {
    super(input.message)
    this.name = "SignedUpdateFetchError"
    this.status = input.status
    this.url = input.url
  }
}

export function resolveLatestReleaseAssetUrl(
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  return `https://github.com/${formatReleaseRepositorySlug(distribution)}/releases/latest/download/${filename}`
}

export function resolveReleaseDownloadBaseUrl(
  version: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  return resolveReleaseTagDownloadBaseUrl(formatReleaseTag(distribution, version), distribution)
}

export function resolveReleaseAssetUrl(
  version: string,
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  return resolveReleaseTagAssetUrl(formatReleaseTag(distribution, version), filename, distribution)
}

export function resolveVersionedReleaseAssetUrls(
  input: VersionedReleaseAssetUrlInput,
): readonly string[] {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  const primaryUrl = resolveReleaseAssetUrl(input.version, input.primaryFilename, distribution)
  if (
    distribution.id === "beta" ||
    !input.legacyFilename ||
    input.legacyFilename === input.primaryFilename
  ) {
    return [primaryUrl]
  }

  return [primaryUrl, resolveReleaseAssetUrl(input.version, input.legacyFilename, distribution)]
}

export function resolveReleaseTagDownloadBaseUrl(
  tag: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  if (distribution.id === "beta") assertReleaseTag(distribution, tag)
  return `https://github.com/${formatReleaseRepositorySlug(distribution)}/releases/download/${tag}/`
}

/** Whether an asset belongs to a versioned release in this distribution's namespace. */
export function isReleaseStreamAssetUrl(url: URL, distribution: BuddyDistribution): boolean {
  const prefix = `https://github.com/${formatReleaseRepositorySlug(distribution)}/releases/download/`
  if (!url.href.startsWith(prefix)) return false
  const [tag, filename] = url.href.slice(prefix.length).split("/")
  return tag !== undefined && parseReleaseTag(distribution, tag) !== undefined && !!filename
}

/** Resolve discovery assets while allowing manifests carried forward from older Beta tags. */
export function resolveReleaseStreamAssetUrl(
  version: string,
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  if (distribution.id === "prod") return resolveReleaseAssetUrl(version, filename, distribution)
  const url = new URL(filename, resolveReleaseDownloadBaseUrl(version, distribution))
  if (!isReleaseStreamAssetUrl(url, distribution)) {
    throw new Error("Beta update assets must belong to the Beta release repository and tag")
  }
  return url.toString()
}

export function resolveReleaseTagAssetUrl(
  tag: string,
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  if (distribution.id === "prod" && isAbsoluteUrl(filename)) return filename
  const baseUrl = resolveReleaseTagDownloadBaseUrl(tag, distribution)
  const url = new URL(filename, baseUrl)
  // Signed Beta manifests may carry absolute assets, but never another distribution's feed.
  if (distribution.id === "beta" && !url.href.startsWith(baseUrl)) {
    throw new Error("Beta update assets must belong to the Beta release repository and tag")
  }
  return url.toString()
}

export async function resolveLatestPreviewAssetUrl(
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): Promise<string> {
  const release = await fetchLatestGithubPreviewRelease(distribution)
  if (!release) {
    if (distribution.id === "beta") throw new Error("No numeric Beta release is available")
    return resolveLatestReleaseAssetUrl(filename, distribution)
  }

  return resolveReleaseTagAssetUrl(release.tagName, filename, distribution)
}

export async function resolveLatestRingAssetUrl(input: {
  distribution?: BuddyDistribution
  filename: string
  ring: UpdateRing
}): Promise<string> {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  if (distribution.id === "beta" || input.ring === UPDATE_RING_PREVIEW) {
    return await resolveLatestPreviewAssetUrl(input.filename, distribution)
  }

  return resolveLatestReleaseAssetUrl(input.filename, distribution)
}

/** Resolve Beta's newest release page, with a stream-filtered list when discovery fails. */
export async function resolveManualDownloadUrl(
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): Promise<string> {
  const baseUrl = `https://github.com/${formatReleaseRepositorySlug(distribution)}/releases`
  if (distribution.id === "prod") return `${baseUrl}/latest`
  const release = await fetchLatestGithubPreviewRelease(distribution).catch(() => undefined)
  if (release) return `${baseUrl}/tag/${release.tagName}`
  return `${baseUrl}?q=beta-v`
}

async function fetchLatestGithubPreviewRelease(
  distribution: BuddyDistribution,
): Promise<TGithubRelease | undefined> {
  const releases = await fetchGithubReleases(distribution)
  const latestVersion = highestStreamReleaseVersion(
    distribution,
    releases.map((release) => ({
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      tagName: release.tagName,
    })),
  )

  if (!latestVersion) return undefined
  const tag = formatReleaseTag(distribution, latestVersion)
  return releases.find(
    (release) =>
      !release.draft &&
      (release.tagName === tag ||
        (distribution.id === "prod" && release.tagName === latestVersion)) &&
      (distribution.id === "prod" ||
        isPublishedStreamRelease(distribution, {
          tagName: release.tagName,
          isDraft: release.draft,
          isPrerelease: release.prerelease,
        })),
  )
}

async function fetchGithubReleases(distribution: BuddyDistribution): Promise<TGithubRelease[]> {
  const releases: TGithubRelease[] = []
  for (let page = 1; ; page += 1) {
    if (page > MAX_RELEASE_LIST_PAGES) {
      throw new Error(`GitHub releases exceeded ${MAX_RELEASE_LIST_PAGES} pages`)
    }
    const pageQuery = page === 1 ? "" : `&page=${page}`
    const response = await fetch(
      `https://api.github.com/repos/${formatReleaseRepositorySlug(distribution)}/releases?per_page=${LATEST_PRERELEASE_SEARCH_LIMIT}${pageQuery}`,
      {
        headers: {
          Accept: GITHUB_RELEASES_API_ACCEPT_HEADER,
          "Cache-Control": "no-cache",
          "User-Agent": GITHUB_RELEASES_API_USER_AGENT,
          "X-GitHub-Api-Version": GITHUB_RELEASES_API_VERSION_HEADER,
        },
      },
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch GitHub releases: ${response.status} ${response.statusText}`)
    }

    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      throw new Error("GitHub releases response was not an array")
    }

    for (const item of body) {
      const release = parseGithubRelease(item)
      if (!release && distribution.id === "beta") {
        throw new Error("GitHub releases response contained an invalid release")
      }
      if (release) releases.push(release)
    }

    if (body.length < LATEST_PRERELEASE_SEARCH_LIMIT) return releases
  }
}

function parseGithubRelease<TValue>(value: TValue): TGithubRelease | undefined {
  const parsed = parseWithSchema(githubReleaseSchema, value)
  if (parsed === undefined) return undefined

  return {
    draft: parsed.draft,
    prerelease: parsed.prerelease,
    tagName: parsed.tag_name,
  }
}

export async function fetchSignedText(input: {
  distribution?: BuddyDistribution
  publicKey?: string
  url: string
}): Promise<string> {
  const distribution = input.distribution ?? UPDATE_DISTRIBUTION
  const publicKey = resolveUpdateVerificationPublicKey(distribution, input.publicKey)
  if (distribution.id === "beta" && !isReleaseStreamAssetUrl(new URL(input.url), distribution)) {
    throw new Error("Beta update assets must belong to the Beta release repository and tag")
  }
  const [contentResponse, signatureResponse] = await Promise.all([
    fetch(input.url, {
      headers: {
        Accept: "application/json, text/plain;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
    fetch(`${input.url}${SIGNATURE_SUFFIX}`, {
      headers: {
        Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
        "Cache-Control": "no-cache",
      },
    }),
  ])

  if (!contentResponse.ok) {
    throw new SignedUpdateFetchError({
      message: `Failed to fetch signed update content: ${contentResponse.status} ${contentResponse.statusText}`,
      status: contentResponse.status,
      url: input.url,
    })
  }

  if (!signatureResponse.ok) {
    throw new SignedUpdateFetchError({
      message: `Failed to fetch update signature: ${signatureResponse.status} ${signatureResponse.statusText}`,
      status: signatureResponse.status,
      url: `${input.url}${SIGNATURE_SUFFIX}`,
    })
  }

  const [contentText, signatureOuterText] = await Promise.all([
    contentResponse.text(),
    signatureResponse.text(),
  ])

  const verified = await verifySignedMessage({
    message: Buffer.from(contentText, "utf8"),
    publicKey,
    signatureFileText: decodeTauriSignatureOuterText(signatureOuterText),
  })

  if (!verified) {
    throw new Error("Signed update content verification failed")
  }

  return contentText
}

export async function fetchSignedElectronUpdateManifest(input: {
  distribution?: BuddyDistribution
  publicKey?: string
  url: string
}): Promise<{ content: string; version: string }> {
  const content = await fetchSignedText(input)
  const version = parseElectronUpdateManifestVersion(content)
  return {
    content,
    version,
  }
}

export function parseElectronUpdateManifestVersion(content: string): string {
  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("version:")) continue

    const version = trimmed
      .slice("version:".length)
      .trim()
      .replace(/^['"]|['"]$/gu, "")
    if (version.length > 0) {
      return version
    }
  }

  throw new Error("Signed update manifest is missing version")
}

export function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("https://") || value.startsWith("http://")
}

function decodeTauriSignatureOuterText(signatureOuterText: string): string {
  return Buffer.from(signatureOuterText.trim(), "base64").toString("utf8")
}
