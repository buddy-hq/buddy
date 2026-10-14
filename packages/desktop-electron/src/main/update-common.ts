import {
  BUDDY_DISTRIBUTIONS,
  formatReleaseRepositorySlug,
  requireUpdaterPublicKey,
  type BuddyDistribution,
} from "@buddy/script/distribution"
import { latestReleaseVersionFromReleases } from "@buddy/script/release-version"
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

/** Resolved once from the embedded build channel, never the process environment. */
export const UPDATE_DISTRIBUTION: BuddyDistribution =
  import.meta.env.BUDDY_CHANNEL === "beta" ? BUDDY_DISTRIBUTIONS.beta : BUDDY_DISTRIBUTIONS.prod

export const RELEASE_REPOSITORY_OWNER = UPDATE_DISTRIBUTION.releaseOwner
export const RELEASE_REPOSITORY_NAME = UPDATE_DISTRIBUTION.releaseRepository
export const RELEASE_REPOSITORY = formatReleaseRepositorySlug(UPDATE_DISTRIBUTION)
export const BUDDY_UPDATE_PUBLIC_KEY_ENV_KEY = "BUDDY_UPDATE_PUBLIC_KEY"
export const BUDDY_MINISIGN_PUBLIC_KEY = UPDATE_DISTRIBUTION.updaterPublicKey

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
  return resolveReleaseTagDownloadBaseUrl(`v${version}`, distribution)
}

export function resolveReleaseAssetUrl(
  version: string,
  filename: string,
  distribution: BuddyDistribution = UPDATE_DISTRIBUTION,
): string {
  return resolveReleaseTagAssetUrl(`v${version}`, filename, distribution)
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
  return `https://github.com/${formatReleaseRepositorySlug(distribution)}/releases/download/${tag}/`
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

async function fetchLatestGithubPreviewRelease(
  distribution: BuddyDistribution,
): Promise<TGithubRelease | undefined> {
  const releases = await fetchGithubReleases(distribution)
  const latestVersion = latestReleaseVersionFromReleases(
    releases.map((release) => ({
      isDraft: release.draft,
      isPrerelease: release.prerelease,
      tagName: release.tagName,
    })),
  )

  if (!latestVersion) return undefined
  return releases.find(
    (release) => !release.draft && release.tagName.replace(/^v/, "") === latestVersion,
  )
}

async function fetchGithubReleases(
  distribution: BuddyDistribution,
  page = 1,
): Promise<TGithubRelease[]> {
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

  const releases: TGithubRelease[] = []
  for (const item of body) {
    const release = parseGithubRelease(item)
    if (release) releases.push(release)
  }

  // Beta selects the highest version across its repository, including older publications.
  if (distribution.id === "beta" && body.length === LATEST_PRERELEASE_SEARCH_LIMIT) {
    releases.push(...(await fetchGithubReleases(distribution, page + 1)))
  }
  return releases
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
  const publicKey = resolveUpdateVerificationPublicKey(
    input.distribution ?? UPDATE_DISTRIBUTION,
    input.publicKey,
  )
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
